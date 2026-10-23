-- Themis PR #39 re-review: close the "future functions/sequences are born open" hole, and lock the existing public sequences.
-- Idempotent (every statement is a REVOKE or a catalog-driven REVOKE) and ONE transaction: the file carries its own BEGIN/COMMIT, so
-- SET LOCAL lock_timeout is effective under any runner, including plain `psql -f`. Apply on dev first, in a quiet window, then run
-- docs/operations/privcheck6.sql (read-only) before and after. Do not paste this into the dashboard SQL editor.
--
-- Why: ALTER DEFAULT PRIVILEGES ... IN SCHEMA public still GRANTed EXECUTE on new functions and USAGE/SELECT/UPDATE on new sequences to
-- anon/authenticated/service_role (the Supabase provisioning default for objects created by `postgres`). A migration that forgets its own
-- REVOKE therefore ships a client-callable function. After this migration a new function/sequence created by `postgres` in public is
-- reachable only by its owner and service_role (service_role is kept as is, as requested).
--
-- FINDING for Themis: a schema-level REVOKE alone does NOT remove the built-in PUBLIC execute default of PostgreSQL (functions are born with
-- EXECUTE for PUBLIC unless a *global* default ACL says otherwise). Verified on the local stack: after only the schema-level revoke, a new
-- function was still executable by anon through PUBLIC. Step 1b therefore also revokes PUBLIC at the global (all-schemas) level for role
-- postgres. That row grants nothing to API roles (the P39-05 "global row granting API roles" check is unaffected).
--
-- Step 4 TRIES the default ACLs of role supabase_admin (dashboard-created objects), guarded: a refusal (42501) is a NOTICE, not a failure. It is
-- expected to be refused for postgres on hosted; see docs/operations/default-acl-hardening.md.
--
-- Rollback (forward-fix preferred): ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,
-- authenticated; ... GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated; ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT
-- EXECUTE ON FUNCTIONS TO PUBLIC; re-GRANT on sequences/trigger functions from the pre-state captured by privcheck6.sql.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. Future functions and sequences created by postgres in public: no PUBLIC / anon / authenticated access. service_role keeps its default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM PUBLIC, anon, authenticated;

-- 1b. PostgreSQL's built-in "EXECUTE for PUBLIC" default for new functions can only be removed at the global level.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 2. Existing public sequences (the matrix showed funnel_events_id_seq and postback_outbox_id_seq with rwU for anon/authenticated; the
--    loop also covers any other public sequence owned by the current role). service_role grants are left alone. Definer functions run as
--    the owner, so nextval() inside them is unaffected.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS seq
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'S' AND pg_get_userbyid(c.relowner) = current_user
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', r.seq);
  END LOOP;
END $$;

-- 3. Trigger functions in public were executable by authenticated through the old default. PostgreSQL checks EXECUTE on a trigger function
--    only at CREATE TRIGGER time, never when the trigger fires, and a trigger function cannot be called directly, so this changes nothing
--    for members and keeps the catalog check (pgTAP 0031) free of a long exception list.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prorettype = 'pg_catalog.trigger'::regtype
       AND pg_get_userbyid(p.proowner) = current_user
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
  END LOOP;
END $$;

-- 4. supabase_admin default ACLs (objects created from the dashboard SQL editor / by Supabase). GUARDED, best effort: only supabase_admin or a
--    superuser may change them. Each statement runs in its own exception block; "permission denied to change default privileges" (42501, the
--    error `postgres` gets on the local CLI stack) is turned into a NOTICE so the migration still commits. If it IS permitted, it only REVOKEs.
DO $$
DECLARE stmt TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    RAISE NOTICE 'supabase_admin default ACLs: role does not exist, skipped';
    RETURN;
  END IF;
  FOREACH stmt IN ARRAY ARRAY[
    'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated',
    'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM anon, authenticated',
    'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role'
  ] LOOP
    BEGIN
      EXECUTE stmt;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'supabase_admin default ACLs NOT changed (%): %', SQLERRM, stmt;
    END;
  END LOOP;
END $$;

COMMIT;

-- supabase_admin default ACLs: step 4 above tries them and tolerates a refusal. On the local CLI stack (postgres is not a superuser) the exact
-- refusal is `ERROR:  permission denied to change default privileges` (caught and reported as a NOTICE). Whatever the outcome on hosted, the
-- convention in docs/operations/default-acl-hardening.md applies: create schema objects only through migrations. Check privcheck6.sql (section
-- default_acl, supabase_admin rows) after applying to see whether it took effect.
