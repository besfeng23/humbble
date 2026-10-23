-- Themis N46-01 (HIGH, PR #46 review): a SUSPENDED member could still send messages in their existing matches, and the recipient
-- was push-notified (send_message -> private.can_send_message had no is_suspended predicate; AFTER INSERT trigger
-- private.enqueue_message_push then enqueued a notification_jobs row). Suspension is the moderation console's only enforcement lever,
-- so it must actually stop the reported behaviour (harassment) in existing matches.
--
-- Change (this is the ONLY behavioural change): private.can_send_message(conversation_id, sender_id) now also requires that the
-- SENDER's profile is not suspended. Everything else is the body of 20261020000002 unchanged (same signature, same
-- auth.uid() self-check, same participant/match lookup, same private.lock_user_pair, same active-match and block predicates).
-- A suspended sender therefore gets exactly the SAME denial as any other blocked sender: the function returns FALSE, so
-- public.send_message raises 'conversation_not_sendable' (SQLSTATE 42501) BEFORE its INSERT. No messages row is created, so the
-- AFTER INSERT push trigger never fires and no notification_jobs row is created. No new error code or message is introduced, so the
-- client behaves exactly as it already does for a blocked or unmatched sender (nothing reveals "you are suspended" at this layer).
-- The direct-INSERT RLS policy messages_insert_active_unblocked_participant also calls this function; direct INSERT is already
-- revoked from authenticated (20261022000008), so that policy is only defence in depth and now also denies a suspended sender.
-- Lifting the suspension (profiles.is_suspended = false, e.g. via moderation_take_action 'lift_suspension') restores sending
-- immediately: the flag is read on every call, there is no cached state.
--
-- Not changed on purpose (scope): the recipient side (a suspended RECIPIENT can still be messaged by an unsuspended match; the
-- sender cannot tell and nothing is pushed to anyone new), reading conversations, register_push_token, and public.send_message
-- itself (its idempotent replay of an ALREADY-stored message for the same client_message_id still returns that stored row; it
-- creates nothing new, so no new message and no new push). Those are separate decisions.
--
-- Concurrency note: the suspension flag is read by the final statement AFTER private.lock_user_pair, so a send that starts after
-- the suspension commits is denied. A send already past that statement when the suspension commits is not undone (normal
-- READ COMMITTED semantics; the same is true for blocks).
--
-- Privileges: CREATE OR REPLACE keeps the existing owner, ACL and proconfig, but they are restated below to be explicit and
-- idempotent, then ASSERTED at the end of the file (the file aborts and rolls back if anything drifted). Final state is exactly
-- what 20261020000002 produced and the catalog shows today (LB-3): SECURITY DEFINER, owner postgres, VOLATILE, search_path =
-- public, pg_temp, EXECUTE for postgres (owner) + authenticated + service_role only; NOT PUBLIC, NOT anon.
-- No table, index, policy, trigger, grant on any other object, or other function is touched. Additive and re-runnable.
--
-- Rollback (forward-fix preferred): re-run the CREATE OR REPLACE of private.can_send_message from
-- 20261020000002_discovery_matches_messaging.sql (lines ~315-364; it drops the suspended-sender predicate), then the same
-- ALTER OWNER / REVOKE / GRANT block as below. Nothing depends on the new predicate. Rolling back re-opens N46-01, so do not roll
-- back while the moderation console is in use. Messages already refused are not stored anywhere, and none were created, so there is
-- no data to repair in either direction.

BEGIN;
SET LOCAL lock_timeout = '5s';

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
       -- N46-01: a suspended sender is denied exactly like a blocked sender.
       AND NOT EXISTS (
         SELECT 1
           FROM public.profiles AS sender
          WHERE sender.id = p_sender_id
            AND sender.is_suspended
       )
  );
END;
$function$;

ALTER FUNCTION private.can_send_message(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.can_send_message(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_send_message(UUID, UUID) TO authenticated, service_role;

-- Closing self-check: abort and roll back the whole file if posture drifted from the (unchanged) pre-migration state.
DO $assert$
DECLARE
  v_fn  REGPROCEDURE := 'private.can_send_message(uuid,uuid)'::regprocedure;
  v_src TEXT;
  r     RECORD;
BEGIN
  SELECT p.prosecdef, p.provolatile, p.proisstrict, p.proconfig, pg_catalog.pg_get_userbyid(p.proowner) AS owner, p.prosrc
    INTO r
    FROM pg_catalog.pg_proc AS p
   WHERE p.oid = v_fn;

  IF NOT r.prosecdef THEN
    RAISE EXCEPTION 'private.can_send_message must be SECURITY DEFINER';
  END IF;
  IF r.owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'private.can_send_message must be owned by postgres (found %)', r.owner;
  END IF;
  IF r.provolatile <> 'v' OR r.proisstrict THEN
    RAISE EXCEPTION 'private.can_send_message must stay VOLATILE and not STRICT';
  END IF;
  IF r.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::TEXT[] THEN
    RAISE EXCEPTION 'private.can_send_message must pin search_path = public, pg_temp (found %)', r.proconfig;
  END IF;

  -- ACL must be exactly owner + authenticated + service_role, each EXECUTE with no grant option; nothing for PUBLIC/anon/others.
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc AS p
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
     WHERE p.oid = v_fn
       AND NOT (
         a.privilege_type = 'EXECUTE' AND NOT a.is_grantable
         AND a.grantee IN ('postgres'::REGROLE, 'authenticated'::REGROLE, 'service_role'::REGROLE)
       )
  ) THEN
    RAISE EXCEPTION 'private.can_send_message ACL must be exactly owner + authenticated + service_role EXECUTE (no PUBLIC/anon/other grantee)';
  END IF;
  IF (SELECT pg_catalog.count(DISTINCT a.grantee)
        FROM pg_catalog.pg_proc AS p
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
       WHERE p.oid = v_fn) <> 3 THEN
    RAISE EXCEPTION 'private.can_send_message must be executable by exactly postgres, authenticated and service_role';
  END IF;

  -- The new predicate must be present and the rest of the guard intact (catalog posture alone cannot prove the body).
  v_src := r.prosrc;
  IF v_src NOT LIKE '%sender.is_suspended%' OR v_src NOT LIKE '%public.blocks%' OR v_src NOT LIKE '%lock_user_pair%' THEN
    RAISE EXCEPTION 'private.can_send_message body lost the suspended-sender or block predicate';
  END IF;
END;
$assert$;

COMMIT;
