-- Themis N45-01 (PR #45 review): authenticated/anon must not INSERT (or otherwise write) public.privacy_requests directly.
-- Migration 20261024000010_privacy_requests_revoke_direct_insert.sql. The only member write path is the SECURITY DEFINER RPC
-- public.request_privacy_action(), which keeps working and keeps its one-open-request-per-type rule. Behavioural assertions match
-- the permission-denied MESSAGE so they can only be satisfied by the privilege revocation (not by RLS WITH CHECK, whose error differs),
-- and a NEGATIVE-PROOF block at the end re-grants INSERT to show the same statements then succeed (i.e. the assertions are load-bearing
-- and this file FAILS if the migration is rolled back).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(50);

-- Fixtures (rolled back at the end).
DELETE FROM auth.users WHERE id IN ('00000000-0000-0000-0000-000000000331','00000000-0000-0000-0000-000000000332');
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000331','authenticated','authenticated','n45-a@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000332','authenticated','authenticated','n45-b@example.test',now(),now());
INSERT INTO public.profiles (id, display_name, birth_date, verification_status, is_discoverable, is_suspended) VALUES
 ('00000000-0000-0000-0000-000000000331','N45 Alpha',DATE '1991-01-01','verified',TRUE,FALSE),
 ('00000000-0000-0000-0000-000000000332','N45 Bravo',DATE '1991-01-02','verified',TRUE,FALSE);

-- Helper: try to flood the table through the RPC with n distinct idempotency keys; returns how many attempts were REFUSED.
-- SECURITY INVOKER (runs as the caller). Granted to authenticated for this transaction only.
CREATE FUNCTION public.t45_rpc_flood(p_type public.privacy_request_type, p_n INT) RETURNS INT LANGUAGE plpgsql AS $f$
DECLARE i INT; refused INT := 0;
BEGIN
  FOR i IN 1..p_n LOOP
    BEGIN
      PERFORM public.request_privacy_action(p_type, pg_catalog.gen_random_uuid());
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE = 'P0001' AND SQLERRM = 'privacy_request_already_open' THEN refused := refused + 1; END IF;
    END;
  END LOOP;
  RETURN refused;
END;
$f$;
GRANT EXECUTE ON FUNCTION public.t45_rpc_flood(public.privacy_request_type, INT) TO authenticated;

-- ===== 1. catalog: end-state privileges =====
SELECT ok(NOT has_table_privilege('authenticated','public.privacy_requests','INSERT')
      AND NOT has_any_column_privilege('authenticated','public.privacy_requests','INSERT'), 'authenticated has no INSERT (table or column level) on privacy_requests');
SELECT ok(NOT has_table_privilege('anon','public.privacy_requests','INSERT')
      AND NOT has_any_column_privilege('anon','public.privacy_requests','INSERT'), 'anon has no INSERT (table or column level) on privacy_requests');
SELECT ok(NOT (has_any_column_privilege('authenticated','public.privacy_requests','UPDATE') OR has_table_privilege('authenticated','public.privacy_requests','UPDATE')
            OR has_table_privilege('authenticated','public.privacy_requests','DELETE') OR has_table_privilege('authenticated','public.privacy_requests','TRUNCATE')
            OR has_table_privilege('authenticated','public.privacy_requests','REFERENCES') OR has_table_privilege('authenticated','public.privacy_requests','TRIGGER')),
  'authenticated has no UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on privacy_requests');
SELECT is((SELECT string_agg(p, ',' ORDER BY p) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
            WHERE has_table_privilege('authenticated','public.privacy_requests',p)), 'SELECT', 'authenticated keeps exactly table-level SELECT (the app lists own requests)');
SELECT is((SELECT count(*)::INT FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege('anon','public.privacy_requests',p)), 0, 'anon has no table privilege on privacy_requests');
SELECT is((SELECT count(*)::INT FROM pg_class c, LATERAL aclexplode(c.relacl) a WHERE c.oid = 'public.privacy_requests'::regclass AND a.grantee = 0), 0, 'no PUBLIC table ACL entry on privacy_requests');
SELECT is((SELECT count(*)::INT FROM pg_attribute a, LATERAL aclexplode(a.attacl) x WHERE a.attrelid = 'public.privacy_requests'::regclass AND a.attacl IS NOT NULL
            AND (x.grantee = 0 OR x.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated')))), 0, 'no column ACL entry for PUBLIC/anon/authenticated on privacy_requests');
SELECT ok(has_table_privilege('service_role','public.privacy_requests','SELECT') AND has_table_privilege('service_role','public.privacy_requests','INSERT')
      AND NOT has_table_privilege('service_role','public.privacy_requests','UPDATE') AND NOT has_table_privilege('service_role','public.privacy_requests','DELETE'), 'service_role ACL unchanged: table SELECT, INSERT only');
SELECT is((SELECT string_agg(a.attname, ',' ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid = 'public.privacy_requests'::regclass AND a.attnum > 0 AND NOT a.attisdropped
            AND has_column_privilege('service_role','public.privacy_requests',a.attname,'UPDATE') AND NOT has_table_privilege('service_role','public.privacy_requests','UPDATE')),
  'completed_at,completion_metadata,failure_code,status', 'service_role workflow column UPDATEs unchanged');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.privacy_requests'::regclass), 'RLS still enabled on privacy_requests');
SELECT ok(EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.privacy_requests'::regclass AND polname = 'privacy_requests_select_owner')
      AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.privacy_requests'::regclass AND polname = 'privacy_requests_insert_owner'), 'RLS select policy kept; insert policy kept as defence in depth');

-- ===== 2. catalog: the RPC is intact (LB-3: no ACL / default-ACL regression) =====
SELECT ok((SELECT prosecdef AND proowner = 'postgres'::regrole AND proconfig @> ARRAY['search_path=public, pg_temp']::TEXT[]
             FROM pg_proc WHERE oid = 'public.request_privacy_action(public.privacy_request_type,uuid)'::regprocedure), 'request_privacy_action is SECURITY DEFINER, owner postgres, search_path pinned');
SELECT ok(has_function_privilege('authenticated','public.request_privacy_action(public.privacy_request_type,uuid)','EXECUTE')
      AND NOT has_function_privilege('anon','public.request_privacy_action(public.privacy_request_type,uuid)','EXECUTE')
      AND NOT has_function_privilege('service_role','public.request_privacy_action(public.privacy_request_type,uuid)','EXECUTE'), 'request_privacy_action EXECUTE: authenticated only (not anon, not service_role)');
SELECT is((SELECT count(*)::INT FROM pg_proc p, LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
            WHERE p.oid = 'public.request_privacy_action(public.privacy_request_type,uuid)'::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'), 0, 'request_privacy_action has no PUBLIC EXECUTE');
-- (table default ACLs of the hosted image are open for anon/authenticated by design of the platform, tracked as LB-5; the closure of privacy_requests must not depend on them)
SELECT ok((SELECT relacl IS NOT NULL FROM pg_class WHERE oid = 'public.privacy_requests'::regclass), 'privacy_requests carries an explicit table ACL (its closure does not rely on default ACLs)');
SELECT is((SELECT count(*)::INT FROM pg_default_acl d WHERE d.defaclrole = 'postgres'::regrole AND d.defaclobjtype = 'f' AND (d.defaclnamespace = 'public'::regnamespace OR d.defaclnamespace = 0)
            AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 0 OR a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated')))), 0, 'default ACL for functions created by postgres (public/global) grants nothing to anon/authenticated/PUBLIC (LB-3 unchanged)');
SELECT is((SELECT count(*)::INT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prosrc ILIKE '%privacy_requests%' AND p.proname NOT IN ('request_privacy_action','t45_rpc_flood')
              AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'))), 0,
  'no other client-callable function touches privacy_requests');

-- ===== 3. behaviour AS authenticated user A: direct writes are refused =====
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000331","role":"authenticated"}';
SELECT throws_ok($$INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key) VALUES ('00000000-0000-0000-0000-000000000331','export','00000000-0000-0000-0000-000000000351')$$,
  '42501', 'permission denied for table privacy_requests', 'authenticated direct INSERT of own row fails with 42501');
SELECT throws_ok($$INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key) VALUES ('00000000-0000-0000-0000-000000000332','export','00000000-0000-0000-0000-000000000352')$$,
  '42501', 'permission denied for table privacy_requests', 'authenticated direct INSERT for ANOTHER user fails with 42501 (privilege, not just RLS)');
SELECT throws_ok($$INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key, status) VALUES ('00000000-0000-0000-0000-000000000331','deletion','00000000-0000-0000-0000-000000000353','completed')$$,
  '42501', 'permission denied for table privacy_requests', 'authenticated direct INSERT with status completed fails with 42501');
SELECT throws_ok($$INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key) VALUES ('00000000-0000-0000-0000-000000000331','export','00000000-0000-0000-0000-000000000354') ON CONFLICT DO NOTHING$$,
  '42501', 'permission denied for table privacy_requests', 'INSERT ... ON CONFLICT DO NOTHING fails with 42501');
SELECT throws_ok($$INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key) SELECT '00000000-0000-0000-0000-000000000331','export', pg_catalog.gen_random_uuid() FROM generate_series(1,501)$$,
  '42501', 'permission denied for table privacy_requests', 'the 501-row generate_series bulk INSERT (N45-01) is impossible: 42501');
SELECT throws_ok($$INSERT INTO public.privacy_requests DEFAULT VALUES$$, '42501', 'permission denied for table privacy_requests', 'INSERT DEFAULT VALUES fails with 42501');
SELECT throws_ok($$UPDATE public.privacy_requests SET status = 'cancelled'$$, '42501', 'permission denied for table privacy_requests', 'authenticated cannot UPDATE');
SELECT throws_ok($$DELETE FROM public.privacy_requests$$, '42501', 'permission denied for table privacy_requests', 'authenticated cannot DELETE');
SELECT is((SELECT count(*)::INT FROM public.privacy_requests), 0, 'no row was created by any refused direct write');

-- ===== 4. the RPC still works for authenticated, and keeps its rules =====
SELECT lives_ok($$SELECT public.request_privacy_action('export','00000000-0000-0000-0000-000000000361')$$, 'authenticated request_privacy_action(export) works');
SELECT is((SELECT count(*)::INT FROM public.privacy_requests WHERE request_type = 'export' AND status = 'requested' AND user_id = '00000000-0000-0000-0000-000000000331'), 1, 'RPC created exactly one own requested export row, visible through the SELECT grant');
SELECT is((SELECT public.request_privacy_action('export','00000000-0000-0000-0000-000000000361')),
          (SELECT id FROM public.privacy_requests WHERE idempotency_key = '00000000-0000-0000-0000-000000000361'), 'same idempotency key replays the same request id');
SELECT is((SELECT count(*)::INT FROM public.privacy_requests), 1, 'idempotent replay did not create a second row');
SELECT throws_ok($$SELECT public.request_privacy_action('export','00000000-0000-0000-0000-000000000362')$$, 'P0001', 'privacy_request_already_open', 'one-open-request rule: a second export with a new key is refused');
SELECT lives_ok($$SELECT public.request_privacy_action('deletion','00000000-0000-0000-0000-000000000363')$$, 'a different request type is still allowed (rule is per type)');
SELECT throws_ok($$SELECT public.request_privacy_action('deletion','00000000-0000-0000-0000-000000000364')$$, 'P0001', 'privacy_request_already_open', 'one-open-request rule also holds for deletion');
-- 501-row bypass through the only remaining path: 501 more attempts with fresh keys are ALL refused, the open count stays 1 per type.
SELECT is(public.t45_rpc_flood('export', 501), 501, '501 further RPC attempts (export) with fresh keys are all refused as already_open');
SELECT is(public.t45_rpc_flood('deletion', 501), 501, '501 further RPC attempts (deletion) with fresh keys are all refused as already_open');
SELECT is((SELECT count(*)::INT FROM public.privacy_requests), 2, 'after 1002 attempts the member still has exactly 2 rows (1 export + 1 deletion)');
RESET ROLE;
RESET "request.jwt.claims";

-- RPC side effects intact (read as owner): audit events written, rows are well-formed.
SELECT is((SELECT count(*)::INT FROM public.audit_events WHERE action = 'privacy.requested' AND actor_id = '00000000-0000-0000-0000-000000000331'), 2, 'privacy.requested audit events: one per RPC-created request, none for refused attempts');
SELECT is((SELECT count(*)::INT FROM public.privacy_requests WHERE user_id = '00000000-0000-0000-0000-000000000331' AND status = 'requested'), 2, 'user A has exactly 2 open requests in total (as owner)');

-- ===== 5. cross-user isolation still holds; user B works independently =====
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000332","role":"authenticated"}';
SELECT is((SELECT count(*)::INT FROM public.privacy_requests), 0, 'user B cannot see user A requests');
SELECT lives_ok($$SELECT public.request_privacy_action('export','00000000-0000-0000-0000-000000000361')$$, 'user B may use the same key value (keys are per user) and gets their own request');
SELECT is((SELECT count(*)::INT FROM public.privacy_requests), 1, 'user B sees only their own row');
SELECT throws_ok($$INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key) VALUES ('00000000-0000-0000-0000-000000000332','deletion','00000000-0000-0000-0000-000000000355')$$,
  '42501', 'permission denied for table privacy_requests', 'user B direct INSERT also fails with 42501');
RESET ROLE;
RESET "request.jwt.claims";

-- ===== 6. anon =====
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';
SELECT throws_ok($$INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key) VALUES ('00000000-0000-0000-0000-000000000331','export','00000000-0000-0000-0000-000000000356')$$,
  '42501', 'permission denied for table privacy_requests', 'anon direct INSERT fails with 42501');
SELECT throws_ok($$SELECT count(*) FROM public.privacy_requests$$, '42501', 'permission denied for table privacy_requests', 'anon cannot read privacy_requests');
SELECT throws_ok($$SELECT public.request_privacy_action('export','00000000-0000-0000-0000-000000000357')$$, '42501', NULL, 'anon cannot call request_privacy_action');
RESET ROLE;
RESET "request.jwt.claims";

-- ===== 7. service_role path unchanged (future worker) =====
SET LOCAL ROLE service_role;
SELECT lives_ok($$INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key) VALUES ('00000000-0000-0000-0000-000000000332','deletion','00000000-0000-0000-0000-000000000358')$$, 'service_role can still INSERT privacy_requests');
SELECT lives_ok($$UPDATE public.privacy_requests SET status = 'in_progress' WHERE idempotency_key = '00000000-0000-0000-0000-000000000358'$$, 'service_role workflow UPDATE(status) still works');
RESET ROLE;

-- ===== NEGATIVE PROOF: re-grant column INSERT (exactly the pre-N45-01 state); the same statements then succeed, so the 42501 assertions above are load-bearing =====
GRANT INSERT (user_id, request_type, idempotency_key) ON public.privacy_requests TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000331","role":"authenticated"}';
SELECT lives_ok($$INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key) SELECT '00000000-0000-0000-0000-000000000331','export', pg_catalog.gen_random_uuid() FROM generate_series(1,501)$$,
  'with the old grant restored the 501-row bypass works (proves the revocation is what blocks it)');
SELECT cmp_ok((SELECT count(*)::INT FROM public.privacy_requests WHERE request_type = 'export'), '>=', 502, 'bypass would have created 501 extra rows beside the RPC row');
RESET ROLE;
RESET "request.jwt.claims";
REVOKE INSERT ON public.privacy_requests FROM authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000331","role":"authenticated"}';
SELECT throws_ok($$INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key) VALUES ('00000000-0000-0000-0000-000000000331','export','00000000-0000-0000-0000-000000000359')$$,
  '42501', 'permission denied for table privacy_requests', 'after the REVOKE is re-applied direct INSERT fails again');
RESET ROLE;
RESET "request.jwt.claims";

SELECT * FROM finish();
ROLLBACK;
