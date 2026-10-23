-- P5-01 Trust & Safety console: server side for the moderation screens (replaces the synthetic cases in app/(admin)/moderation/*).
-- ADDITIVE ONLY: four new functions in public. No table, column, policy, trigger, grant on an existing object or default ACL is changed.
-- For Themis: new client-callable surface = 4 functions, all authenticated-only, all moderator-gated INSIDE the function.
--
--   public.moderation_list_queue(text, integer, integer)   read    reports LEFT JOIN moderation_cases, newest-risk-first, paged
--   public.moderation_get_case(uuid)                       read*   one report/case + reported member context + audit history
--                                                                  (*appends a 'moderation.case_viewed' audit row: evidence access is audited)
--   public.moderation_open_case(uuid, text)                write   creates the case for a report (idempotent), audited with the reason
--   public.moderation_take_action(uuid, text, text)        write   start_review | warn | suspend | dismiss | lift_suspension | close
--
-- Authorization (all four): auth.uid() must be set AND private.is_trusted_moderator() (JWT app_metadata.role = 'moderator'; never
-- user_metadata). Unlike moderation_transition_case there is NO service_role exception: every console action has a human actor.
-- Auditability: every write inserts public.audit_events rows with actor_id (who), created_at (when) and metadata.reason (why, mandatory,
-- 8..2000 chars). moderation_take_action delegates the status change to the existing public.moderation_transition_case (single source of
-- truth for the case state machine, which writes its own 'moderation.case_transition' row) and adds a 'moderation.action' row that carries the
-- action, the reported member, and the suspension before/after. audit_events is immutable (trg_audit_events_immutable) and is not readable by
-- authenticated; moderators only see it through moderation_get_case.
-- Suspension: is_suspended is written by the definer (owner postgres, which the profile column lock trigger treats as privileged), only through
-- moderation_take_action('suspend' | 'lift_suspension'). A moderator cannot suspend/restore their own account.
-- Privileges: owner postgres, SECURITY DEFINER, search_path pinned to 'public, pg_temp', EXECUTE revoked from PUBLIC/anon/authenticated/
-- service_role then granted to authenticated ONLY (LB-3: explicit, no reliance on default ACLs; the closing DO block asserts exact ACLs and aborts
-- the whole file if anything differs). No default ACL is touched.
-- Not done here (documented in the PR): no member-facing notice is sent for a warning/suspension; appeals intake; case assignment UI.
-- Rollback (forward-fix preferred; nothing else depends on these): DROP FUNCTION public.moderation_list_queue(text,integer,integer),
--   public.moderation_get_case(uuid), public.moderation_open_case(uuid,text), public.moderation_take_action(uuid,text,text);

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.moderation_list_queue(
  p_filter TEXT DEFAULT 'active',
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  report_id UUID,
  case_id UUID,
  case_status TEXT,
  report_status TEXT,
  category TEXT,
  severity TEXT,
  reported_user_id UUID,
  reported_display_name TEXT,
  reported_is_suspended BOOLEAN,
  reports_against_count INTEGER,
  reported_at TIMESTAMPTZ,
  case_updated_at TIMESTAMPTZ,
  assigned_to_me BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_filter TEXT := COALESCE(NULLIF(pg_catalog.btrim(p_filter), ''), 'active');
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_trusted_moderator() THEN
    RAISE EXCEPTION 'moderator_required' USING ERRCODE = '42501';
  END IF;
  IF v_filter::TEXT COLLATE "C" NOT IN ('active', 'unopened', 'open', 'in_review', 'resolved', 'appealed', 'closed', 'all') THEN
    RAISE EXCEPTION 'invalid_moderation_filter' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT r.id,
         c.id,
         c.status::TEXT,
         r.status::TEXT,
         r.category::TEXT,
         -- Underage concerns are always treated as urgent (4h triage SLA) whatever severity was stored.
         CASE WHEN r.category::TEXT COLLATE "C" = 'underage'::TEXT COLLATE "C" THEN 'urgent' ELSE r.severity::TEXT END,
         r.reported_user_id,
         p.display_name::TEXT,
         p.is_suspended,
         (SELECT pg_catalog.count(*)::INTEGER FROM public.reports AS o WHERE o.reported_user_id = r.reported_user_id AND r.reported_user_id IS NOT NULL),
         r.created_at,
         c.updated_at,
         (c.assigned_moderator_id IS NOT NULL AND c.assigned_moderator_id = v_actor)
    FROM public.reports AS r
    LEFT JOIN public.moderation_cases AS c ON c.report_id = r.id
    LEFT JOIN public.profiles AS p ON p.id = r.reported_user_id
   WHERE CASE v_filter::TEXT COLLATE "C"
           WHEN 'all' THEN TRUE
           WHEN 'unopened' THEN c.id IS NULL AND r.status = 'submitted'::public.report_status
           WHEN 'active' THEN (c.id IS NULL AND r.status = 'submitted'::public.report_status)
                              OR c.status IN ('open'::public.moderation_case_status, 'in_review'::public.moderation_case_status, 'appealed'::public.moderation_case_status)
           ELSE c.status::TEXT COLLATE "C" = v_filter::TEXT COLLATE "C"
         END
   ORDER BY CASE WHEN r.category::TEXT COLLATE "C" = 'underage'::TEXT COLLATE "C" THEN 4
                 ELSE CASE r.severity WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END END DESC,
            r.created_at ASC,
            r.id ASC
   LIMIT v_limit OFFSET v_offset;
END;
$function$;

CREATE FUNCTION public.moderation_get_case(p_report_id UUID)
RETURNS TABLE (
  report_id UUID,
  case_id UUID,
  case_status TEXT,
  report_status TEXT,
  category TEXT,
  severity TEXT,
  context_summary TEXT,
  reporter_id UUID,
  reported_user_id UUID,
  reported_display_name TEXT,
  reported_is_suspended BOOLEAN,
  reports_against_count INTEGER,
  blocks_against_count INTEGER,
  reported_at TIMESTAMPTZ,
  case_updated_at TIMESTAMPTZ,
  assigned_moderator_id UUID,
  resolution_code TEXT,
  history JSONB
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_case_id UUID;
  v_history JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_trusted_moderator() THEN
    RAISE EXCEPTION 'moderator_required' USING ERRCODE = '42501';
  END IF;
  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'report_required' USING ERRCODE = '22023';
  END IF;

  SELECT mc.id INTO v_case_id FROM public.moderation_cases AS mc WHERE mc.report_id = p_report_id;
  IF NOT EXISTS (SELECT 1 FROM public.reports AS r WHERE r.id = p_report_id) THEN
    RAISE EXCEPTION 'moderation_case_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(h.item ORDER BY h.at DESC), '[]'::JSONB) INTO v_history
    FROM (
      SELECT a.created_at AS at,
             pg_catalog.jsonb_build_object('at', a.created_at, 'action', a.action, 'actor_id', a.actor_id, 'metadata', a.metadata) AS item
        FROM public.audit_events AS a
       WHERE ((a.target_type::TEXT COLLATE "C" = 'report'::TEXT COLLATE "C" AND a.target_id = p_report_id)
              OR (v_case_id IS NOT NULL AND a.target_type::TEXT COLLATE "C" = 'moderation_case'::TEXT COLLATE "C" AND a.target_id = v_case_id))
         AND a.action::TEXT COLLATE "C" <> 'moderation.case_viewed'::TEXT COLLATE "C"
       ORDER BY a.created_at DESC
       LIMIT 50
    ) AS h;

  -- Evidence access is itself audited (who looked at which report, when).
  INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'moderation.case_viewed', 'report', p_report_id,
          pg_catalog.jsonb_build_object('case_id', v_case_id));

  RETURN QUERY
  SELECT r.id,
         c.id,
         c.status::TEXT,
         r.status::TEXT,
         r.category::TEXT,
         CASE WHEN r.category::TEXT COLLATE "C" = 'underage'::TEXT COLLATE "C" THEN 'urgent' ELSE r.severity::TEXT END,
         r.context_summary,
         r.reporter_id,
         r.reported_user_id,
         p.display_name::TEXT,
         p.is_suspended,
         (SELECT pg_catalog.count(*)::INTEGER FROM public.reports AS o WHERE o.reported_user_id = r.reported_user_id AND r.reported_user_id IS NOT NULL),
         (SELECT pg_catalog.count(*)::INTEGER FROM public.blocks AS b WHERE b.blocked_id = r.reported_user_id AND r.reported_user_id IS NOT NULL),
         r.created_at,
         c.updated_at,
         c.assigned_moderator_id,
         c.resolution_code,
         v_history
    FROM public.reports AS r
    LEFT JOIN public.moderation_cases AS c ON c.report_id = r.id
    LEFT JOIN public.profiles AS p ON p.id = r.reported_user_id
   WHERE r.id = p_report_id;
END;
$function$;

CREATE FUNCTION public.moderation_open_case(p_report_id UUID, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_reason TEXT := NULLIF(pg_catalog.btrim(p_reason), '');
  v_case_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_trusted_moderator() THEN
    RAISE EXCEPTION 'moderator_required' USING ERRCODE = '42501';
  END IF;
  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'report_required' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR pg_catalog.char_length(v_reason) < 8 THEN
    RAISE EXCEPTION 'moderation_reason_required' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'moderation_note_too_long' USING ERRCODE = '22001';
  END IF;

  -- Serialize on the report so two moderators opening it at once get the same case.
  PERFORM 1 FROM public.reports AS r WHERE r.id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'moderation_case_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT mc.id INTO v_case_id FROM public.moderation_cases AS mc WHERE mc.report_id = p_report_id;
  IF v_case_id IS NOT NULL THEN
    RETURN v_case_id;  -- idempotent: no second case, no second audit row
  END IF;

  INSERT INTO public.moderation_cases (report_id, status, assigned_moderator_id)
  VALUES (p_report_id, 'open'::public.moderation_case_status, v_actor)
  RETURNING id INTO v_case_id;

  INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'moderation.case_opened', 'moderation_case', v_case_id,
          pg_catalog.jsonb_build_object('report_id', p_report_id, 'reason', v_reason));
  RETURN v_case_id;
END;
$function$;

CREATE FUNCTION public.moderation_take_action(p_case_id UUID, p_action TEXT, p_reason TEXT)
RETURNS TABLE (case_status TEXT, reported_is_suspended BOOLEAN)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_action TEXT := pg_catalog.btrim(p_action);
  v_reason TEXT := NULLIF(pg_catalog.btrim(p_reason), '');
  v_old_status public.moderation_case_status;
  v_new_status public.moderation_case_status;
  v_report_id UUID;
  v_target UUID;
  v_susp_before BOOLEAN;
  v_susp_after BOOLEAN;
  v_report_status public.report_status;
  v_code TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_trusted_moderator() THEN
    RAISE EXCEPTION 'moderator_required' USING ERRCODE = '42501';
  END IF;
  IF p_case_id IS NULL OR v_action IS NULL THEN
    RAISE EXCEPTION 'case_and_status_required' USING ERRCODE = '22023';
  END IF;
  IF v_action::TEXT COLLATE "C" NOT IN ('start_review', 'warn', 'suspend', 'dismiss', 'lift_suspension', 'close') THEN
    RAISE EXCEPTION 'invalid_moderation_action' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR pg_catalog.char_length(v_reason) < 8 THEN
    RAISE EXCEPTION 'moderation_reason_required' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'moderation_note_too_long' USING ERRCODE = '22001';
  END IF;

  SELECT mc.status, mc.report_id INTO v_old_status, v_report_id
    FROM public.moderation_cases AS mc WHERE mc.id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'moderation_case_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT r.reported_user_id INTO v_target FROM public.reports AS r WHERE r.id = v_report_id;

  -- Allowed (from -> to) per action; moderation_transition_case re-validates the state machine.
  IF v_action::TEXT COLLATE "C" = 'start_review' THEN
    IF v_old_status NOT IN ('open'::public.moderation_case_status, 'appealed'::public.moderation_case_status) THEN
      RAISE EXCEPTION 'invalid_moderation_transition' USING ERRCODE = '23514';
    END IF;
    v_new_status := 'in_review'; v_report_status := 'under_review'; v_code := NULL;
  ELSIF v_action::TEXT COLLATE "C" IN ('warn', 'suspend', 'dismiss') THEN
    IF v_old_status <> 'in_review'::public.moderation_case_status THEN
      RAISE EXCEPTION 'invalid_moderation_transition' USING ERRCODE = '23514';
    END IF;
    IF v_action::TEXT COLLATE "C" = 'warn' THEN
      v_new_status := 'resolved'; v_report_status := 'actioned'; v_code := 'warned';
    ELSIF v_action::TEXT COLLATE "C" = 'suspend' THEN
      v_new_status := 'resolved'; v_report_status := 'actioned'; v_code := 'suspended';
    ELSE
      v_new_status := 'closed'; v_report_status := 'dismissed'; v_code := 'dismissed';
    END IF;
  ELSIF v_action::TEXT COLLATE "C" = 'lift_suspension' THEN
    IF v_old_status NOT IN ('resolved'::public.moderation_case_status, 'appealed'::public.moderation_case_status) THEN
      RAISE EXCEPTION 'invalid_moderation_transition' USING ERRCODE = '23514';
    END IF;
    v_new_status := 'closed'; v_report_status := 'closed'; v_code := 'suspension_lifted';
  ELSE  -- close
    IF v_old_status NOT IN ('resolved'::public.moderation_case_status, 'appealed'::public.moderation_case_status) THEN
      RAISE EXCEPTION 'invalid_moderation_transition' USING ERRCODE = '23514';
    END IF;
    v_new_status := 'closed'; v_report_status := 'closed'; v_code := 'closed';
  END IF;

  IF v_action::TEXT COLLATE "C" IN ('suspend', 'lift_suspension') THEN
    IF v_target IS NULL THEN
      RAISE EXCEPTION 'moderation_target_unavailable' USING ERRCODE = '23514';
    END IF;
    IF v_target = v_actor THEN
      RAISE EXCEPTION 'moderation_self_action_not_allowed' USING ERRCODE = '23514';
    END IF;
    SELECT p.is_suspended INTO v_susp_before FROM public.profiles AS p WHERE p.id = v_target FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'moderation_target_unavailable' USING ERRCODE = '23514';
    END IF;
    IF v_action::TEXT COLLATE "C" = 'lift_suspension' AND NOT v_susp_before THEN
      RAISE EXCEPTION 'moderation_not_suspended' USING ERRCODE = '23514';
    END IF;
  ELSIF v_target IS NOT NULL THEN
    SELECT p.is_suspended INTO v_susp_before FROM public.profiles AS p WHERE p.id = v_target;
  END IF;

  -- Status change + its own 'moderation.case_transition' audit row (note = the reason).
  PERFORM public.moderation_transition_case(p_case_id, v_new_status, v_reason);

  IF v_action::TEXT COLLATE "C" = 'suspend' THEN
    UPDATE public.profiles AS p SET is_suspended = TRUE WHERE p.id = v_target;
  ELSIF v_action::TEXT COLLATE "C" = 'lift_suspension' THEN
    UPDATE public.profiles AS p SET is_suspended = FALSE WHERE p.id = v_target;
  END IF;
  SELECT p.is_suspended INTO v_susp_after FROM public.profiles AS p WHERE p.id = v_target;

  UPDATE public.moderation_cases AS mc
     SET resolution_code = COALESCE(v_code, mc.resolution_code),
         assigned_moderator_id = COALESCE(mc.assigned_moderator_id, v_actor)
   WHERE mc.id = p_case_id;
  UPDATE public.reports AS r SET status = v_report_status WHERE r.id = v_report_id;

  INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'moderation.action', 'moderation_case', p_case_id,
          pg_catalog.jsonb_build_object(
            'action', v_action,
            'reason', v_reason,
            'from', v_old_status::TEXT,
            'to', v_new_status::TEXT,
            'report_id', v_report_id,
            'reported_user_id', v_target,
            'suspended_before', v_susp_before,
            'suspended_after', v_susp_after
          ));

  RETURN QUERY SELECT v_new_status::TEXT, v_susp_after;
END;
$function$;

ALTER FUNCTION public.moderation_list_queue(TEXT, INTEGER, INTEGER) OWNER TO postgres;
ALTER FUNCTION public.moderation_get_case(UUID) OWNER TO postgres;
ALTER FUNCTION public.moderation_open_case(UUID, TEXT) OWNER TO postgres;
ALTER FUNCTION public.moderation_take_action(UUID, TEXT, TEXT) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.moderation_list_queue(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.moderation_get_case(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.moderation_open_case(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.moderation_take_action(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.moderation_list_queue(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_get_case(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_open_case(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_take_action(UUID, TEXT, TEXT) TO authenticated;

-- Closing assertion: abort and roll back the whole file unless all four are exactly SECURITY DEFINER, owner postgres, search_path pinned,
-- executable by authenticated only (ACL = owner + authenticated; not PUBLIC, anon or service_role).
DO $assert$
DECLARE
  v_sig TEXT;
  v_oid OID;
  v_p pg_catalog.pg_proc%ROWTYPE;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.moderation_list_queue(text,integer,integer)',
    'public.moderation_get_case(uuid)',
    'public.moderation_open_case(uuid,text)',
    'public.moderation_take_action(uuid,text,text)'
  ] LOOP
    v_oid := v_sig::pg_catalog.regprocedure;
    SELECT * INTO v_p FROM pg_catalog.pg_proc AS p WHERE p.oid = v_oid;
    IF NOT v_p.prosecdef THEN RAISE EXCEPTION '% must be SECURITY DEFINER', v_sig; END IF;
    IF pg_catalog.pg_get_userbyid(v_p.proowner) <> 'postgres' THEN RAISE EXCEPTION '% must be owned by postgres', v_sig; END IF;
    IF v_p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::TEXT[] THEN RAISE EXCEPTION '% search_path must be pinned', v_sig; END IF;
    IF NOT pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN RAISE EXCEPTION '% must be executable by authenticated', v_sig; END IF;
    IF pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE') OR pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '% must not be executable by anon or service_role', v_sig;
    END IF;
    IF v_p.proacl IS NULL OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(v_p.proacl) AS a WHERE a.grantee = 0) THEN
      RAISE EXCEPTION '% must not be executable by PUBLIC', v_sig;
    END IF;
    IF (SELECT pg_catalog.count(*) FROM pg_catalog.aclexplode(v_p.proacl) AS a) <> 2 THEN
      RAISE EXCEPTION '% ACL must be exactly owner + authenticated', v_sig;
    END IF;
  END LOOP;
END
$assert$;

COMMIT;
