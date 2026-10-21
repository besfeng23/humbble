-- P3-06: privacy-safe push notifications for mutual matches and new messages.
CREATE TABLE public.push_tokens (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX idx_push_tokens_user ON public.push_tokens (user_id);
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_tokens FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.push_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_tokens TO service_role;
CREATE POLICY push_tokens_select_own ON public.push_tokens FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE TABLE public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  matches_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  messages_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_preferences FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_preferences TO service_role;
CREATE POLICY notification_preferences_select_own ON public.notification_preferences FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY notification_preferences_insert_own ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY notification_preferences_update_own ON public.notification_preferences FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

INSERT INTO public.notification_preferences (user_id)
SELECT p.id FROM public.profiles p ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.ensure_notification_preferences()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
BEGIN
  INSERT INTO public.notification_preferences(user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.ensure_notification_preferences() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.ensure_notification_preferences() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_profiles_notification_preferences ON public.profiles;
CREATE TRIGGER trg_profiles_notification_preferences AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.ensure_notification_preferences();

CREATE TABLE public.notification_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('match', 'message')),
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  locked_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  sent_at TIMESTAMPTZ,
  CHECK ((notification_type = 'match' AND match_id IS NOT NULL AND message_id IS NULL)
      OR (notification_type = 'message' AND message_id IS NOT NULL AND conversation_id IS NOT NULL AND match_id IS NULL))
);
CREATE INDEX idx_notification_jobs_drain ON public.notification_jobs (next_attempt_at, id)
  WHERE status IN ('pending', 'failed');
ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_jobs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_jobs TO service_role;
-- Supabase default privileges grant the identity sequence to client roles; identity inserts do not need them.
REVOKE ALL ON SEQUENCE public.notification_jobs_id_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.cancel_disabled_notification_jobs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
BEGIN
  IF NOT NEW.matches_enabled THEN
    DELETE FROM public.notification_jobs WHERE recipient_id = NEW.user_id AND notification_type = 'match' AND status IN ('pending', 'failed');
  END IF;
  IF NOT NEW.messages_enabled THEN
    DELETE FROM public.notification_jobs WHERE recipient_id = NEW.user_id AND notification_type = 'message' AND status IN ('pending', 'failed');
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.cancel_disabled_notification_jobs() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.cancel_disabled_notification_jobs() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_notification_preferences_cancel_jobs ON public.notification_preferences;
CREATE TRIGGER trg_notification_preferences_cancel_jobs AFTER UPDATE OF matches_enabled, messages_enabled ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION private.cancel_disabled_notification_jobs();

CREATE OR REPLACE FUNCTION public.register_push_token(p_token TEXT, p_platform TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE v_user UUID := (SELECT auth.uid()); v_id UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF;
  IF p_token IS NULL OR pg_catalog.length(p_token) NOT BETWEEN 10 AND 512
     OR p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'invalid_push_token' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.push_tokens(user_id, token, platform)
  VALUES (v_user, p_token, p_platform)
  ON CONFLICT (token) DO UPDATE SET platform = EXCLUDED.platform, updated_at = pg_catalog.now()
    WHERE public.push_tokens.user_id = EXCLUDED.user_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'push_token_already_registered' USING ERRCODE = '23505'; END IF;
  RETURN v_id;
END;
$function$;
ALTER FUNCTION public.register_push_token(TEXT, TEXT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.register_push_token(TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_push_token(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.unregister_push_token(p_token TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE v_user UUID := (SELECT auth.uid()); v_count INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.push_tokens WHERE user_id = v_user AND token = p_token;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$function$;
ALTER FUNCTION public.unregister_push_token(TEXT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.unregister_push_token(TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.unregister_push_token(TEXT) TO authenticated;

-- Only the service-role Edge Function can claim jobs; the atomic claim avoids
-- two concurrent drainers sending the same outbox row.
CREATE OR REPLACE FUNCTION public.claim_notification_jobs(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (id BIGINT, recipient_id UUID, notification_type TEXT, match_id UUID, conversation_id UUID, retry_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT j.id FROM public.notification_jobs j
     WHERE ((j.status IN ('pending', 'failed') AND j.next_attempt_at <= pg_catalog.now())
          OR (j.status = 'processing' AND j.locked_at < pg_catalog.now() - INTERVAL '5 minutes'))
       AND j.retry_count < 8
     ORDER BY j.id FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100)
  )
  UPDATE public.notification_jobs j SET status = 'processing', locked_at = pg_catalog.now()
   FROM picked WHERE j.id = picked.id
  RETURNING j.id, j.recipient_id, j.notification_type, j.match_id, j.conversation_id, j.retry_count;
END;
$function$;
ALTER FUNCTION public.claim_notification_jobs(INTEGER) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.claim_notification_jobs(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION private.enqueue_match_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
BEGIN
  IF NEW.status <> 'active' OR EXISTS (
    SELECT 1 FROM public.blocks b WHERE (b.blocker_id = NEW.user_a_id AND b.blocked_id = NEW.user_b_id)
       OR (b.blocker_id = NEW.user_b_id AND b.blocked_id = NEW.user_a_id)
  ) OR private.is_pair_excluded(NEW.user_a_id, NEW.user_b_id) THEN RETURN NEW; END IF;
  INSERT INTO public.notification_jobs(recipient_id, notification_type, match_id, dedupe_key)
  SELECT candidate.user_id, 'match', NEW.id, 'match:' || NEW.id::TEXT || ':' || candidate.user_id::TEXT
    FROM (VALUES (NEW.user_a_id), (NEW.user_b_id)) AS candidate(user_id)
   WHERE COALESCE((SELECT np.matches_enabled FROM public.notification_preferences np WHERE np.user_id = candidate.user_id), TRUE)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.enqueue_match_push() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.enqueue_match_push() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_match_push_enqueue ON public.matches;
CREATE TRIGGER trg_match_push_enqueue AFTER INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION private.enqueue_match_push();

CREATE OR REPLACE FUNCTION private.enqueue_message_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE v_match_id UUID; v_user_a UUID; v_user_b UUID;
BEGIN
  SELECT c.match_id, m.user_a_id, m.user_b_id INTO v_match_id, v_user_a, v_user_b
    FROM public.conversations c JOIN public.matches m ON m.id = c.match_id
   WHERE c.id = NEW.conversation_id AND m.status = 'active';
  IF v_match_id IS NULL OR NEW.sender_id NOT IN (v_user_a, v_user_b)
     OR EXISTS (SELECT 1 FROM public.blocks b WHERE (b.blocker_id = v_user_a AND b.blocked_id = v_user_b) OR (b.blocker_id = v_user_b AND b.blocked_id = v_user_a))
     OR private.is_pair_excluded(v_user_a, v_user_b) THEN RETURN NEW; END IF;
  INSERT INTO public.notification_jobs(recipient_id, notification_type, message_id, conversation_id, dedupe_key)
  SELECT CASE WHEN NEW.sender_id = v_user_a THEN v_user_b ELSE v_user_a END,
         'message', NEW.id, NEW.conversation_id, 'message:' || NEW.id::TEXT
   WHERE COALESCE((SELECT np.messages_enabled FROM public.notification_preferences np
                    WHERE np.user_id = CASE WHEN NEW.sender_id = v_user_a THEN v_user_b ELSE v_user_a END), TRUE)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.enqueue_message_push() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.enqueue_message_push() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_message_push_enqueue ON public.messages;
CREATE TRIGGER trg_message_push_enqueue AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.enqueue_message_push();

-- Record only coarse error codes, never tokens or message content.
COMMENT ON TABLE public.notification_jobs IS 'Private outbox; payload contains only event identifiers and notification type, never message text.';
