BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(89);

-- P5-01 moderation console RPCs (migration 20261024000130). Fixture IDs 0000...0b01..0b09 are synthetic; the transaction rolls back.
--   0b01 moderator (app_metadata.role)   0b02 plain member   0b03 reporter   0b04 target A (underage report)   0b05 target B (scam)
--   0b06 target C (harassment, suspended later)   0b07 moderator-as-target (self-action guard)   0b08 user_metadata "moderator" impostor
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
SELECT ('00000000-0000-0000-0000-00000000' || pg_catalog.lpad(g::TEXT, 4, '0'))::UUID, 'authenticated', 'authenticated',
       'p501-' || g || '@example.test', pg_catalog.now(), pg_catalog.now()
  FROM (VALUES ('0b01'), ('0b02'), ('0b03'), ('0b04'), ('0b05'), ('0b06'), ('0b07'), ('0b08')) AS v(g);
-- hex ids: lpad of text keeps '0b01' as is
INSERT INTO public.profiles (id, display_name, birth_date, verification_status, is_discoverable, is_suspended)
SELECT u.id, 'P5-01 ' || pg_catalog.right(u.id::TEXT, 4), DATE '1990-01-01', 'verified'::public.verification_state, TRUE, FALSE
  FROM auth.users AS u WHERE u.email LIKE 'p501-%@example.test';

INSERT INTO public.reports (id, reporter_id, reported_user_id, category, context_summary, severity, created_at) VALUES
 ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000b04', 'underage', 'p501 underage concern', 'normal', pg_catalog.now() - INTERVAL '10 minutes'),
 ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000b05', 'scam', 'p501 money request', 'high', pg_catalog.now() - INTERVAL '2 hours'),
 ('00000000-0000-0000-0000-0000000c0003', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000b06', 'harassment', 'p501 harassment', 'normal', pg_catalog.now() - INTERVAL '3 hours'),
 ('00000000-0000-0000-0000-0000000c0004', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000b07', 'other', 'p501 moderator reported', 'low', pg_catalog.now() - INTERVAL '4 hours'),
 ('00000000-0000-0000-0000-0000000c0005', '00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-000000000b05', 'safety', 'p501 second report on B', 'normal', pg_catalog.now() - INTERVAL '5 hours');
INSERT INTO public.blocks (blocker_id, blocked_id) VALUES
 ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-000000000b05'),
 ('00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000b05');

-- 1. catalog: shape and privileges of the four new functions
SELECT is((SELECT COUNT(*)::INT FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('moderation_list_queue','moderation_get_case','moderation_open_case','moderation_take_action')), 4, 'the four console RPCs exist');
SELECT is((SELECT COUNT(*)::INT FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('moderation_list_queue','moderation_get_case','moderation_open_case','moderation_take_action')
            AND prosecdef AND pg_get_userbyid(proowner) = 'postgres' AND proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]), 4, 'all are SECURITY DEFINER, owned by postgres, with a pinned search_path');
SELECT is((SELECT COUNT(*)::INT FROM pg_proc p WHERE pronamespace = 'public'::regnamespace AND proname IN ('moderation_list_queue','moderation_get_case','moderation_open_case','moderation_take_action')
            AND has_function_privilege('authenticated', p.oid, 'EXECUTE')), 4, 'authenticated can execute all four');
SELECT is((SELECT COUNT(*)::INT FROM pg_proc p WHERE pronamespace = 'public'::regnamespace AND proname IN ('moderation_list_queue','moderation_get_case','moderation_open_case','moderation_take_action')
            AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('service_role', p.oid, 'EXECUTE'))), 0, 'anon and service_role cannot execute any of them');
SELECT is((SELECT COUNT(*)::INT FROM pg_proc p WHERE pronamespace = 'public'::regnamespace AND proname IN ('moderation_list_queue','moderation_get_case','moderation_open_case','moderation_take_action')
            AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0))), 0, 'none is executable by PUBLIC (ACL is explicit)');
SELECT ok(NOT has_table_privilege('authenticated', 'public.audit_events', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.audit_events', 'INSERT'),
          'moderators cannot read or write audit_events directly: only the definer RPCs touch it');
SELECT ok(NOT has_table_privilege('authenticated', 'public.moderation_cases', 'UPDATE') AND NOT has_table_privilege('authenticated', 'public.moderation_cases', 'INSERT')
          AND NOT has_table_privilege('authenticated', 'public.reports', 'UPDATE'), 'no new direct write path on reports/moderation_cases was opened');

-- 2. anon is rejected
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.moderation_list_queue()$$, '42501', NULL, 'anon cannot list the queue');
SELECT throws_ok($$SELECT * FROM public.moderation_get_case('00000000-0000-0000-0000-0000000c0001')$$, '42501', NULL, 'anon cannot read a case');
SELECT throws_ok($$SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000c0001', 'anon attempt reason')$$, '42501', NULL, 'anon cannot open a case');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action('00000000-0000-0000-0000-0000000c0001', 'warn', 'anon attempt reason')$$, '42501', NULL, 'anon cannot act');
RESET ROLE;

-- 3. signed-in non-moderators (plain, user_metadata impostor, service_role JWT) are rejected inside the function
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000b02","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.moderation_list_queue()$$, '42501', 'moderator_required', 'plain member cannot list the queue');
SELECT throws_ok($$SELECT * FROM public.moderation_get_case('00000000-0000-0000-0000-0000000c0001')$$, '42501', 'moderator_required', 'plain member cannot read a case');
SELECT throws_ok($$SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000c0001', 'member attempt reason')$$, '42501', 'moderator_required', 'plain member cannot open a case');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action('00000000-0000-0000-0000-0000000c0001', 'suspend', 'member attempt reason')$$, '42501', 'moderator_required', 'plain member cannot act');
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000b08","role":"authenticated","user_metadata":{"role":"moderator"},"app_metadata":{}}';
SELECT throws_ok($$SELECT * FROM public.moderation_list_queue()$$, '42501', 'moderator_required', 'user_metadata role=moderator does not grant access (list)');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action('00000000-0000-0000-0000-0000000c0001', 'suspend', 'impostor attempt reason')$$, '42501', 'moderator_required', 'user_metadata role=moderator does not grant access (act)');
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000b08","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT throws_ok($$SELECT * FROM public.moderation_list_queue()$$, '42501', 'moderator_required', 'only the moderator role is trusted by the database (admin is not)');
RESET ROLE;
RESET "request.jwt.claims";
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claims" = '{"role":"service_role"}';
SELECT throws_ok($$SELECT * FROM public.moderation_list_queue()$$, '42501', NULL, 'service_role has no EXECUTE: console actions always have a human actor');
RESET ROLE;
RESET "request.jwt.claims";
SELECT is((SELECT COUNT(*)::INT FROM public.audit_events WHERE action::TEXT COLLATE "C" LIKE 'moderation.%' AND actor_id IN ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-000000000b08')), 0, 'rejected callers left no audit rows');

-- 4. moderator: queue
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000b01","role":"authenticated","app_metadata":{"role":"moderator"}}';
SELECT is((SELECT COUNT(*)::INT FROM public.moderation_list_queue('active') WHERE report_id::TEXT LIKE '00000000-0000-0000-0000-0000000c000%'), 5, 'active queue lists unopened reports (real reports, no case needed)');
SELECT is((SELECT report_id::TEXT FROM public.moderation_list_queue('active') WHERE report_id::TEXT LIKE '00000000-0000-0000-0000-0000000c000%' LIMIT 1), '00000000-0000-0000-0000-0000000c0001', 'underage report sorts first');
SELECT is((SELECT severity FROM public.moderation_list_queue('active') WHERE report_id = '00000000-0000-0000-0000-0000000c0001'), 'urgent', 'underage reports are treated as urgent whatever severity was stored');
SELECT is((SELECT report_id::TEXT FROM public.moderation_list_queue('active') WHERE report_id::TEXT LIKE '00000000-0000-0000-0000-0000000c000%' OFFSET 1 LIMIT 1), '00000000-0000-0000-0000-0000000c0002', 'then high severity');
SELECT is((SELECT reports_against_count FROM public.moderation_list_queue('all') WHERE report_id = '00000000-0000-0000-0000-0000000c0002'), 2, 'reports_against_count counts all reports on the reported member');
SELECT is((SELECT reported_display_name FROM public.moderation_list_queue('all') WHERE report_id = '00000000-0000-0000-0000-0000000c0001'), 'P5-01 0b04', 'queue shows the reported member display name');
SELECT is((SELECT case_id FROM public.moderation_list_queue('all') WHERE report_id = '00000000-0000-0000-0000-0000000c0001'), NULL, 'unopened report has no case yet');
SELECT is((SELECT COUNT(*)::INT FROM public.moderation_list_queue('open')), 0, 'filter open: nothing before any case exists');
SELECT is((SELECT COUNT(*)::INT FROM public.moderation_list_queue('unopened') WHERE report_id::TEXT LIKE '00000000-0000-0000-0000-0000000c000%'), 5, 'filter unopened');
SELECT throws_ok($$SELECT * FROM public.moderation_list_queue('bogus')$$, '22023', 'invalid_moderation_filter', 'unknown filter is rejected');
SELECT is((SELECT COUNT(*)::INT FROM public.moderation_list_queue('all', 1, 0)), 1, 'limit is honoured');
SELECT ok((SELECT COUNT(*)::INT FROM public.moderation_list_queue('all', 100000, -5)) <= 100, 'limit is clamped to 100 and a negative offset to 0');
SELECT throws_ok($$SELECT * FROM public.moderation_get_case('00000000-0000-0000-0000-0000000cffff')$$, 'P0002', 'moderation_case_not_found', 'unknown report is not found');
SELECT throws_ok($$SELECT * FROM public.moderation_get_case(NULL)$$, '22023', 'report_required', 'null report is rejected');

-- 5. open case: reason required, idempotent, audited
SELECT throws_ok($$SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000c0001', '   ')$$, '22023', 'moderation_reason_required', 'open_case requires a reason');
SELECT throws_ok($$SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000c0001', 'short')$$, '22023', 'moderation_reason_required', 'open_case requires a meaningful reason (>= 8 chars)');
SELECT throws_ok($$SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000c0001', repeat('x', 2001))$$, '22001', 'moderation_note_too_long', 'open_case caps the reason at 2000 chars');
SELECT throws_ok($$SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000cffff', 'valid reason text')$$, 'P0002', 'moderation_case_not_found', 'open_case on an unknown report');
CREATE TEMP TABLE t_case AS SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000c0001', 'Underage concern needs urgent triage') AS id;
GRANT SELECT ON t_case TO authenticated;
SELECT ok((SELECT id IS NOT NULL FROM t_case), 'open_case returns the new case id');
SELECT is(public.moderation_open_case('00000000-0000-0000-0000-0000000c0001', 'second click, same report'), (SELECT id FROM t_case), 'open_case is idempotent (same case id)');
SELECT is((SELECT case_status FROM public.moderation_get_case('00000000-0000-0000-0000-0000000c0001')), 'open', 'new case starts open');
RESET ROLE;
SELECT is((SELECT COUNT(*)::INT FROM public.moderation_cases WHERE report_id = '00000000-0000-0000-0000-0000000c0001'), 1, 'exactly one case per report');
SELECT is((SELECT COUNT(*)::INT FROM public.audit_events WHERE action::TEXT COLLATE "C" = 'moderation.case_opened'::TEXT COLLATE "C" AND actor_id = '00000000-0000-0000-0000-000000000b01'
            AND metadata ->> 'reason' = 'Underage concern needs urgent triage' AND created_at IS NOT NULL), 1, 'case opening is audited once: who, when, why');
SELECT is((SELECT assigned_moderator_id FROM public.moderation_cases WHERE report_id = '00000000-0000-0000-0000-0000000c0001'), '00000000-0000-0000-0000-000000000b01'::UUID, 'case is assigned to the opening moderator');
SELECT is((SELECT COUNT(*)::INT FROM public.audit_events WHERE action::TEXT COLLATE "C" = 'moderation.case_viewed'::TEXT COLLATE "C" AND actor_id = '00000000-0000-0000-0000-000000000b01'), 1, 'reading a case is audited');

-- 6. actions: validation
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case), 'start_review', NULL)$$, '22023', 'moderation_reason_required', 'an action without a reason is rejected');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case), 'start_review', 'tiny')$$, '22023', 'moderation_reason_required', 'a trivially short reason is rejected');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case), 'start_review', repeat('y', 2001))$$, '22001', 'moderation_note_too_long', 'an over-long reason is rejected');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case), 'ban_forever', 'not a real action')$$, '22023', 'invalid_moderation_action', 'unknown action is rejected');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action('00000000-0000-0000-0000-0000000cffff', 'warn', 'case does not exist')$$, 'P0002', 'moderation_case_not_found', 'unknown case is rejected');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case), 'suspend', 'cannot skip review step')$$, '23514', 'invalid_moderation_transition', 'cannot suspend straight from open (review first)');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case), 'lift_suspension', 'cannot lift from open case')$$, '23514', 'invalid_moderation_transition', 'cannot lift a suspension from an open case');
RESET ROLE;
SELECT is((SELECT COUNT(*)::INT FROM public.audit_events WHERE action::TEXT COLLATE "C" IN ('moderation.action', 'moderation.case_transition') AND target_id = (SELECT id FROM t_case)), 0, 'rejected actions wrote nothing');
SELECT is((SELECT is_suspended FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000b04'), FALSE, 'rejected actions did not suspend anyone');

-- 7. actions: happy paths, audit trail, suspension side effect
SET LOCAL ROLE authenticated;
SELECT is((SELECT case_status FROM public.moderation_take_action((SELECT id FROM t_case), 'start_review', 'Picking this up for review now')), 'in_review', 'start_review moves open -> in_review');
SELECT is((SELECT status::TEXT FROM public.reports WHERE id = '00000000-0000-0000-0000-0000000c0001'), 'under_review', 'report status follows (under_review)');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case), 'start_review', 'double start should fail')$$, '23514', 'invalid_moderation_transition', 'cannot start review twice');
SELECT is((SELECT reported_is_suspended FROM public.moderation_take_action((SELECT id FROM t_case), 'suspend', 'Confirmed underage profile; suspending pending ID')), TRUE, 'suspend returns the new suspension state');
RESET ROLE;
SELECT is((SELECT is_suspended FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000b04'), TRUE, 'the reported member is suspended');
SELECT is((SELECT status::TEXT FROM public.moderation_cases WHERE id = (SELECT id FROM t_case)), 'resolved', 'case is resolved');
SELECT is((SELECT resolution_code FROM public.moderation_cases WHERE id = (SELECT id FROM t_case)), 'suspended', 'resolution_code records the decision');
SELECT is((SELECT closed_at IS NOT NULL FROM public.moderation_cases WHERE id = (SELECT id FROM t_case)), TRUE, 'closed_at is set when resolved');
SELECT is((SELECT status::TEXT FROM public.reports WHERE id = '00000000-0000-0000-0000-0000000c0001'), 'actioned', 'report status is actioned');
SELECT is((SELECT COUNT(*)::INT FROM public.audit_events WHERE action::TEXT COLLATE "C" = 'moderation.action'::TEXT COLLATE "C" AND target_id = (SELECT id FROM t_case)
            AND actor_id = '00000000-0000-0000-0000-000000000b01' AND created_at IS NOT NULL), 2, 'each action has a moderation.action row with actor and timestamp');
SELECT is((SELECT metadata ->> 'reason' FROM public.audit_events WHERE action::TEXT COLLATE "C" = 'moderation.action'::TEXT COLLATE "C" AND metadata ->> 'action' = 'suspend'), 'Confirmed underage profile; suspending pending ID', 'the audit row stores the reason (why)');
SELECT is((SELECT (metadata ->> 'suspended_before') || '>' || (metadata ->> 'suspended_after') FROM public.audit_events WHERE action::TEXT COLLATE "C" = 'moderation.action'::TEXT COLLATE "C" AND metadata ->> 'action' = 'suspend'), 'false>true', 'the audit row records the suspension before/after');
SELECT is((SELECT metadata ->> 'reported_user_id' FROM public.audit_events WHERE action::TEXT COLLATE "C" = 'moderation.action'::TEXT COLLATE "C" AND metadata ->> 'action' = 'suspend'), '00000000-0000-0000-0000-000000000b04', 'the audit row names the affected member');
SELECT is((SELECT COUNT(*)::INT FROM public.audit_events WHERE action::TEXT COLLATE "C" = 'moderation.case_transition'::TEXT COLLATE "C" AND target_id = (SELECT id FROM t_case)), 2, 'the state machine (moderation_transition_case) still audits each transition');

-- history is readable through the RPC
SET LOCAL ROLE authenticated;
SELECT is((SELECT jsonb_array_length(history) FROM public.moderation_get_case('00000000-0000-0000-0000-0000000c0001')) >= 5, TRUE, 'case detail includes the audit history');
SELECT ok((SELECT history @> '[{"action":"moderation.case_opened"}]'::JSONB AND history @> '[{"action":"moderation.action"}]'::JSONB FROM public.moderation_get_case('00000000-0000-0000-0000-0000000c0001')), 'history carries the open and action events with actor ids and timestamps');
SELECT is((SELECT blocks_against_count FROM public.moderation_get_case('00000000-0000-0000-0000-0000000c0002')), 2, 'case detail shows how many members blocked the reported member');
SELECT is((SELECT reporter_id FROM public.moderation_get_case('00000000-0000-0000-0000-0000000c0002')), '00000000-0000-0000-0000-000000000b03'::UUID, 'case detail includes the reporter id for abuse-pattern review');
-- lift suspension (appeal outcome) from resolved
SELECT is((SELECT reported_is_suspended FROM public.moderation_take_action((SELECT id FROM t_case), 'lift_suspension', 'Appeal upheld: age verified by support')), FALSE, 'lift_suspension restores the member');
RESET ROLE;
SELECT is((SELECT status::TEXT FROM public.moderation_cases WHERE id = (SELECT id FROM t_case)), 'closed', 'case closed after lifting');
SELECT is((SELECT is_suspended FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000b04'), FALSE, 'member is no longer suspended');

-- 8. dismiss / warn / not-suspended / self-action guards
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE t_case2 AS SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000c0002', 'Money request reported twice') AS id;
GRANT SELECT ON t_case2 TO authenticated;
SELECT lives_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case2), 'start_review', 'Reviewing scam report now')$$, 't_case2: start_review');
SELECT is((SELECT case_status FROM public.moderation_take_action((SELECT id FROM t_case2), 'dismiss', 'No evidence of a money request in messages')), 'closed', 'dismiss closes the case');
RESET ROLE;
SELECT is((SELECT status::TEXT FROM public.reports WHERE id = '00000000-0000-0000-0000-0000000c0002'), 'dismissed', 'dismissed report is marked dismissed');
SELECT is((SELECT is_suspended FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000b05'), FALSE, 'dismiss does not suspend');
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE t_case3 AS SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000c0003', 'Harassment report, first offence') AS id;
GRANT SELECT ON t_case3 TO authenticated;
SELECT lives_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case3), 'start_review', 'Reviewing harassment report')$$, 't_case3: start_review');
SELECT is((SELECT case_status FROM public.moderation_take_action((SELECT id FROM t_case3), 'warn', 'First offence: recorded warning, no suspension')), 'resolved', 'warn resolves without suspending');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case3), 'lift_suspension', 'nothing to lift here')$$, '23514', 'moderation_not_suspended', 'cannot lift a suspension that does not exist');
SELECT is((SELECT case_status FROM public.moderation_take_action((SELECT id FROM t_case3), 'close', 'Closing after warning delivered')), 'closed', 'close finishes a resolved case');
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case3), 'close', 'closing twice must fail')$$, '23514', 'invalid_moderation_transition', 'a closed case is final');
CREATE TEMP TABLE t_case4 AS SELECT public.moderation_open_case('00000000-0000-0000-0000-0000000c0004', 'Moderator account was reported') AS id;
GRANT SELECT ON t_case4 TO authenticated;
SELECT lives_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case4), 'start_review', 'Reviewing report about a moderator')$$, 't_case4: start_review');
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000b07","role":"authenticated","app_metadata":{"role":"moderator"}}';
SELECT throws_ok($$SELECT * FROM public.moderation_take_action((SELECT id FROM t_case4), 'suspend', 'trying to suspend myself')$$, '23514', 'moderation_self_action_not_allowed', 'a moderator cannot suspend their own account');
RESET ROLE;
RESET "request.jwt.claims";
SELECT is((SELECT is_suspended FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000b07'), FALSE, 'self-suspension attempt changed nothing');
SELECT is((SELECT COUNT(DISTINCT actor_id)::INT FROM public.audit_events WHERE action::TEXT COLLATE "C" = 'moderation.action'::TEXT COLLATE "C" AND actor_id IS NOT NULL), 1, 'every recorded action carries a human actor id');

-- 9. no new default-ACL / PUBLIC exposure was introduced by the migration (LB-3)
SELECT is((SELECT COUNT(*)::INT FROM pg_default_acl d, aclexplode(d.defaclacl) x
            WHERE pg_get_userbyid(d.defaclrole) = 'postgres' AND d.defaclobjtype = 'f' AND (d.defaclnamespace = 'public'::regnamespace OR d.defaclnamespace = 0) AND (x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon', 'authenticated'))), 0,
          'default ACLs for new postgres functions still grant nothing to PUBLIC/anon/authenticated');

SELECT * FROM finish();
ROLLBACK;
