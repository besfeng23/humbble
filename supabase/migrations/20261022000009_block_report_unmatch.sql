-- P3-05: user-facing safety controls, idempotent reports, and bilateral unmatch.
-- Preserve the existing blocks/reports tables and their row-level security.

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS client_report_id UUID;
-- Safety writes must pass through the idempotent server RPCs; table RLS remains.
REVOKE INSERT ON TABLE public.reports FROM authenticated;
REVOKE INSERT (reporter_id, reported_user_id, category, context_summary) ON TABLE public.reports FROM authenticated;
REVOKE INSERT, DELETE ON TABLE public.blocks FROM authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_reporter_client_report_id
  ON public.reports (reporter_id, client_report_id)
  WHERE reporter_id IS NOT NULL AND client_report_id IS NOT NULL;

-- A ended or blocked match must not expose its old conversation/messages through
-- direct table queries or Realtime. Channel filters are not an authorization layer.
DROP POLICY IF EXISTS messages_select_participant ON public.messages;
CREATE POLICY messages_select_participant
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.conversation_participants AS cp
        JOIN public.conversations AS c ON c.id = cp.conversation_id
        JOIN public.matches AS m ON m.id = c.match_id
       WHERE cp.conversation_id = messages.conversation_id
         AND cp.user_id = (SELECT auth.uid())
         AND m.status = 'active'::public.match_status
         AND NOT EXISTS (
           SELECT 1 FROM public.blocks AS b
            WHERE (b.blocker_id = m.user_a_id AND b.blocked_id = m.user_b_id)
               OR (b.blocker_id = m.user_b_id AND b.blocked_id = m.user_a_id)
         )
    )
  );

DROP POLICY IF EXISTS conversations_select_participant ON public.conversations;
CREATE POLICY conversations_select_participant
  ON public.conversations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.conversation_participants AS cp
        JOIN public.matches AS m ON m.id = conversations.match_id
       WHERE cp.conversation_id = conversations.id
         AND cp.user_id = (SELECT auth.uid())
         AND m.status = 'active'::public.match_status
         AND NOT EXISTS (
           SELECT 1 FROM public.blocks AS b
            WHERE (b.blocker_id = m.user_a_id AND b.blocked_id = m.user_b_id)
               OR (b.blocker_id = m.user_b_id AND b.blocked_id = m.user_a_id)
         )
    )
  );

-- Replace the old signature, rather than leaving ambiguous overloaded PostgREST
-- endpoints. The last argument is optional for older SQL/service tests; all app
-- submissions pass it so retries are keyed server-side.
DROP FUNCTION public.submit_report(UUID, public.report_category, TEXT);
CREATE FUNCTION public.submit_report(
  p_reported_user_id UUID,
  p_category public.report_category,
  p_context_summary TEXT,
  p_client_report_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_report_id UUID;
  v_existing_target UUID;
  v_existing_category public.report_category;
  v_existing_context TEXT;
  v_count INTEGER;
  v_context TEXT := NULLIF(pg_catalog.btrim(p_context_summary), '');
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_reported_user_id IS NULL OR p_category IS NULL THEN
    RAISE EXCEPTION 'reported_user_and_category_required' USING ERRCODE = '22023';
  END IF;
  IF p_reported_user_id = v_actor THEN
    RAISE EXCEPTION 'self_report_not_allowed' USING ERRCODE = '23514';
  END IF;
  IF v_context IS NOT NULL AND pg_catalog.char_length(v_context) > 1000 THEN
    RAISE EXCEPTION 'report_context_too_long' USING ERRCODE = '22001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_reported_user_id) THEN
    RAISE EXCEPTION 'reported_user_not_found' USING ERRCODE = '22023';
  END IF;

  -- Serialize all submissions for the reporter; replay the same client key
  -- before applying the rate limit, so a retry never creates or counts a second report.
  PERFORM pg_catalog.pg_advisory_xact_lock(65003, pg_catalog.hashtext(v_actor::TEXT));
  IF p_client_report_id IS NOT NULL THEN
    SELECT r.id, r.reported_user_id, r.category, r.context_summary
      INTO v_report_id, v_existing_target, v_existing_category, v_existing_context
      FROM public.reports AS r
     WHERE r.reporter_id = v_actor
       AND r.client_report_id = p_client_report_id;
    IF v_report_id IS NOT NULL THEN
      IF v_existing_target IS DISTINCT FROM p_reported_user_id
         OR v_existing_category IS DISTINCT FROM p_category
         OR v_existing_context IS DISTINCT FROM v_context THEN
        RAISE EXCEPTION 'client_report_id_conflict' USING ERRCODE = '23505';
      END IF;
      RETURN v_report_id;
    END IF;
  END IF;

  SELECT pg_catalog.count(*)::INTEGER INTO v_count
    FROM public.reports AS r
   WHERE r.reporter_id = v_actor
     AND r.created_at >= pg_catalog.now() - INTERVAL '24 hours';
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'report_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reports
    (reporter_id, reported_user_id, category, context_summary, client_report_id)
  VALUES (v_actor, p_reported_user_id, p_category, v_context, p_client_report_id)
  RETURNING id INTO v_report_id;
  INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'report.submitted', 'report', v_report_id,
          pg_catalog.jsonb_build_object('category', p_category::TEXT));
  RETURN v_report_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unmatch(p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_user_a UUID;
  v_user_b UUID;
  v_updated INTEGER;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_target_id IS NULL OR p_target_id = v_actor THEN
    RAISE EXCEPTION 'invalid_unmatch_target' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_target_id) THEN
    RAISE EXCEPTION 'target_not_found' USING ERRCODE = '22023';
  END IF;
  PERFORM private.lock_user_pair(v_actor, p_target_id);
  v_user_a := LEAST(v_actor, p_target_id);
  v_user_b := GREATEST(v_actor, p_target_id);

  UPDATE public.matches AS m
     SET status = 'ended'::public.match_status,
         ended_at = COALESCE(m.ended_at, pg_catalog.now()),
         updated_at = pg_catalog.now()
   WHERE m.user_a_id = v_user_a
     AND m.user_b_id = v_user_b
     AND m.status = 'active'::public.match_status;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 1 THEN
    INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
    VALUES (v_actor, 'match.unmatched', 'profile', p_target_id, '{}'::JSONB);
  END IF;
  -- Ended matches are never reactivated by an unblock or a later like retry.
  RETURN v_updated = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_blocked_users()
RETURNS TABLE (blocked_id UUID, display_name TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT b.blocked_id, COALESCE(p.display_name, 'Humbble member'), b.created_at
    FROM public.blocks AS b
    LEFT JOIN public.profiles AS p ON p.id = b.blocked_id
   WHERE b.blocker_id = (SELECT auth.uid())
   ORDER BY b.created_at DESC, b.blocked_id;
$function$;

-- Re-assert block severance at the RPC boundary, including historical swipes.
-- This matters because record_swipe's idempotent replay check precedes the block
-- check; deleting both directions prevents an old swipe from bypassing a block.
CREATE OR REPLACE FUNCTION public.block_user(p_target_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_inserted INTEGER;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_target_id IS NULL OR p_target_id = v_actor THEN
    RAISE EXCEPTION 'invalid_block_target' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_target_id) THEN
    RAISE EXCEPTION 'target_not_found' USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_user_pair(v_actor, p_target_id);
  INSERT INTO public.blocks (blocker_id, blocked_id)
  VALUES (v_actor, p_target_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
    VALUES (v_actor, 'block.created', 'profile', p_target_id, '{}'::JSONB);
  END IF;

  DELETE FROM public.swipes AS sw
   WHERE (sw.actor_id = v_actor AND sw.target_id = p_target_id)
      OR (sw.actor_id = p_target_id AND sw.target_id = v_actor);

  -- The insert trigger above terminates the existing match. Removing swipe
  -- history permits discovery eligibility after a later unblock, while the
  -- unique ended match row deliberately cannot be reopened by a future like.
  RETURN p_target_id;
END;
$function$;

ALTER FUNCTION public.block_user(UUID) OWNER TO postgres;
ALTER FUNCTION public.unblock_user(UUID) OWNER TO postgres;
ALTER FUNCTION public.submit_report(UUID, public.report_category, TEXT, UUID) OWNER TO postgres;
ALTER FUNCTION public.unmatch(UUID) OWNER TO postgres;
ALTER FUNCTION public.list_blocked_users() OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.block_user(UUID) FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.unblock_user(UUID) FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_report(UUID, public.report_category, TEXT, UUID) FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.unmatch(UUID) FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.list_blocked_users() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.block_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_report(UUID, public.report_category, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unmatch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_blocked_users() TO authenticated;
