-- privcheck6: READ-ONLY inventory of function / sequence / default-ACL exposure to the API roles (Themis PR #39 re-review, PR #40 review N40-01/08).
-- Run on DEV (and later PROD) BEFORE and AFTER applying migration 20261023000100, keep both outputs. Single SELECT, no writes.
--   (1) fn_api_exec   public functions of ANY kind (function, procedure, aggregate, window) that anon OR authenticated can EXECUTE (incl. via PUBLIC).
--                     detail = who can run it, kind, security definer, owner, and whether the ACL grants PUBLIC explicitly or is NULL
--                     (NULL = built-in PUBLIC execute).
--   (2) seq_api       public sequences with ANY privilege for PUBLIC/anon/authenticated (service_role shown for context when one of them matches).
--   (3) default_acl   every pg_default_acl row for roles postgres and supabase_admin (all schemas): which of PUBLIC/anon/authenticated/service_role get what.
--   (4) default_acl_global_f  one row per role (postgres, supabase_admin) that exists: does a GLOBAL (all-schemas) function default row exist? NO row
--                     means PostgreSQL's built-in "EXECUTE for PUBLIC" applies to every function that role creates, which section (3) cannot show
--                     (a missing row prints nothing). This is the supabase_admin situation when the guarded step 4 of the migration is refused.
--   (5) owner_not_postgres   public functions and relations NOT owned by postgres: these were born with the permissive defaults of their owner
--                     (typically supabase_admin: platform objects, extensions installed with WITH SCHEMA public). Any row = investigate.
--   (6) schema_fn_api_exec / schema_seq_api  other (non-system) schemas than public, one row per schema and owner: how many functions are executable
--                     by anon/authenticated (incl. PUBLIC) and how many carry a PUBLIC grant / NULL ACL; sequences with a PUBLIC/anon/authenticated
--                     privilege. Informational: platform schemas (auth, storage, extensions, graphql, realtime, ...) legitimately show rows on hosted.
--   (7) postapply     the post-apply checks A-G of the PR #40 review as counts (each detail ends with the expected value): A postgres global f default
--                     ACL; B public functions with PUBLIC grant/NULL ACL; C1/C2 public functions/relations not owned by postgres; D aggregates/window
--                     functions executable by anon/authenticated; E public sequences with a privilege for anon/authenticated; F trigger functions
--                     executable by anon/authenticated; G record_quiz_event as anon/authenticated/service_role.
-- Expected AFTER the migration on DEV (only `postgres` rows are controlled by it):
--   (1) only the intentionally client-callable RPCs listed in supabase/tests/0031_public_function_exposure_allowlist.test.sql
--       (record_quiz_event for anon+authenticated; the rest authenticated only). No trigger function, no billing_*, purge_*, admin_* function.
--   (2) no rows. (3) postgres/all schemas/f = no API-role entries; postgres/public/f and /S = service_role only; postgres/public/r = none.
--       supabase_admin rows stay permissive on hosted unless the guarded step 4 of the migration is permitted (see docs/operations/default-acl-hardening.md).
--   (4) postgres = 'global f row without PUBLIC'; supabase_admin = 'NO global f row' when step 4 was refused (functions it creates are PUBLIC-executable).
--   (5) no rows. Any row = objects created by supabase_admin (or another role) that carry its permissive default grants.
--   (7) A {postgres=X/postgres}; B 0; C1 0; C2 0; D 0; E 0; F 0; G true/true/false.
SELECT section, name, detail FROM (
  SELECT 1 AS o, 'fn_api_exec' AS section, p.oid::regprocedure::text AS name,
         'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
         || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
         || ' service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text
         || ' | kind=' || CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' WHEN 'a' THEN 'AGGREGATE' WHEN 'w' THEN 'WINDOW' ELSE p.prokind::text END
         || ' | definer=' || p.prosecdef::text
         || ' | owner=' || pg_get_userbyid(p.proowner)::text
         || ' | acl=' || CASE WHEN p.proacl IS NULL THEN 'NULL(public default)'
                              WHEN EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0) THEN 'PUBLIC granted'
                              ELSE 'no PUBLIC' END AS detail
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind IN ('f','p','a','w')
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
  UNION ALL
  SELECT 4, 'default_acl_global_f', r.rolname::text || ' in all schemas objtype=f',
         CASE WHEN g.defaclacl IS NULL THEN 'NO global f row: PostgreSQL built-in default applies = EXECUTE for PUBLIC on every new function this role creates'
              WHEN EXISTS (SELECT 1 FROM aclexplode(g.defaclacl) x WHERE x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon','authenticated')) THEN 'global f row GRANTS PUBLIC/anon/authenticated'
              ELSE 'global f row without PUBLIC/anon/authenticated (closed)' END
    FROM pg_roles r
    LEFT JOIN pg_default_acl g ON g.defaclrole = r.oid AND g.defaclnamespace = 0 AND g.defaclobjtype = 'f'
   WHERE r.rolname IN ('postgres','supabase_admin')
  UNION ALL
  SELECT 5, 'owner_not_postgres', 'function ' || p.oid::regprocedure::text,
         'owner=' || pg_get_userbyid(p.proowner)::text || ' | kind=' || p.prokind::text
         || ' | anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
         || ' | acl=' || CASE WHEN p.proacl IS NULL THEN 'NULL(public default)'
                              WHEN EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0) THEN 'PUBLIC granted' ELSE 'no PUBLIC' END
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND pg_get_userbyid(p.proowner) <> 'postgres'
  UNION ALL
  SELECT 5, 'owner_not_postgres', 'relation ' || c.oid::regclass::text,
         'owner=' || pg_get_userbyid(c.relowner)::text || ' | relkind=' || c.relkind::text
         || ' | anon=' || coalesce((SELECT string_agg(x.privilege_type, ',' ORDER BY x.privilege_type) FROM aclexplode(c.relacl) x WHERE pg_get_userbyid(x.grantee) = 'anon'), 'none')
         || ' | authenticated=' || coalesce((SELECT string_agg(x.privilege_type, ',' ORDER BY x.privilege_type) FROM aclexplode(c.relacl) x WHERE pg_get_userbyid(x.grantee) = 'authenticated'), 'none')
         || ' | service_role=' || coalesce((SELECT string_agg(x.privilege_type, ',' ORDER BY x.privilege_type) FROM aclexplode(c.relacl) x WHERE pg_get_userbyid(x.grantee) = 'service_role'), 'none')
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','S','v','m','f') AND pg_get_userbyid(c.relowner) <> 'postgres'
  UNION ALL
  SELECT 6, 'schema_fn_api_exec', n.nspname::text || ' / owner ' || pg_get_userbyid(p.proowner)::text,
         count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text
         || ' of ' || count(*)::text || ' functions executable by anon/authenticated | '
         || count(*) FILTER (WHERE p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0))::text || ' with PUBLIC grant or NULL ACL'
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('public','pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\_toast%' AND n.nspname NOT LIKE 'pg\_temp%'
   GROUP BY n.nspname, p.proowner
  UNION ALL
  SELECT 6, 'schema_seq_api', n.nspname::text || ' / owner ' || pg_get_userbyid(c.relowner)::text,
         count(*)::text || ' sequence(s) with a PUBLIC/anon/authenticated privilege or NULL ACL'
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'S' AND n.nspname NOT IN ('public','pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\_toast%' AND n.nspname NOT LIKE 'pg\_temp%'
     AND (c.relacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(c.relacl) x WHERE x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon','authenticated')))
   GROUP BY n.nspname, c.relowner
  UNION ALL
  SELECT 7, 'postapply', 'A_postgres_global_f_acl',
         coalesce((SELECT defaclacl::text FROM pg_default_acl WHERE defaclrole = 'postgres'::regrole AND defaclnamespace = 0 AND defaclobjtype = 'f'), 'no row') || ' (expected {postgres=X/postgres})'
  UNION ALL
  SELECT 7, 'postapply', 'B_public_fn_with_PUBLIC_or_NULL_acl',
         count(*)::text || ' (expected 0)'
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p','a','w')
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0))
  UNION ALL
  SELECT 7, 'postapply', 'C1_public_fn_not_owned_by_postgres',
         count(*)::text || ' (expected 0; any row = supabase_admin-owned objects exposed by its permissive defaults)'
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND pg_get_userbyid(p.proowner) <> 'postgres'
  UNION ALL
  SELECT 7, 'postapply', 'C2_public_relation_not_owned_by_postgres',
         count(*)::text || ' (expected 0)'
    FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','S','v','m','f') AND pg_get_userbyid(c.relowner) <> 'postgres'
  UNION ALL
  SELECT 7, 'postapply', 'D_aggregate_window_fn_executable_by_api',
         count(*)::text || ' (expected 0)'
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('a','w')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  UNION ALL
  SELECT 7, 'postapply', 'E_public_sequence_with_anon_authenticated_privilege',
         count(*)::text || ' (expected 0 after the migration, 2 before)'
    FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S'
     AND (has_sequence_privilege('anon', c.oid, 'USAGE') OR has_sequence_privilege('anon', c.oid, 'SELECT') OR has_sequence_privilege('anon', c.oid, 'UPDATE')
          OR has_sequence_privilege('authenticated', c.oid, 'USAGE') OR has_sequence_privilege('authenticated', c.oid, 'SELECT') OR has_sequence_privilege('authenticated', c.oid, 'UPDATE'))
  UNION ALL
  SELECT 7, 'postapply', 'F_trigger_fn_executable_by_api',
         count(*)::text || ' (expected 0 after the migration, 4 before)'
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prorettype = 'pg_catalog.trigger'::regtype
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  UNION ALL
  SELECT 7, 'postapply', 'G_record_quiz_event_anon/authenticated/service_role',
         coalesce((SELECT has_function_privilege('anon', p.oid, 'EXECUTE')::text || '/' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || '/' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text
                     FROM pg_proc p WHERE p.proname = 'record_quiz_event' AND p.pronamespace = 'public'::regnamespace LIMIT 1), 'function missing') || ' (expected true/true/false)'
) s ORDER BY o, name;
