BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(58);

-- N46-02 (Themis, PR #46): recusal for EVERY moderation RPC (migration 20261024000150). A moderator whose own account is the reported member
-- of a report/case cannot open, view, act on or transition it; same error as the pre-existing suspend guard; nothing is written on denial.
-- Fixture ids 0000...0d01..0d04 and reports ...0e0001..0e0006 are synthetic; the transaction rolls back.
--   0d01 moderator M1 (never the subject)   0d02 moderator M2 (the subject of reports 1..5)   0d03 reporter   0d04 ordinary member (subject of report 6)
--   report 1 unopened | 2 case open | 3 case in_review | 4 case resolved (warned) | 5 case appealed | 6 about a plain member (M2 may act on it)
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
SELECT ('00000000-0000-0000-0000-00000000' || g)::UUID, 'authenticated', 'authenticated', 'n4602-' || g || '@example.test', pg_catalog.now(), pg_catalog.now()
  FROM (VALUES ('0d01'), ('0d02'), ('0d03'), ('0d04')) AS v(g);
INSERT INTO public.profiles (id, display_name, birth_date, verification_status, is_discoverable, is_suspended)
SELECT u.id, 'N46-02 ' || pg_catalog.right(u.id::TEXT, 4), DATE '1990-01-01', 'verified'::public.verification_state, TRUE, FALSE
  FROM auth.users AS u WHERE u.email LIKE 'n4602-%@example.test';
INSERT INTO public.reports (id, reporter_id, reported_user_id, category, context_summary, severity, created_at) VALUES
 ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-000000000d02', 'other', 'n4602 report 1', 'normal', pg_catalog.now() - INTERVAL '1 hours'),
 ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-000000000d02', 'other', 'n4602 report 2', 'normal', pg_catalog.now() - INTERVAL '2 hours'),
 ('00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-000000000d02', 'other', 'n4602 report 3', 'normal', pg_catalog.now() - INTERVAL '3 hours'),
 ('00000000-0000-0000-0000-0000000e0004', '00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-000000000d02', 'other', 'n4602 report 4', 'normal', pg_catalog.now() - INTERVAL '4 hours'),
 ('00000000-0000-0000-0000-0000000e0005', '00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-000000000d02', 'other', 'n4602 report 5', 'normal', pg_catalog.now() - INTERVAL '5 hours'),
 ('00000000-0000-0000-0000-0000000e0006', '00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-000000000d04', 'other', 'n4602 report 6', 'normal', pg_catalog.now() - INTERVAL '6 hours');

-- 1. catalog posture after the migration (restated by the migration's own closing check; here as assertions)
SELECT is((SELECT COUNT(*)::INT FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('moderation_open_case','moderation_take_action','moderation_get_case','moderation_transition_case')
            AND prosecdef AND pg_get_userbyid(proowner) = 'postgres' AND provolatile = 'v' AND NOT proisstrict AND proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]), 4,
          'the four guarded RPCs are SECURITY DEFINER, owner postgres, VOLATILE, pinned search_path');
SELECT is((SELECT COUNT(*)::INT FROM pg_proc p WHERE pronamespace = 'public'::regnamespace AND proname IN ('moderation_open_case','moderation_take_action','moderation_get_case')
            AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
            AND (SELECT COUNT(DISTINCT a.grantee) FROM aclexplode(p.proacl) a) = 2 AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 OR a.is_grantable)), 3,
          'open_case / take_action / get_case: ACL is exactly owner + authenticated');
SELECT is((SELECT COUNT(*)::INT FROM pg_proc p WHERE pronamespace = 'public'::regnamespace AND proname = 'moderation_transition_case'
            AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND has_function_privilege('service_role', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
            AND (SELECT COUNT(DISTINCT a.grantee) FROM aclexplode(p.proacl) a) = 3 AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 OR a.is_grantable)), 1,
          'moderation_transition_case: ACL unchanged (owner + authenticated + service_role)');
SELECT is((SELECT COUNT(*)::INT FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'moderation\_%'), 5, 'exactly five moderation_* functions exist (all accounted for by the guard check)');

-- 2. moderator M1 (not a subject) builds cases about M2 and drives them to different states
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000d01","role":"authenticated","app_metadata":{"role":"moderator"}}';
CREATE TEMP TABLE t_case2 AS SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000e0002', 'Report two about a moderator account') AS id;
GRANT SELECT ON t_case2 TO authenticated;
CREATE TEMP TABLE t_case3 AS SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000e0003', 'Report three about a moderator account') AS id;
GRANT SELECT ON t_case3 TO authenticated;
CREATE TEMP TABLE t_case4 AS SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000e0004', 'Report four about a moderator account') AS id;
GRANT SELECT ON t_case4 TO authenticated;
CREATE TEMP TABLE t_case5 AS SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000e0005', 'Report five about a moderator account') AS id;
GRANT SELECT ON t_case5 TO authenticated;
SELECT ok((SELECT COUNT(*) FROM (SELECT id FROM t_case2 UNION ALL SELECT id FROM t_case3 UNION ALL SELECT id FROM t_case4 UNION ALL SELECT id FROM t_case5) x WHERE id IS NOT NULL) = 4,
          'a non-subject moderator can open cases about another moderator');
SELECT lives_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case3), 'start_review', 'M1 reviewing report three')$$, 'non-subject moderator: start_review');
SELECT lives_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case4), 'start_review', 'M1 reviewing report four')$$, 'non-subject moderator: start_review (case 4)');
SELECT is((SELECT case_status FROM public.moderation_take_action((SELECT id FROM t_case4), 'warn', 'M1 warns on report four')), 'resolved', 'non-subject moderator: warn');
SELECT lives_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case5), 'start_review', 'M1 reviewing report five')$$, 'non-subject moderator: start_review (case 5)');
SELECT lives_ok($$SELECT public.moderation_transition_case((SELECT id FROM t_case5), 'appealed'::public.moderation_case_status, 'M1 moves case five to appealed')$$, 'non-subject moderator: moderation_transition_case');
SELECT lives_ok($$SELECT * FROM public.moderation_get_case('00000000-0000-0000-0000-0000000e0003')$$, 'non-subject moderator can view a case about another moderator');
RESET ROLE;
RESET "request.jwt.claims";

-- snapshot everything a denied call could change
CREATE TEMP TABLE t_snap AS SELECT
  (SELECT COUNT(*) FROM public.audit_events WHERE action::TEXT COLLATE "C" LIKE 'moderation.%') AS audit_n,
  (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(mc.id::TEXT || mc.status::TEXT || COALESCE(mc.resolution_code, '') || COALESCE(mc.assigned_moderator_id::TEXT, '') || COALESCE(mc.closed_at::TEXT, ''), ',' ORDER BY mc.id), '')) FROM public.moderation_cases mc) AS cases_md5,
  (SELECT COUNT(*) FROM public.moderation_cases) AS cases_n,
  (SELECT pg_catalog.md5(string_agg(r.id::TEXT || r.status::TEXT, ',' ORDER BY r.id)) FROM public.reports r) AS reports_md5,
  (SELECT pg_catalog.md5(string_agg(p.id::TEXT || p.is_suspended::TEXT, ',' ORDER BY p.id)) FROM public.profiles p) AS profiles_md5;

-- 3. moderator M2 (the subject): every RPC is refused with the existing guard's error
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000d02","role":"authenticated","app_metadata":{"role":"moderator"}}';
SELECT throws_ok($$SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000e0001', 'M2 opening a case about themself')$$, '23514', 'moderation_self_action_not_allowed', 'open_case: refused for an unopened report about the caller');
SELECT throws_ok($$SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000e0002', 'M2 re-opening their own case')$$, '23514', 'moderation_self_action_not_allowed', 'open_case: refused even when the case exists (the idempotent return does not hand back the id)');
SELECT throws_ok($$SELECT * FROM public.moderation_get_case('00000000-0000-0000-0000-0000000e0001')$$, '23514', 'moderation_self_action_not_allowed', 'get_case: refused for an unopened report about the caller');
SELECT throws_ok($$SELECT * FROM public.moderation_get_case('00000000-0000-0000-0000-0000000e0003')$$, '23514', 'moderation_self_action_not_allowed', 'get_case: refused for a case about the caller');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case2), 'start_review', 'M2 acting on their own case')$$, '23514', 'moderation_self_action_not_allowed', 'take_action start_review: refused (open case)');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case2), 'suspend', 'M2 acting on their own case')$$, '23514', 'moderation_self_action_not_allowed', 'take_action suspend: refused (open case: guard precedes the state check)');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case3), 'warn', 'M2 acting on their own case')$$, '23514', 'moderation_self_action_not_allowed', 'take_action warn: refused (in_review case)');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case3), 'suspend', 'M2 acting on their own case')$$, '23514', 'moderation_self_action_not_allowed', 'take_action suspend: refused (in_review case)');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case3), 'dismiss', 'M2 acting on their own case')$$, '23514', 'moderation_self_action_not_allowed', 'take_action dismiss: refused (in_review case)');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case3), 'close', 'M2 acting on their own case')$$, '23514', 'moderation_self_action_not_allowed', 'take_action close: refused (in_review case: guard precedes the state check)');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case4), 'lift_suspension', 'M2 acting on their own case')$$, '23514', 'moderation_self_action_not_allowed', 'take_action lift_suspension: refused (resolved case)');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case4), 'close', 'M2 acting on their own case')$$, '23514', 'moderation_self_action_not_allowed', 'take_action close: refused (resolved case)');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case5), 'start_review', 'M2 acting on their own case')$$, '23514', 'moderation_self_action_not_allowed', 'take_action start_review: refused (appealed case)');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case5), 'lift_suspension', 'M2 acting on their own case')$$, '23514', 'moderation_self_action_not_allowed', 'take_action lift_suspension: refused (appealed case)');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case5), 'close', 'M2 acting on their own case')$$, '23514', 'moderation_self_action_not_allowed', 'take_action close: refused (appealed case)');
SELECT throws_ok($$SELECT public.moderation_transition_case((SELECT id FROM t_case2), 'in_review'::public.moderation_case_status, 'M2 moving their own case')$$, '23514', 'moderation_self_action_not_allowed', 'transition_case -> in_review: refused (case 2)');
SELECT throws_ok($$SELECT public.moderation_transition_case((SELECT id FROM t_case3), 'resolved'::public.moderation_case_status, 'M2 moving their own case')$$, '23514', 'moderation_self_action_not_allowed', 'transition_case -> resolved: refused (case 3)');
SELECT throws_ok($$SELECT public.moderation_transition_case((SELECT id FROM t_case3), 'appealed'::public.moderation_case_status, 'M2 moving their own case')$$, '23514', 'moderation_self_action_not_allowed', 'transition_case -> appealed: refused (case 3)');
SELECT throws_ok($$SELECT public.moderation_transition_case((SELECT id FROM t_case3), 'closed'::public.moderation_case_status, 'M2 moving their own case')$$, '23514', 'moderation_self_action_not_allowed', 'transition_case -> closed: refused (case 3)');
SELECT throws_ok($$SELECT public.moderation_transition_case((SELECT id FROM t_case4), 'appealed'::public.moderation_case_status, 'M2 moving their own case')$$, '23514', 'moderation_self_action_not_allowed', 'transition_case -> appealed: refused (case 4)');
SELECT throws_ok($$SELECT public.moderation_transition_case((SELECT id FROM t_case4), 'closed'::public.moderation_case_status, 'M2 moving their own case')$$, '23514', 'moderation_self_action_not_allowed', 'transition_case -> closed: refused (case 4)');
SELECT throws_ok($$SELECT public.moderation_transition_case((SELECT id FROM t_case5), 'in_review'::public.moderation_case_status, 'M2 moving their own case')$$, '23514', 'moderation_self_action_not_allowed', 'transition_case -> in_review: refused (case 5)');
SELECT throws_ok($$SELECT public.moderation_transition_case((SELECT id FROM t_case5), 'resolved'::public.moderation_case_status, 'M2 moving their own case')$$, '23514', 'moderation_self_action_not_allowed', 'transition_case -> resolved: refused (case 5)');
SELECT throws_ok($$SELECT public.moderation_transition_case((SELECT id FROM t_case5), 'closed'::public.moderation_case_status, 'M2 moving their own case')$$, '23514', 'moderation_self_action_not_allowed', 'transition_case -> closed: refused (case 5)');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case3), 'ban_forever', 'M2 invalid action')$$, '22023', 'invalid_moderation_action', 'input validation still runs first (unchanged)');
RESET ROLE;
RESET "request.jwt.claims";

-- 4. nothing was written by any refused call (rolled-back statements leave no audit row, case, status, suspension or report change)
SELECT is((SELECT COUNT(*) FROM public.audit_events WHERE action::TEXT COLLATE "C" LIKE 'moderation.%'), (SELECT audit_n FROM t_snap), 'no audit_events row was written by a refused call');
SELECT is((SELECT COUNT(*)::INT FROM public.audit_events WHERE actor_id = '00000000-0000-0000-0000-000000000d02'), 0, 'no audit row carries the refused moderator as actor');
SELECT is((SELECT COUNT(*) FROM public.moderation_cases WHERE report_id = '00000000-0000-0000-0000-0000000e0001'), 0::BIGINT, 'no case was created for the unopened self report');
SELECT is((SELECT COUNT(*) FROM public.moderation_cases), (SELECT cases_n FROM t_snap), 'no case row was added');
SELECT is((SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(mc.id::TEXT || mc.status::TEXT || COALESCE(mc.resolution_code, '') || COALESCE(mc.assigned_moderator_id::TEXT, '') || COALESCE(mc.closed_at::TEXT, ''), ',' ORDER BY mc.id), '')) FROM public.moderation_cases mc), (SELECT cases_md5 FROM t_snap), 'no case changed status, resolution, assignee or closed_at');
SELECT is((SELECT pg_catalog.md5(string_agg(r.id::TEXT || r.status::TEXT, ',' ORDER BY r.id)) FROM public.reports r), (SELECT reports_md5 FROM t_snap), 'no report status changed');
SELECT is((SELECT pg_catalog.md5(string_agg(p.id::TEXT || p.is_suspended::TEXT, ',' ORDER BY p.id)) FROM public.profiles p), (SELECT profiles_md5 FROM t_snap), 'no profile suspension changed');
SELECT is((SELECT COUNT(*)::INT FROM public.audit_events WHERE action::TEXT COLLATE "C" = 'moderation.case_viewed'::TEXT COLLATE "C" AND actor_id = '00000000-0000-0000-0000-000000000d02'), 0, 'a refused view left no moderation.case_viewed row');

-- 5. the guard is about the subject, not the account: M2 can still work on a case about someone else
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000d02","role":"authenticated","app_metadata":{"role":"moderator"}}';
CREATE TEMP TABLE t_case6 AS SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000e0006', 'M2 opens a case about a plain member') AS id;
GRANT SELECT ON t_case6 TO authenticated;
SELECT ok((SELECT id IS NOT NULL FROM t_case6), 'subject-moderator can open a case about someone else');
SELECT lives_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case6), 'start_review', 'M2 reviewing a case about a plain member')$$, 'subject-moderator can start_review on someone else');
SELECT is((SELECT case_status FROM public.moderation_take_action((SELECT id FROM t_case6), 'dismiss', 'No evidence in the report about the member')), 'closed', 'subject-moderator can dismiss a case about someone else');
SELECT lives_ok($$SELECT * FROM public.moderation_get_case('00000000-0000-0000-0000-0000000e0006')$$, 'subject-moderator can view a case about someone else');
RESET ROLE;
RESET "request.jwt.claims";
SELECT is((SELECT COUNT(*)::INT FROM public.audit_events WHERE actor_id = '00000000-0000-0000-0000-000000000d02' AND action::TEXT COLLATE "C" IN ('moderation.case_opened', 'moderation.action', 'moderation.case_transition', 'moderation.case_viewed')), 6,
          'the permitted M2 calls on the other case ARE audited (1 opened + 2 actions + 2 transitions + 1 view)');

-- 6. non-subject M1 can still complete the lifecycle of the cases about M2 (the actions M2 was refused)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000d01","role":"authenticated","app_metadata":{"role":"moderator"}}';
SELECT is((SELECT case_status FROM public.moderation_take_action((SELECT id FROM t_case3), 'dismiss', 'M1 dismisses report three')), 'closed', 'non-subject moderator: dismiss on a case about M2');
SELECT is((SELECT case_status FROM public.moderation_take_action((SELECT id FROM t_case4), 'close', 'M1 closes report four')), 'closed', 'non-subject moderator: close');
SELECT is((SELECT case_status FROM public.moderation_take_action((SELECT id FROM t_case2), 'start_review', 'M1 reviews report two')), 'in_review', 'non-subject moderator: start_review on an open case about M2');
SELECT is((SELECT reported_is_suspended FROM public.moderation_take_action((SELECT id FROM t_case2), 'suspend', 'M1 suspends the account in report two')), TRUE, 'non-subject moderator: suspend (the sanction itself still works for others)');
RESET ROLE;
RESET "request.jwt.claims";
SELECT is((SELECT is_suspended FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000d02'), TRUE, 'M1 really did suspend M2 (recusal does not protect the subject)');

-- 7. the service_role system principal (no auth.uid()) is unchanged: it may still transition a case about M2
GRANT SELECT ON t_case5 TO service_role;
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claims" = '{"role":"service_role"}';
SELECT lives_ok($$SELECT public.moderation_transition_case((SELECT id FROM t_case5), 'in_review'::public.moderation_case_status, 'system actor moves case five')$$, 'service_role system actor is not subject to the self-action guard');
RESET ROLE;
RESET "request.jwt.claims";
SELECT is((SELECT metadata ->> 'actor_principal' FROM public.audit_events WHERE action::TEXT COLLATE "C" = 'moderation.case_transition'::TEXT COLLATE "C" AND target_id = (SELECT id FROM t_case5) AND metadata ->> 'note' = 'system actor moves case five'), 'service_role', 'and it is still recorded as the service_role principal');

-- 8. non-moderators still get moderator_required first (guard runs after authentication / moderator checks)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000d02","role":"authenticated","app_metadata":{}}';
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case3), 'close', 'M2 without the claim')$$, '42501', 'moderator_required', 'without the moderator claim the subject gets moderator_required, not the self-action error');
SELECT throws_ok($$SELECT public.moderation_transition_case((SELECT id FROM t_case3), 'closed'::public.moderation_case_status, 'M2 without the claim')$$, '42501', 'moderator_required', 'same for transition_case');
RESET ROLE;
RESET "request.jwt.claims";

SELECT * FROM finish();
ROLLBACK;
