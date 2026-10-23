-- privcheck6: READ-ONLY inventory of function / sequence / default-ACL exposure to the API roles (Themis PR #39 re-review).
-- Run on DEV (and later PROD) BEFORE and AFTER applying migration 20261023000100, keep both outputs. Single SELECT, no writes.
--   (1) fn_api_exec   public functions that anon OR authenticated can EXECUTE (incl. via PUBLIC). detail = who can run it, security definer,
--                     owner, and whether the ACL grants PUBLIC explicitly or is NULL (NULL = built-in PUBLIC execute).
--   (2) seq_api       public sequences with ANY privilege for PUBLIC/anon/authenticated (service_role shown for context when one of them matches).
--   (3) default_acl   every pg_default_acl row for roles postgres and supabase_admin (all schemas): which of PUBLIC/anon/authenticated/service_role get what.
-- Expected AFTER the migration on DEV (only `postgres` rows are controlled by it):
--   (1) only the intentionally client-callable RPCs listed in supabase/tests/0031_public_function_exposure_allowlist.test.sql
--       (record_quiz_event for anon+authenticated; the rest authenticated only). No trigger function, no billing_*, purge_*, admin_* function.
--   (2) no rows. (3) postgres/all schemas/f = no API-role entries; postgres/public/f and /S = service_role only; postgres/public/r = none.
--       supabase_admin rows stay permissive on hosted unless the guarded step 4 of the migration is permitted (see docs/operations/default-acl-hardening.md).
SELECT section, name, detail FROM (
  SELECT 1 AS o, 'fn_api_exec' AS section, p.oid::regprocedure::text AS name,
         'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
         || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
         || ' service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text
         || ' | definer=' || p.prosecdef::text
         || ' | owner=' || pg_get_userbyid(p.proowner)::text
         || ' | acl=' || CASE WHEN p.proacl IS NULL THEN 'NULL(public default)'
                              WHEN EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0) THEN 'PUBLIC granted'
                              ELSE 'no PUBLIC' END AS detail
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  UNION ALL
  SELECT 2, 'seq_api', c.oid::regclass::text,
         coalesce((SELECT string_agg(CASE x.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee)::text END || '=' || x.privilege_type, ',' ORDER BY x.grantee, x.privilege_type)
                     FROM aclexplode(c.relacl) x
                    WHERE x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon','authenticated','service_role')), 'no entries')
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'S'
     AND (c.relacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(c.relacl) x WHERE x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon','authenticated')))
  UNION ALL
  SELECT 3, 'default_acl',
         pg_get_userbyid(d.defaclrole)::text || ' in ' || CASE WHEN d.defaclnamespace = 0 THEN 'all schemas' ELSE d.defaclnamespace::regnamespace::text END || ' objtype=' || d.defaclobjtype::text,
         coalesce((SELECT string_agg(CASE x.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee)::text END || '=' || x.privilege_type, ',' ORDER BY x.grantee, x.privilege_type)
                     FROM aclexplode(d.defaclacl) x
                    WHERE x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon','authenticated','service_role')), 'no API-role entries')
    FROM pg_default_acl d
   WHERE pg_get_userbyid(d.defaclrole) IN ('postgres','supabase_admin')
) s ORDER BY o, name;
