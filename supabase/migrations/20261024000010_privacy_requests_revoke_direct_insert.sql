-- Themis N45-01 (PR #45 review, MEDIUM, pre-existing): `authenticated` could INSERT straight into public.privacy_requests through
-- the table API, bypassing public.request_privacy_action(). One statement (INSERT ... SELECT ... FROM generate_series(1,500)) created
-- 501 pending rows for a single member, with none of the RPC's guarantees: no one-open-request-per-type rule, no `privacy.requested`
-- audit event, no advisory-lock serialisation. With a manual (soon worker-driven) DSAR queue that is a self-inflicted flood vector.
--
-- Change (privileges only; no table, column, policy, trigger, function or data change):
--   * REVOKE every direct WRITE-type privilege on public.privacy_requests from PUBLIC, anon and authenticated: INSERT (table and
--     column level: user_id, request_type, idempotency_key), plus UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     (UPDATE/DELETE/TRUNCATE/... were already absent; they are revoked again so the end state does not depend on history).
--   * authenticated KEEPS table-level SELECT (the app lists the member's own requests; RLS policy privacy_requests_select_owner
--     still limits rows to the caller). SELECT is deliberately not touched here (N45-10 column-level SELECT is a separate item).
--   * The only write path for a member is now public.request_privacy_action(privacy_request_type, uuid): SECURITY DEFINER, owner
--     postgres, search_path pinned, EXECUTE for authenticated only. It inserts as its owner (postgres: table owner, bypasses RLS),
--     so it does not need any privilege for authenticated on the table. This file re-asserts that function's ACL but does not
--     redefine it.
--   * service_role is NOT touched (keeps SELECT, INSERT and the workflow column UPDATEs from migrations 060/090).
--   * The RLS policy privacy_requests_insert_owner is intentionally LEFT IN PLACE: with no INSERT privilege it is unreachable, and
--     if someone ever re-grants INSERT by mistake it still enforces user_id = auth.uid() AND status = 'requested'
--     (defence in depth). Dropping it is a pure cleanup and can follow with the worker PR.
--   * pg_default_acl is not touched (LB-3). The closing assertions fail the migration (rollback, nothing committed) if the default
--     ACL rows, the service_role ACL, the function ACL, or the SELECT-only end state differ from what is described here.
--
-- Client impact: none. The app writes only through the RPC (lib/privacy.ts) and reads with .select() (SELECT is kept). Nothing in
-- app/, lib/, hooks/, components/, supabase/functions/ inserts into the table directly [grep'd]. pgTAP fixtures that seed rows run as
-- postgres / service_role and are unaffected; the three tests that exercised the old direct-INSERT path are updated in this PR.
--
-- Safety: REVOKE is a catalog-only ACL update (no relation rewrite or scan, no data touched); SET LOCAL lock_timeout is a guard only.
-- MAINTAIN (PostgreSQL 17 only) is not named, so the file also parses on older servers; it was never granted to a client role.
-- Idempotent and re-runnable (REVOKE of an absent privilege is a no-op). Apply on dev FIRST (via Themis), then prod (Mark).
-- Do not paste into the dashboard SQL editor; use the migration runner so the closing assertions run in the same transaction.
--
-- Rollback (forward-fix preferred; this REOPENS the 501-row bypass, so only do it if the RPC path is broken). As postgres, one txn:
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   GRANT INSERT (user_id, request_type, idempotency_key) ON TABLE public.privacy_requests TO authenticated;
--   COMMIT;
-- That restores exactly the pre-state (migrations 20261023000060 / 20261023000090 granted COLUMN-level INSERT only; the RLS policy
-- privacy_requests_insert_owner was never dropped, so nothing else is needed). Verify afterwards with
--   SELECT grantee, privilege_type, column_name FROM information_schema.column_privileges
--    WHERE table_schema='public' AND table_name='privacy_requests' AND grantee IN ('authenticated','anon') AND privilege_type='INSERT';
-- (3 rows for authenticated before-state, none after this migration) and re-run supabase/tests/0033 (expected to fail on rollback).

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 0. Precondition: REVOKE by a role without rights is only a WARNING, so refuse to run as anyone who cannot act for the table owner.
DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user)
     AND NOT pg_catalog.pg_has_role(current_user, 'postgres', 'USAGE') THEN
    RAISE EXCEPTION 'run this migration as postgres, a member of postgres, or a superuser (current_user=%)', current_user;
  END IF;
  IF (SELECT c.relowner::regrole::text FROM pg_catalog.pg_class c WHERE c.oid = 'public.privacy_requests'::regclass) <> 'postgres' THEN
    RAISE EXCEPTION 'public.privacy_requests is not owned by postgres; refusing to guess';
  END IF;
END
$$;

-- Snapshots for the closing "nothing else moved" assertions.
CREATE TEMP TABLE _n45_pre ON COMMIT DROP AS
SELECT 'service_role_acl'::TEXT AS k,
       (SELECT coalesce(string_agg(a.privilege_type || ':' || a.is_grantable::TEXT, ',' ORDER BY a.privilege_type), '')
          FROM pg_catalog.pg_class c, LATERAL pg_catalog.aclexplode(c.relacl) a
         WHERE c.oid = 'public.privacy_requests'::regclass
           AND a.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')) ||
       '|' ||
       (SELECT coalesce(string_agg(att.attname || ':' || a.privilege_type, ',' ORDER BY att.attname, a.privilege_type), '')
          FROM pg_catalog.pg_attribute att, LATERAL pg_catalog.aclexplode(att.attacl) a
         WHERE att.attrelid = 'public.privacy_requests'::regclass AND att.attacl IS NOT NULL
           AND a.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')) AS v
UNION ALL
SELECT 'default_acl', (SELECT coalesce(string_agg(d.defaclrole::regrole::text || '/' || d.defaclnamespace::text || '/' || d.defaclobjtype::TEXT || '/' || d.defaclacl::text, ';' ORDER BY d.defaclrole::regrole::text, d.defaclnamespace, d.defaclobjtype), '') FROM pg_catalog.pg_default_acl d)
UNION ALL
SELECT 'fn_acl', (SELECT coalesce(p.proacl::text, '<default>') FROM pg_catalog.pg_proc p WHERE p.oid = 'public.request_privacy_action(public.privacy_request_type,uuid)'::regprocedure)
UNION ALL
SELECT 'authenticated_select', has_table_privilege('authenticated', 'public.privacy_requests', 'SELECT')::TEXT;

-- 1. The change. Table-level REVOKE also removes the column-level grants of the same privilege (PostgreSQL docs, REVOKE).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.privacy_requests FROM PUBLIC, anon, authenticated;
-- Explicit column-level revoke as well, so the intent is visible and nothing depends on that documented behaviour.
REVOKE INSERT (user_id, request_type, idempotency_key, status, id, created_at, completed_at, completion_metadata, failure_code, retention_until, legal_hold, updated_at)
  ON TABLE public.privacy_requests FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (user_id, request_type, idempotency_key, status, id, created_at, completed_at, completion_metadata, failure_code, retention_until, legal_hold, updated_at)
  ON TABLE public.privacy_requests FROM PUBLIC, anon, authenticated;

-- 2. The RPC is the sole member write path: restate its ACL (idempotent; no definition change).
REVOKE ALL ON FUNCTION public.request_privacy_action(public.privacy_request_type, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_privacy_action(public.privacy_request_type, uuid) TO authenticated;

-- 3. Closing assertions (abort + rollback on any drift).
DO $$
DECLARE
  v_bad TEXT;
  v_pre RECORD;
BEGIN
  -- 3a. No client role (and PUBLIC) has any table-level privilege except authenticated SELECT.
  SELECT string_agg(coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type, ',' ORDER BY r.rolname, a.privilege_type) INTO v_bad
    FROM pg_catalog.pg_class c, LATERAL pg_catalog.aclexplode(c.relacl) a
    LEFT JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
   WHERE c.oid = 'public.privacy_requests'::regclass
     AND (a.grantee = 0 OR r.rolname IN ('anon', 'authenticated'))
     AND NOT (r.rolname = 'authenticated' AND a.privilege_type = 'SELECT');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'N45-01: unexpected table privileges remain: %', v_bad; END IF;

  -- 3b. No column-level privilege for anon / authenticated / PUBLIC at all.
  SELECT string_agg(att.attname || ':' || a.privilege_type || ':' || a.grantee::TEXT, ',') INTO v_bad
    FROM pg_catalog.pg_attribute att, LATERAL pg_catalog.aclexplode(att.attacl) a
   WHERE att.attrelid = 'public.privacy_requests'::regclass AND att.attacl IS NOT NULL
     AND (a.grantee = 0 OR a.grantee IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated')));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'N45-01: unexpected column privileges remain: %', v_bad; END IF;

  -- 3c. Effective check through the privilege functions (covers role membership/inheritance).
  IF has_table_privilege('authenticated', 'public.privacy_requests', 'INSERT')
     OR has_any_column_privilege('authenticated', 'public.privacy_requests', 'INSERT')
     OR has_table_privilege('anon', 'public.privacy_requests', 'INSERT')
     OR has_any_column_privilege('anon', 'public.privacy_requests', 'INSERT')
     OR has_any_column_privilege('authenticated', 'public.privacy_requests', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.privacy_requests', 'DELETE')
     OR has_table_privilege('anon', 'public.privacy_requests', 'SELECT') THEN
    RAISE EXCEPTION 'N45-01: a client role can still write (or anon read) public.privacy_requests';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.privacy_requests', 'SELECT') THEN
    RAISE EXCEPTION 'N45-01: authenticated lost SELECT on public.privacy_requests (the app lists own requests)';
  END IF;

  -- 3d. Nothing else moved: service_role ACL, default ACL rows, RPC ACL and SELECT state equal the pre-snapshot.
  FOR v_pre IN SELECT k, v FROM _n45_pre LOOP
    IF v_pre.k = 'service_role_acl' AND v_pre.v IS DISTINCT FROM (
         (SELECT coalesce(string_agg(a.privilege_type || ':' || a.is_grantable::TEXT, ',' ORDER BY a.privilege_type), '')
            FROM pg_catalog.pg_class c, LATERAL pg_catalog.aclexplode(c.relacl) a
           WHERE c.oid = 'public.privacy_requests'::regclass AND a.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role'))
         || '|' ||
         (SELECT coalesce(string_agg(att.attname || ':' || a.privilege_type, ',' ORDER BY att.attname, a.privilege_type), '')
            FROM pg_catalog.pg_attribute att, LATERAL pg_catalog.aclexplode(att.attacl) a
           WHERE att.attrelid = 'public.privacy_requests'::regclass AND att.attacl IS NOT NULL AND a.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role'))) THEN
      RAISE EXCEPTION 'N45-01: service_role privileges on privacy_requests changed (must be untouched)';
    END IF;
    IF v_pre.k = 'default_acl' AND v_pre.v IS DISTINCT FROM
         (SELECT coalesce(string_agg(d.defaclrole::regrole::text || '/' || d.defaclnamespace::text || '/' || d.defaclobjtype::TEXT || '/' || d.defaclacl::text, ';' ORDER BY d.defaclrole::regrole::text, d.defaclnamespace, d.defaclobjtype), '') FROM pg_catalog.pg_default_acl d) THEN
      RAISE EXCEPTION 'N45-01: pg_default_acl changed (LB-3 regression)';
    END IF;
    IF v_pre.k = 'fn_acl' AND v_pre.v IS DISTINCT FROM
         (SELECT coalesce(p.proacl::text, '<default>') FROM pg_catalog.pg_proc p WHERE p.oid = 'public.request_privacy_action(public.privacy_request_type,uuid)'::regprocedure) THEN
      RAISE EXCEPTION 'N45-01: request_privacy_action ACL changed (was %)', v_pre.v;
    END IF;
  END LOOP;

  -- 3e. The RPC must remain the working write path: SECURITY DEFINER, owner postgres, pinned search_path, EXECUTE only authenticated (+owner).
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                  WHERE p.oid = 'public.request_privacy_action(public.privacy_request_type,uuid)'::regprocedure
                    AND p.prosecdef AND p.proowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'postgres')
                    AND p.proconfig @> ARRAY['search_path=public, pg_temp']::TEXT[]) THEN
    RAISE EXCEPTION 'N45-01: request_privacy_action is no longer SECURITY DEFINER / owner postgres / pinned search_path';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.request_privacy_action(public.privacy_request_type,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.request_privacy_action(public.privacy_request_type,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'N45-01: request_privacy_action EXECUTE must be authenticated only';
  END IF;
  -- The RLS select policy and the RLS switch must still be there.
  IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.privacy_requests'::regclass)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = 'public.privacy_requests'::regclass AND polname = 'privacy_requests_select_owner') THEN
    RAISE EXCEPTION 'N45-01: RLS or privacy_requests_select_owner missing';
  END IF;
END
$$;

COMMIT;
