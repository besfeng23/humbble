-- P2-02: discovery, swipe, match, conversation, messaging, and block domain.
-- Security contract:
--   * Client writes to swipes/quotas/matches/conversations/participants are denied.
--     The later record_swipe RPC is the only application path for a swipe.
--   * Every table has RLS and owner/participant-scoped SELECT policies.
--   * A reciprocal pair is serialized with a transaction-level advisory lock and
--     backed by unique constraints, so concurrent reciprocal likes create one
--     match and one conversation.
--   * Client messages require the authenticated sender to be a participant in
--     an active match, with no block in either direction.

CREATE TYPE public.swipe_direction AS ENUM ('like', 'pass');
CREATE TYPE public.match_status AS ENUM ('active', 'ended');

-- Internal trigger/policy helpers live outside Supabase's default exposed
-- `public` schema. Only the message-policy predicate is executable by clients.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE TABLE public.swipes (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  direction public.swipe_direction NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_swipes_not_self CHECK (actor_id <> target_id),
  CONSTRAINT uq_swipes_actor_target UNIQUE (actor_id, target_id)
);

-- Actor history/pagination and incoming-like lookup for reciprocal matching.
CREATE INDEX idx_swipes_actor_created_at
  ON public.swipes (actor_id, created_at DESC, id DESC);
CREATE INDEX idx_swipes_target_direction_created_at
  ON public.swipes (target_id, direction, created_at DESC)
  WHERE direction = 'like'::public.swipe_direction;

CREATE TABLE public.daily_swipe_quotas (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quota_date DATE NOT NULL,
  likes_used INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT pk_daily_swipe_quotas PRIMARY KEY (user_id, quota_date),
  CONSTRAINT chk_daily_swipe_quotas_likes_nonnegative CHECK (likes_used >= 0)
);

CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.match_status NOT NULL DEFAULT 'active'::public.match_status,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_matches_canonical_pair CHECK (user_a_id < user_b_id),
  CONSTRAINT chk_matches_state_timestamps CHECK (
    (status = 'active'::public.match_status AND ended_at IS NULL)
    OR (status = 'ended'::public.match_status AND ended_at IS NOT NULL)
  ),
  CONSTRAINT uq_matches_user_pair UNIQUE (user_a_id, user_b_id)
);

-- user_a_id is indexed by the unique pair constraint; user_b_id needs its own
-- index so the participant-side lookup does not scan every match.
CREATE INDEX idx_matches_user_b_status_created_at
  ON public.matches (user_b_id, status, created_at DESC);

CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  last_message_at TIMESTAMPTZ,
  CONSTRAINT uq_conversations_match_id UNIQUE (match_id)
);

CREATE INDEX idx_conversations_last_message_at
  ON public.conversations (last_message_at DESC NULLS LAST, id DESC);

CREATE TABLE public.conversation_participants (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT pk_conversation_participants PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conversation_participants_user_conversation
  ON public.conversation_participants (user_id, conversation_id);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_messages_body_length CHECK (
    pg_catalog.char_length(body) BETWEEN 1 AND 2000
    AND pg_catalog.char_length(pg_catalog.btrim(body)) >= 1
  )
);

-- Stable cursor pagination by (created_at, id), with sender history as a
-- secondary operational lookup.
CREATE INDEX idx_messages_conversation_cursor
  ON public.messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX idx_messages_sender_created_at
  ON public.messages (sender_id, created_at DESC);

CREATE TABLE public.blocks (
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT pk_blocks PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT chk_blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX idx_blocks_blocked_blocker
  ON public.blocks (blocked_id, blocker_id);

-- Advisory locks serialize all state changes for an unordered user pair. Hash
-- collisions can only serialize unrelated pairs; pair correctness also relies
-- on the explicit unique constraints above, not on the hash being collision-free.
CREATE OR REPLACE FUNCTION private.lock_user_pair(p_user_one UUID, p_user_two UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      LEAST(p_user_one, p_user_two)::TEXT || ':' || GREATEST(p_user_one, p_user_two)::TEXT,
      2026102002
    )
  );
END;
$function$;

-- Trusted-write guard: clients do not receive INSERT privileges on swipes; this
-- trigger is defence in depth for privileged callers and the future swipe RPC.
CREATE OR REPLACE FUNCTION private.guard_swipe_pair()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.actor_id = NEW.target_id THEN
    RAISE EXCEPTION 'Self-swipes are not allowed'
      USING ERRCODE = '23514';
  END IF;

  PERFORM private.lock_user_pair(NEW.actor_id, NEW.target_id);

  IF EXISTS (
    SELECT 1
      FROM public.blocks AS b
     WHERE (b.blocker_id = NEW.actor_id AND b.blocked_id = NEW.target_id)
        OR (b.blocker_id = NEW.target_id AND b.blocked_id = NEW.actor_id)
  ) THEN
    RAISE EXCEPTION 'Swipes are prohibited when either user has blocked the other'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles AS p
     WHERE p.id = NEW.actor_id
       AND p.verification_status = 'verified'::public.verification_state
       AND p.is_discoverable
       AND NOT p.is_suspended
       AND p.birth_date <= (CURRENT_DATE - INTERVAL '18 years')::DATE
  ) THEN
    RAISE EXCEPTION 'Swipe actor is not eligible for discovery'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles AS p
     WHERE p.id = NEW.target_id
       AND p.verification_status = 'verified'::public.verification_state
       AND p.is_discoverable
       AND NOT p.is_suspended
       AND p.birth_date <= (CURRENT_DATE - INTERVAL '18 years')::DATE
  ) THEN
    RAISE EXCEPTION 'Swipe target is not eligible for discovery'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

-- This trigger runs in the same transaction as the swipe. A canonical-pair lock
-- makes concurrent A->B and B->A likes observe one another after serialization.
CREATE OR REPLACE FUNCTION private.create_match_on_reciprocal_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_a UUID;
  v_user_b UUID;
  v_match_id UUID;
  v_match_status public.match_status;
  v_conversation_id UUID;
BEGIN
  IF NEW.direction <> 'like'::public.swipe_direction THEN
    RETURN NEW;
  END IF;

  v_user_a := LEAST(NEW.actor_id, NEW.target_id);
  v_user_b := GREATEST(NEW.actor_id, NEW.target_id);
  PERFORM private.lock_user_pair(v_user_a, v_user_b);

  IF NOT EXISTS (
    SELECT 1
      FROM public.swipes AS reverse_swipe
     WHERE reverse_swipe.actor_id = NEW.target_id
       AND reverse_swipe.target_id = NEW.actor_id
       AND reverse_swipe.direction = 'like'::public.swipe_direction
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.matches (user_a_id, user_b_id, status)
  VALUES (v_user_a, v_user_b, 'active'::public.match_status)
  ON CONFLICT (user_a_id, user_b_id) DO NOTHING;

  SELECT m.id, m.status
    INTO v_match_id, v_match_status
    FROM public.matches AS m
   WHERE m.user_a_id = v_user_a
     AND m.user_b_id = v_user_b;

  -- Never reopen an ended match. Unblocking does not silently restore a prior
  -- conversation or permit messaging without a new, reviewed matching flow.
  IF v_match_status <> 'active'::public.match_status THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.conversations (match_id)
  VALUES (v_match_id)
  ON CONFLICT (match_id) DO NOTHING;

  SELECT c.id
    INTO v_conversation_id
    FROM public.conversations AS c
   WHERE c.match_id = v_match_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conversation_id, v_user_a), (v_conversation_id, v_user_b)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Serialize block insertion/deletion against swipes and message sends for the
-- same pair. A newly inserted block ends an active match; it is not reactivated
-- automatically if the block is later removed.
CREATE OR REPLACE FUNCTION private.lock_block_pair()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM private.lock_user_pair(OLD.blocker_id, OLD.blocked_id);
    RETURN OLD;
  END IF;

  IF NEW.blocker_id = NEW.blocked_id THEN
    RAISE EXCEPTION 'Self-blocks are not allowed'
      USING ERRCODE = '23514';
  END IF;

  PERFORM private.lock_user_pair(NEW.blocker_id, NEW.blocked_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.terminate_match_on_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_a UUID;
  v_user_b UUID;
BEGIN
  v_user_a := LEAST(NEW.blocker_id, NEW.blocked_id);
  v_user_b := GREATEST(NEW.blocker_id, NEW.blocked_id);

  UPDATE public.matches AS m
     SET status = 'ended'::public.match_status,
         ended_at = COALESCE(m.ended_at, pg_catalog.now()),
         updated_at = pg_catalog.now()
   WHERE m.user_a_id = v_user_a
     AND m.user_b_id = v_user_b
     AND m.status = 'active'::public.match_status;

  RETURN NEW;
END;
$function$;

-- SECURITY DEFINER is used because a policy must check blocks created by either
-- participant without granting clients access to another user's block rows.
-- The function is in the non-exposed `private` schema, and it only returns true
-- for the caller's own sender_id and an active, unblocked participant pair.
CREATE OR REPLACE FUNCTION private.can_send_message(
  p_conversation_id UUID,
  p_sender_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_a UUID;
  v_user_b UUID;
BEGIN
  IF p_sender_id IS NULL OR p_sender_id IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;

  SELECT m.user_a_id, m.user_b_id
    INTO v_user_a, v_user_b
    FROM public.conversations AS c
    JOIN public.matches AS m ON m.id = c.match_id
    JOIN public.conversation_participants AS cp
      ON cp.conversation_id = c.id AND cp.user_id = p_sender_id
   WHERE c.id = p_conversation_id
     AND (m.user_a_id = p_sender_id OR m.user_b_id = p_sender_id);

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM private.lock_user_pair(v_user_a, v_user_b);

  RETURN EXISTS (
    SELECT 1
      FROM public.conversations AS c
      JOIN public.matches AS m ON m.id = c.match_id
      JOIN public.conversation_participants AS cp
        ON cp.conversation_id = c.id AND cp.user_id = p_sender_id
     WHERE c.id = p_conversation_id
       AND (m.user_a_id = p_sender_id OR m.user_b_id = p_sender_id)
       AND m.status = 'active'::public.match_status
       AND NOT EXISTS (
         SELECT 1
           FROM public.blocks AS b
          WHERE (b.blocker_id = m.user_a_id AND b.blocked_id = m.user_b_id)
             OR (b.blocker_id = m.user_b_id AND b.blocked_id = m.user_a_id)
       )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.bump_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  UPDATE public.conversations AS c
     SET last_message_at = GREATEST(COALESCE(c.last_message_at, NEW.created_at), NEW.created_at)
   WHERE c.id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;

-- Functions in private are not callable through PostgREST while that schema is
-- not exposed. Explicit grants also prevent PUBLIC/anon access.
REVOKE ALL ON FUNCTION private.lock_user_pair(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_swipe_pair() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.create_match_on_reciprocal_like() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.lock_block_pair() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.terminate_match_on_block() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.can_send_message(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bump_conversation_last_message() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_swipe_pair() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.create_match_on_reciprocal_like() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.lock_block_pair() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.terminate_match_on_block() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_send_message(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.bump_conversation_last_message() TO authenticated, service_role;

CREATE TRIGGER trg_swipes_01_guard_pair
  BEFORE INSERT ON public.swipes
  FOR EACH ROW EXECUTE FUNCTION private.guard_swipe_pair();
CREATE TRIGGER trg_swipes_02_create_match_on_reciprocal_like
  AFTER INSERT ON public.swipes
  FOR EACH ROW EXECUTE FUNCTION private.create_match_on_reciprocal_like();
CREATE TRIGGER trg_blocks_01_lock_pair
  BEFORE INSERT OR DELETE ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION private.lock_block_pair();
CREATE TRIGGER trg_blocks_02_terminate_match
  AFTER INSERT ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION private.terminate_match_on_block();
CREATE TRIGGER trg_messages_01_bump_conversation_last_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.bump_conversation_last_message();

-- RLS is enabled on every table. No public/cross-user discovery profile policy
-- is created here; the safe feed is a separately reviewed RPC in P2-05.
ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_swipe_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
REVOKE ALL ON TABLE
  public.swipes,
  public.daily_swipe_quotas,
  public.matches,
  public.conversations,
  public.conversation_participants,
  public.messages,
  public.blocks
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.swipes,
  public.daily_swipe_quotas,
  public.matches,
  public.conversations,
  public.conversation_participants,
  public.messages,
  public.blocks
TO service_role;

-- Client reads are intentionally narrow; transactional writes for swipes,
-- quotas, matches, conversations and participant membership are server-only.
GRANT SELECT ON TABLE
  public.swipes,
  public.daily_swipe_quotas,
  public.matches,
  public.conversations,
  public.conversation_participants,
  public.messages,
  public.blocks
TO authenticated;
GRANT INSERT (conversation_id, sender_id, body)
  ON TABLE public.messages TO authenticated;
GRANT INSERT (blocker_id, blocked_id)
  ON TABLE public.blocks TO authenticated;
GRANT DELETE ON TABLE public.blocks TO authenticated;

CREATE POLICY swipes_select_own
  ON public.swipes FOR SELECT TO authenticated
  USING (actor_id = (SELECT auth.uid()));
CREATE POLICY daily_swipe_quotas_select_own
  ON public.daily_swipe_quotas FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY matches_select_participant
  ON public.matches FOR SELECT TO authenticated
  USING (user_a_id = (SELECT auth.uid()) OR user_b_id = (SELECT auth.uid()));
CREATE POLICY conversations_select_participant
  ON public.conversations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.conversation_participants AS cp
       WHERE cp.conversation_id = conversations.id
         AND cp.user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY conversation_participants_select_own
  ON public.conversation_participants FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY messages_select_participant
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.conversation_participants AS cp
       WHERE cp.conversation_id = messages.conversation_id
         AND cp.user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY messages_insert_active_unblocked_participant
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND private.can_send_message(conversation_id, sender_id)
  );
CREATE POLICY blocks_select_own
  ON public.blocks FOR SELECT TO authenticated
  USING (blocker_id = (SELECT auth.uid()));
CREATE POLICY blocks_insert_own
  ON public.blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = (SELECT auth.uid()));
CREATE POLICY blocks_delete_own
  ON public.blocks FOR DELETE TO authenticated
  USING (blocker_id = (SELECT auth.uid()));
