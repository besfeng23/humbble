-- Themis N46-02 (MEDIUM, PR #46 review): a moderator could still open, review, warn on, dismiss or close a case in which THEY are the
-- reported member, and could view it (reporter id, evidence, history). Migration 20261024000130 guarded only suspend / lift_suspension
-- inside moderation_take_action; moderation_open_case, the other four take_action verbs, moderation_get_case and the pre-existing
-- directly-callable moderation_transition_case had no recusal check.
--
-- Change (this is the ONLY behavioural change): the SAME guard, with the SAME error (SQLSTATE 23514, message
-- 'moderation_self_action_not_allowed'), now applies to every moderation RPC that takes a report/case id. The subject is
-- public.reports.reported_user_id (via moderation_cases.report_id for a case id); when it equals auth.uid() the call is refused:
--   public.moderation_open_case(uuid, text)                refused BEFORE the idempotent early return and before any insert
--   public.moderation_take_action(uuid, text, text)        refused for ALL six actions, BEFORE the state-machine checks and any write
--                                                          (the old inner check for suspend / lift_suspension is replaced by this one,
--                                                          which covers it; same error)
--   public.moderation_transition_case(uuid, status, text)  refused for a human caller; the service_role system principal has no auth.uid()
--                                                          so it is NOT affected (documented system-actor exception unchanged)
--   public.moderation_get_case(uuid)                       refused BEFORE the history query and before the 'moderation.case_viewed' insert
-- Every refusal is a RAISE inside the function, so the statement aborts and nothing it would have written (case row, status change,
-- is_suspended flip, audit_events row) exists afterwards. The guard runs after the authentication / moderator checks, so a non-moderator
-- still gets 'moderator_required'. A report or case with no reported member (reported_user_id IS NULL, or a case with no report) has no
-- subject, so nothing is refused for it.
-- Not changed on purpose (scope): moderation_list_queue (a listing: no reporter id, no evidence, no audit row; the member's own report is
-- still listed but cannot be opened); reporter-is-self (the existing guard never covered it and this PR does not add it); direct moderator
-- SELECT on reports / moderation_cases via RLS (N46-03); the other moderators remain able to act, so a second moderator is still required.
-- Recusal is enforced per account id only: it does not stop a moderator from acting on a case about a second account they control.
--
-- Bodies are the 20261024000130 bodies (and, for moderation_transition_case, the 20261020000005 body, not redefined since) plus ONLY the
-- guard blocks and the variables they need. Privileges: CREATE OR REPLACE keeps owner, proacl and proconfig, and no GRANT/REVOKE is issued
-- here. Owner postgres is restated; the closing DO block ASSERTS the resulting posture (SECURITY DEFINER, owner postgres, VOLATILE, not
-- STRICT, search_path = public, pg_temp, exact ACL: owner + authenticated for open / take_action / get_case; owner + authenticated +
-- service_role for transition_case; EXECUTE only, no grant option; nothing for PUBLIC / anon) and the guard's structure in the function
-- source, and aborts and rolls back the whole file if anything differs. The source checks are textual and prove the guard text is present
-- and precedes the first early-return / write in each body; they do NOT prove behaviour (supabase/tests/0035 does that). No table, index,
-- policy, trigger, default ACL or other function is touched.
--
-- Rollback (forward-fix preferred): re-run CREATE OR REPLACE of the four functions from their previous definitions:
--   moderation_open_case, moderation_take_action, moderation_get_case  <- 20261024000130_moderation_console_rpcs.sql
--   moderation_transition_case                                         <- 20261020000005_hardened_rpcs.sql (lines ~403-487)
-- (owner / ACL / search_path are preserved by CREATE OR REPLACE; re-run the ALTER OWNER lines below if in doubt). Nothing depends on the
-- guard. Rolling back re-opens N46-02. No data is created or changed by this migration, so there is nothing to repair in either direction.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.moderation_open_case(p_report_id UUID, p_reason TEXT)
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
  v_target UUID;
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
  SELECT r.reported_user_id INTO v_target FROM public.reports AS r WHERE r.id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'moderation_case_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- N46-02: recusal. Raised before the idempotent early return (so the case id of one's own case is not handed back) and before any insert.
  IF v_target IS NOT NULL AND v_target = v_actor THEN
    RAISE EXCEPTION 'moderation_self_action_not_allowed' USING ERRCODE = '23514';
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

CREATE OR REPLACE FUNCTION public.moderation_take_action(p_case_id UUID, p_action TEXT, p_reason TEXT)
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

  -- N46-02: recusal for EVERY action (start_review, warn, suspend, dismiss, lift_suspension, close), not only suspend/lift_suspension.
  -- Raised before the state-machine checks, so the denial does not depend on the case state, and before any write (nothing to roll back).
  IF v_target IS NOT NULL AND v_target = v_actor THEN
    RAISE EXCEPTION 'moderation_self_action_not_allowed' USING ERRCODE = '23514';
  END IF;

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

CREATE OR REPLACE FUNCTION public.moderation_transition_case(
  p_case_id UUID,
  p_new_status public.moderation_case_status,
  p_note TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_jwt_role TEXT := (SELECT auth.jwt() ->> 'role');
  v_old_status public.moderation_case_status;
  v_subject UUID;
  v_note TEXT := NULLIF(pg_catalog.btrim(p_note), '');
BEGIN
  -- User-initiated transitions require auth.uid(); a trusted service-role
  -- principal is the explicit system-actor exception and is recorded as such.
  IF v_actor IS NULL
     AND COALESCE(v_jwt_role, '')::TEXT COLLATE "C" <> 'service_role'::TEXT COLLATE "C" THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(v_jwt_role, '')::TEXT COLLATE "C" <> 'service_role'::TEXT COLLATE "C"
     AND NOT private.is_trusted_moderator() THEN
    RAISE EXCEPTION 'moderator_required' USING ERRCODE = '42501';
  END IF;
  IF p_case_id IS NULL OR p_new_status IS NULL THEN
    RAISE EXCEPTION 'case_and_status_required' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND pg_catalog.char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'moderation_note_too_long' USING ERRCODE = '22001';
  END IF;

  SELECT mc.status INTO v_old_status
    FROM public.moderation_cases AS mc
   WHERE mc.id = p_case_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'moderation_case_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- N46-02: recusal. A human moderator cannot transition a case about their own account. The service_role system principal has no
  -- auth.uid() (v_actor IS NULL), so this predicate is NULL for it and the documented system-actor exception is unchanged.
  SELECT r.reported_user_id INTO v_subject
    FROM public.moderation_cases AS mc
    JOIN public.reports AS r ON r.id = mc.report_id
   WHERE mc.id = p_case_id;
  IF v_actor IS NOT NULL AND v_subject IS NOT NULL AND v_subject = v_actor THEN
    RAISE EXCEPTION 'moderation_self_action_not_allowed' USING ERRCODE = '23514';
  END IF;
  IF v_old_status = p_new_status THEN
    RAISE EXCEPTION 'invalid_moderation_transition' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (v_old_status = 'open'::public.moderation_case_status AND p_new_status = 'in_review'::public.moderation_case_status)
    OR (v_old_status = 'in_review'::public.moderation_case_status AND p_new_status IN (
      'resolved'::public.moderation_case_status, 'appealed'::public.moderation_case_status, 'closed'::public.moderation_case_status
    ))
    OR (v_old_status = 'resolved'::public.moderation_case_status AND p_new_status IN (
      'appealed'::public.moderation_case_status, 'closed'::public.moderation_case_status
    ))
    OR (v_old_status = 'appealed'::public.moderation_case_status AND p_new_status IN (
      'in_review'::public.moderation_case_status, 'resolved'::public.moderation_case_status, 'closed'::public.moderation_case_status
    ))
  ) THEN
    RAISE EXCEPTION 'invalid_moderation_transition' USING ERRCODE = '23514';
  END IF;

  UPDATE public.moderation_cases AS mc
     SET status = p_new_status,
         closed_at = CASE WHEN p_new_status IN ('resolved'::public.moderation_case_status, 'closed'::public.moderation_case_status)
                          THEN pg_catalog.now() ELSE NULL END,
         resolution_code = CASE WHEN v_note IS NOT NULL THEN pg_catalog.left(v_note, 100) ELSE mc.resolution_code END,
         updated_at = pg_catalog.now()
   WHERE mc.id = p_case_id;

  INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'moderation.case_transition', 'moderation_case', p_case_id,
          pg_catalog.jsonb_build_object(
            'from', v_old_status::TEXT,
            'to', p_new_status::TEXT,
            'note', v_note,
            'actor_principal', CASE WHEN v_actor IS NULL THEN 'service_role' ELSE 'authenticated_user' END
          ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.moderation_get_case(p_report_id UUID)
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
  v_target UUID;
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
  SELECT r.reported_user_id INTO v_target FROM public.reports AS r WHERE r.id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'moderation_case_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- N46-02: recusal. A moderator cannot read (or thereby audit-log a view of) a case about their own account. Raised before any history
  -- query and before the 'moderation.case_viewed' insert, so a denied call returns nothing and writes nothing.
  IF v_target IS NOT NULL AND v_target = v_actor THEN
    RAISE EXCEPTION 'moderation_self_action_not_allowed' USING ERRCODE = '23514';
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

ALTER FUNCTION public.moderation_open_case(UUID, TEXT) OWNER TO postgres;
ALTER FUNCTION public.moderation_take_action(UUID, TEXT, TEXT) OWNER TO postgres;
ALTER FUNCTION public.moderation_transition_case(UUID, public.moderation_case_status, TEXT) OWNER TO postgres;
ALTER FUNCTION public.moderation_get_case(UUID) OWNER TO postgres;

-- Closing self-check: abort and roll back the whole file if posture or guard structure is not exactly as intended.
DO $assert$
DECLARE
  v_spec  TEXT[];
  v_sig   TEXT;
  v_oid   OID;
  v_p     pg_catalog.pg_proc%ROWTYPE;
  v_src   TEXT;
  v_guard TEXT;
  v_pos   INTEGER;
  v_mark  TEXT;
  v_n     INTEGER;
  v_acl_n INTEGER;
  v_expect INTEGER;
  v_svc   BOOLEAN;
BEGIN
  -- spec = signature | guard marker | service_role keeps EXECUTE | markers that must come AFTER the guard (comma separated)
  FOREACH v_sig IN ARRAY ARRAY[
    'public.moderation_open_case(uuid,text)|v_target = v_actor|f|RETURN v_case_id,INSERT INTO public.moderation_cases,INSERT INTO public.audit_events',
    'public.moderation_take_action(uuid,text,text)|v_target = v_actor|f|invalid_moderation_transition,moderation_target_unavailable,PERFORM public.moderation_transition_case,UPDATE public.profiles,INSERT INTO public.audit_events',
    'public.moderation_transition_case(uuid,public.moderation_case_status,text)|v_subject = v_actor|t|invalid_moderation_transition,UPDATE public.moderation_cases,INSERT INTO public.audit_events',
    'public.moderation_get_case(uuid)|v_target = v_actor|f|jsonb_agg,INSERT INTO public.audit_events,RETURN QUERY'
  ] LOOP
    v_spec  := pg_catalog.string_to_array(v_sig, '|');
    v_sig   := v_spec[1];
    v_guard := v_spec[2];
    v_svc   := v_spec[3] = 't';
    v_oid   := v_sig::pg_catalog.regprocedure;
    SELECT * INTO v_p FROM pg_catalog.pg_proc AS p WHERE p.oid = v_oid;

    IF NOT v_p.prosecdef THEN RAISE EXCEPTION '% must be SECURITY DEFINER', v_sig; END IF;
    IF pg_catalog.pg_get_userbyid(v_p.proowner) <> 'postgres' THEN RAISE EXCEPTION '% must be owned by postgres', v_sig; END IF;
    IF v_p.provolatile <> 'v' OR v_p.proisstrict THEN RAISE EXCEPTION '% must stay VOLATILE and not STRICT', v_sig; END IF;
    IF v_p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::TEXT[] THEN RAISE EXCEPTION '% search_path must be pinned', v_sig; END IF;

    -- ACL: EXECUTE only, no grant option; grantees exactly {postgres, authenticated} (+ service_role for moderation_transition_case).
    IF v_p.proacl IS NULL THEN RAISE EXCEPTION '% ACL must be explicit', v_sig; END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(v_p.proacl) AS a
       WHERE NOT (a.privilege_type = 'EXECUTE' AND NOT a.is_grantable
                  AND a.grantee IN ('postgres'::REGROLE, 'authenticated'::REGROLE, 'service_role'::REGROLE))
    ) THEN
      RAISE EXCEPTION '% ACL has a grantee or privilege outside owner/authenticated/service_role EXECUTE (PUBLIC, anon, grant option?)', v_sig;
    END IF;
    SELECT pg_catalog.count(DISTINCT a.grantee) INTO v_acl_n FROM pg_catalog.aclexplode(v_p.proacl) AS a;
    v_expect := 2;
    IF v_svc THEN v_expect := 3; END IF;
    IF v_acl_n <> v_expect THEN RAISE EXCEPTION '% ACL grantee count must be %', v_sig, v_expect; END IF;
    IF NOT pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN RAISE EXCEPTION '% must be executable by authenticated', v_sig; END IF;
    IF pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE') THEN RAISE EXCEPTION '% must not be executable by anon', v_sig; END IF;
    IF pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') IS DISTINCT FROM v_svc THEN
      RAISE EXCEPTION '% service_role EXECUTE must be %', v_sig, v_svc;
    END IF;

    -- Guard structure (textual only): moderator gate still present; the exact error is raised once; the guard predicate exists and comes
    -- BEFORE every early return / write marker for this function.
    v_src := v_p.prosrc;
    IF pg_catalog.strpos(v_src, 'private.is_trusted_moderator()') = 0 THEN RAISE EXCEPTION '% lost the moderator gate', v_sig; END IF;
    v_n := (pg_catalog.length(v_src) - pg_catalog.length(pg_catalog.replace(v_src, 'moderation_self_action_not_allowed', ''))) / pg_catalog.length('moderation_self_action_not_allowed');
    IF v_n <> 1 THEN RAISE EXCEPTION '% must raise moderation_self_action_not_allowed exactly once (found %)', v_sig, v_n; END IF;
    v_pos := pg_catalog.strpos(v_src, v_guard);
    IF v_pos = 0 THEN RAISE EXCEPTION '% lost the self-action guard predicate (%)', v_sig, v_guard; END IF;
    IF pg_catalog.strpos(v_src, 'ERRCODE = ''23514''') = 0 THEN RAISE EXCEPTION '% lost ERRCODE 23514', v_sig; END IF;
    IF v_pos > pg_catalog.strpos(v_src, 'moderation_self_action_not_allowed') THEN RAISE EXCEPTION '% guard predicate must precede its RAISE', v_sig; END IF;
    FOREACH v_mark IN ARRAY pg_catalog.string_to_array(v_spec[4], ',') LOOP
      IF pg_catalog.strpos(v_src, v_mark) = 0 THEN RAISE EXCEPTION '% lost expected statement marker (%)', v_sig, v_mark; END IF;
      IF pg_catalog.strpos(v_src, v_mark) < v_pos THEN RAISE EXCEPTION '% guard must precede first (%)', v_sig, v_mark; END IF;
    END LOOP;
    IF v_guard = 'v_subject = v_actor' AND pg_catalog.strpos(v_src, 'v_actor IS NOT NULL AND v_subject IS NOT NULL AND v_subject = v_actor') = 0 THEN
      RAISE EXCEPTION '% guard must not apply to the service_role system principal (v_actor IS NULL)', v_sig;
    END IF;
  END LOOP;

  -- take_action: the old inner suspend/lift guard is replaced by the single early guard; the six actions are still the only ones.
  SELECT p.prosrc INTO v_src FROM pg_catalog.pg_proc AS p WHERE p.oid = 'public.moderation_take_action(uuid,text,text)'::pg_catalog.regprocedure;
  IF pg_catalog.strpos(v_src, '''start_review'', ''warn'', ''suspend'', ''dismiss'', ''lift_suspension'', ''close'')') = 0 THEN
    RAISE EXCEPTION 'moderation_take_action action list changed';
  END IF;

  -- Registry: every moderation_* function in public is accounted for, so a future moderation RPC cannot be added without revisiting this guard.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p
     WHERE p.pronamespace = 'public'::pg_catalog.regnamespace
       AND p.proname::TEXT COLLATE "C" LIKE 'moderation\_%'
       AND p.oid NOT IN (
         'public.moderation_list_queue(text,integer,integer)'::pg_catalog.regprocedure,
         'public.moderation_get_case(uuid)'::pg_catalog.regprocedure,
         'public.moderation_open_case(uuid,text)'::pg_catalog.regprocedure,
         'public.moderation_take_action(uuid,text,text)'::pg_catalog.regprocedure,
         'public.moderation_transition_case(uuid,public.moderation_case_status,text)'::pg_catalog.regprocedure)
  ) THEN
    RAISE EXCEPTION 'an unreviewed moderation_* function exists in public: add it to the self-action guard and to this check';
  END IF;
END
$assert$;

COMMIT;
