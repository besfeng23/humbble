-- F-07 / F-08 (migration 20261023000090): allowlist matrix of anon / authenticated / service_role privileges on public tables
-- plus the default-privileges (fail-closed for future tables) test.
--
-- HOW TO MAINTAIN: when a migration adds or changes a public table, add/adjust its rows in the matrix below in the SAME PR.
-- Tables NOT in the matrix are judged by a conservative rule (anon: nothing; authenticated: SELECT only; service_role: SELECT/INSERT only,
-- no column grants), so a new table that blindly GRANTs ALL to service_role fails here instead of silently shipping.
-- Rows flagged DEBT are known over-grants (Themis PR36 F-04, deferred) kept visible so they can only shrink, never grow unnoticed.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(14);

CREATE TEMP TABLE expected_acl (tbl TEXT, role TEXT, tbl_privs TEXT, col_privs TEXT);
INSERT INTO expected_acl VALUES
 ('attribution_networks','service_role','SELECT',''),
 ('audit_events','service_role','INSERT,SELECT',''),
 ('billing_markets','service_role','SELECT',''),
 ('billing_plans','authenticated','SELECT',''),
 ('billing_plans','service_role','SELECT',''),
 ('billing_readbacks','service_role','SELECT',''),
 ('blocks','authenticated','SELECT',''),
 ('blocks','service_role','SELECT',''),
 ('consent_records','authenticated','SELECT','INSERT:choice,INSERT:consent_key,INSERT:metadata,INSERT:source,INSERT:user_id,INSERT:version'),
 ('consent_records','service_role','INSERT,SELECT',''),
 ('entitlements','authenticated','SELECT',''),
 ('entitlements','service_role','SELECT',''),
 ('funnel_events','service_role','SELECT',''),
 ('messages','authenticated','SELECT',''),
 ('messages','service_role','SELECT',''),
 ('moderation_cases','authenticated','SELECT',''),
 ('moderation_cases','service_role','INSERT,SELECT',''),
 ('notification_deliveries','service_role','DELETE,INSERT,SELECT,UPDATE',''),
 ('notification_jobs','service_role','INSERT,SELECT,UPDATE',''),
 ('notification_preferences','authenticated','INSERT,SELECT,UPDATE',''),
 ('notification_preferences','service_role','INSERT,SELECT,UPDATE',''),
 ('payment_events','service_role','INSERT,SELECT',''),
 ('postback_outbox','service_role','SELECT',''),
 ('privacy_requests','authenticated','SELECT','INSERT:idempotency_key,INSERT:request_type,INSERT:user_id'),
 ('privacy_requests','service_role','INSERT,SELECT','UPDATE:completed_at,UPDATE:completion_metadata,UPDATE:failure_code,UPDATE:status'),
 ('push_tokens','authenticated','SELECT',''),
 ('push_tokens','service_role','DELETE,INSERT,SELECT,UPDATE',''),
 ('quiz_events','service_role','SELECT',''),  -- PR #37: anonymous quiz funnel events; written only by the definer RPC record_quiz_event
 ('reports','authenticated','SELECT',''),
 ('reports','service_role','INSERT,SELECT','UPDATE:severity,UPDATE:status'),
 ('signup_attributions','authenticated','INSERT',''),
 ('signup_attributions','service_role','SELECT',''),
 ('subscriptions','authenticated','SELECT',''),
 ('subscriptions','service_role','SELECT',''),
 ('user_consents','authenticated','INSERT,SELECT',''),
 ('user_consents','service_role','SELECT',''),
 ('verification_requests','authenticated','SELECT',''),
 ('verification_requests','service_role','INSERT,SELECT','UPDATE:attempts,UPDATE:decided_at,UPDATE:provider_session_id,UPDATE:status'),
 -- client-facing tables whose authenticated grants are enforced by RLS + column grants (unchanged by this PR)
 ('conversation_participants','authenticated','SELECT',''),
 ('conversations','authenticated','SELECT',''),
 ('daily_swipe_quotas','authenticated','SELECT',''),
 ('matches','authenticated','SELECT',''),
 ('swipes','authenticated','SELECT',''),
 ('profile_photos','authenticated','DELETE,SELECT','INSERT:position,INSERT:storage_path,INSERT:user_id,UPDATE:position,UPDATE:storage_path'),
 ('profiles','authenticated','DELETE,INSERT,SELECT','UPDATE:city_region,UPDATE:country_code,UPDATE:display_name,UPDATE:education_level,UPDATE:is_incognito,UPDATE:is_paused,UPDATE:languages_spoken,UPDATE:occupation,UPDATE:prompts,UPDATE:relationship_intention,UPDATE:shared_interests'),
 ('user_preferences','authenticated','DELETE,SELECT','INSERT:max_age,INSERT:max_distance_km,INSERT:min_age,INSERT:preferred_intentions,INSERT:user_id,UPDATE:max_age,UPDATE:max_distance_km,UPDATE:min_age,UPDATE:preferred_intentions'),
 -- DEBT (F-04, deferred): service_role ALL on the product tables. Narrowing needs per-writer analysis (profiles.is_suspended is legitimately service_role-written).
 ('conversation_participants','service_role','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',''),
 ('conversations','service_role','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',''),
 ('daily_swipe_quotas','service_role','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',''),
 ('matches','service_role','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',''),
 ('profile_photos','service_role','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',''),
 ('profiles','service_role','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',''),
 ('swipes','service_role','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',''),
 ('user_preferences','service_role','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE','');

CREATE TEMP TABLE actual_acl AS
SELECT c.relname::TEXT AS tbl, r.rolname::TEXT AS role,
  coalesce((SELECT string_agg(DISTINCT p.privilege_type, ',' ORDER BY p.privilege_type) FROM aclexplode(c.relacl) p WHERE p.grantee = r.oid), '') AS tbl_privs,
  coalesce((SELECT string_agg(p.privilege_type || ':' || a.attname, ',' ORDER BY p.privilege_type, a.attname) FROM pg_attribute a, aclexplode(a.attacl) p WHERE a.attrelid = c.oid AND a.attacl IS NOT NULL AND p.grantee = r.oid), '') AS col_privs
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN pg_roles r
WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND r.rolname IN ('anon','authenticated','service_role');

-- 1. (matrix) for every table named in the matrix, the effective grants are exactly the expected ones, for all three roles
SELECT is_empty($$SELECT a.tbl, a.role, a.tbl_privs AS actual_tbl, e.tbl_privs AS expected_tbl, a.col_privs AS actual_cols, e.col_privs AS expected_cols
  FROM actual_acl a LEFT JOIN expected_acl e ON e.tbl = a.tbl AND e.role = a.role
  WHERE a.tbl IN (SELECT tbl FROM expected_acl)
    AND (a.tbl_privs, a.col_privs) IS DISTINCT FROM (coalesce(e.tbl_privs,''), coalesce(e.col_privs,''))$$,
  'matrix: public table privileges for anon/authenticated/service_role equal the allowlist (a diff row above means grant drift)');
SELECT is_empty($$SELECT tbl FROM expected_acl WHERE tbl NOT IN (SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace)$$, 'matrix: every listed table exists (remove stale rows when tables are dropped)');
-- 2. (rule) tables not in the matrix get the conservative rule
SELECT is_empty($$SELECT tbl, role, tbl_privs, col_privs FROM actual_acl
  WHERE tbl NOT IN (SELECT tbl FROM expected_acl)
    AND ((role = 'anon' AND (tbl_privs <> '' OR col_privs <> ''))
      OR (role = 'authenticated' AND (tbl_privs NOT IN ('','SELECT') OR col_privs <> ''))
      OR (role = 'service_role' AND (tbl_privs NOT IN ('','SELECT','INSERT','INSERT,SELECT') OR col_privs <> '')))$$,
  'rule: a table missing from the matrix may not grant anon anything, authenticated more than SELECT, or service_role more than SELECT/INSERT (add it to the matrix if you meant to)');
-- 3. hard invariants independent of the matrix: trust anchors / evidence / ledgers are never writable beyond the documented shape by service_role
SELECT is_empty($$SELECT tbl, tbl_privs FROM actual_acl WHERE role = 'service_role'
  AND tbl IN ('billing_plans','billing_markets','attribution_networks','postback_outbox','signup_attributions','funnel_events','user_consents','entitlements','subscriptions','billing_readbacks','blocks','messages')
  AND tbl_privs <> 'SELECT'$$, 'invariant: trust anchors, evidence rows and billing state are SELECT-only for service_role');
SELECT is_empty($$SELECT tbl, tbl_privs FROM actual_acl WHERE role = 'service_role'
  AND tbl IN ('reports','moderation_cases','verification_requests','payment_events','audit_events','consent_records','privacy_requests')
  AND (tbl_privs ~ '(DELETE|TRUNCATE|UPDATE|REFERENCES|TRIGGER|MAINTAIN)')$$, 'invariant: evidence/ledger tables give service_role no table-level UPDATE/DELETE/TRUNCATE');
SELECT is_empty($$SELECT tbl, role FROM actual_acl WHERE role IN ('anon','authenticated') AND tbl_privs ~ '(TRUNCATE|REFERENCES|TRIGGER|MAINTAIN)'$$, 'invariant: anon/authenticated hold none of TRUNCATE/REFERENCES/TRIGGER/MAINTAIN anywhere');
SELECT is_empty($$SELECT tbl FROM actual_acl WHERE role = 'anon' AND (tbl_privs <> '' OR col_privs <> '')$$, 'invariant: anon holds no table or column privilege on any public table');
-- sequences and unexpected relation kinds
SELECT is_empty($$SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('v','m','f')
  AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE'))$$, 'views/materialized/foreign tables in public are not exposed to anon or writable by authenticated');

-- ===== default privileges: a future table created by the migration role is born closed (F-08) =====
CREATE TABLE public.t_probe_future_table (id INT);
SELECT is((SELECT count(*)::INT FROM aclexplode((SELECT relacl FROM pg_class WHERE oid = 'public.t_probe_future_table'::regclass)) p JOIN pg_roles r ON r.oid = p.grantee WHERE r.rolname IN ('anon','authenticated','service_role')), 0, 'default privileges: a new public table grants nothing to anon/authenticated/service_role');
SELECT ok(NOT (has_table_privilege('service_role','public.t_probe_future_table','SELECT') OR has_table_privilege('authenticated','public.t_probe_future_table','SELECT') OR has_table_privilege('anon','public.t_probe_future_table','SELECT')), 'default privileges: not even SELECT is implicit');
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT * FROM public.t_probe_future_table$$, '42501', 'permission denied for table t_probe_future_table', 'default privileges: service_role gets 42501 on a brand-new table until a migration grants explicitly');
RESET ROLE;
-- negative proof: temporarily restore the permissive default and show the probe would be detected
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;
CREATE TABLE public.t_probe_permissive (id INT);
SELECT ok(has_table_privilege('service_role','public.t_probe_permissive','TRUNCATE'), 'NEGATIVE PROOF: with the permissive default restored, a new table is born with service_role ALL (so the checks above detect the regression)');
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM service_role;
CREATE TABLE public.t_probe_after_restore (id INT);
SELECT ok(NOT has_table_privilege('service_role','public.t_probe_after_restore','SELECT'), 'after re-revoking the default, new tables are closed again');
-- and the matrix rule would flag a table that blindly grants ALL
GRANT ALL ON public.t_probe_permissive TO service_role;
SELECT isnt_empty($$SELECT tbl FROM (SELECT c.relname::TEXT AS tbl, (SELECT string_agg(DISTINCT p.privilege_type, ',' ORDER BY p.privilege_type) FROM aclexplode(c.relacl) p JOIN pg_roles r ON r.oid = p.grantee WHERE r.rolname = 'service_role') AS tp
   FROM pg_class c WHERE c.relname = 't_probe_permissive') s WHERE tp NOT IN ('SELECT','INSERT','INSERT,SELECT')$$, 'NEGATIVE PROOF: the rule used above flags a new table that grants service_role ALL');

SELECT * FROM finish();
ROLLBACK;
