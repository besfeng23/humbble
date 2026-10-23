-- Themis PR #39 re-review: close the "future functions/sequences are born open" hole, and lock the existing public sequences.
-- Idempotent (every statement is a REVOKE or a catalog-driven REVOKE) and ONE transaction: the file carries its own BEGIN/COMMIT, so
-- SET LOCAL lock_timeout is effective under any runner, including plain `psql -f`. Apply on dev first, in a quiet window, then run
-- docs/operations/privcheck6.sql (read-only) before and after. Do not paste this into the dashboard SQL editor.
--
-- Why: ALTER DEFAULT PRIVILEGES ... IN SCHEMA public still GRANTed EXECUTE on new functions and USAGE/SELECT/UPDATE on new sequences to
-- anon/authenticated/service_role (the Supabase provisioning default for objects created by `postgres`). A migration that forgets its own
-- REVOKE therefore ships a client-callable function. After this migration a new function/sequence created by `postgres` in public is
-- reachable only by its owner and service_role (service_role is kept as is for NEW functions/sequences, as requested).
--
-- FINDING for Themis: a schema-level REVOKE alone does NOT remove the built-in PUBLIC execute default of PostgreSQL (functions are born with
-- EXECUTE for PUBLIC unless a *global* default ACL says otherwise). Verified on the local stack: after only the schema-level revoke, a new
-- function was still executable by anon through PUBLIC. Step 1b therefore also revokes PUBLIC at the global (all-schemas) level for role
-- postgres. That row grants nothing to API roles (the P39-05 "global row granting API roles" check is unaffected).
--
-- SIDE EFFECT of step 1b (Themis N40-07): a function created LATER by `postgres` in ANY schema (private, extensions, ...) is born executable by
-- its owner only: not by PUBLIC, authenticated, nor service_role (before: all of them, through the PUBLIC default). Fail-closed. Existing
-- functions are untouched. A new helper that RLS policies / invoker functions call as authenticated, or that an Edge Function calls as
-- service_role, needs an explicit GRANT EXECUTE in its migration. Trigger functions need none (EXECUTE is only checked at CREATE TRIGGER time).
--
-- Step 4 TRIES the default ACLs of role supabase_admin, guarded: a refusal (42501) is a NOTICE, not a failure. It is expected to be refused for
-- postgres on hosted. IF IT IS REFUSED, objects created by supabase_admin (Supabase platform objects and extensions installed by the
-- bootstrap superuser, e.g. CREATE EXTENSION citext WITH SCHEMA public) KEEP the permissive defaults: tables ALL for anon/authenticated/
-- service_role, sequences and functions for anon/authenticated (functions also through the built-in PUBLIC default). No migration or CI control
-- can close that; see docs/operations/default-acl-hardening.md.
--
-- Failure behaviour (Themis N40-05): the file ABORTS (rolls back, nothing is committed) if it is run by a role that is neither postgres, a
-- member of postgres, nor a superuser, or if the expected objects (funnel_events_id_seq, postback_outbox_id_seq, the four trigger functions)
-- are missing or not owned by postgres, or if the closing assertion block finds anything still open. The sequence and trigger-function loops
-- match owner `postgres` explicitly, so running the file as a superuser such as supabase_admin works and does not silently skip them.
--
-- Rollback (reopens the hole; forward-fix preferred). Tested on a post-migration copy: default ACLs and all function/relation ACLs return to
-- the pre-state (only ACL element order differs). Run as postgres, in one transaction:
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;   -- deletes the global row = PostgreSQL built-in default
--   GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.funnel_events_id_seq, public.postback_outbox_id_seq TO anon, authenticated;
--   GRANT UPDATE, USAGE ON SEQUENCE public.funnel_events_id_seq, public.postback_outbox_id_seq TO service_role;   -- step 2b (N40-10)
--   GRANT EXECUTE ON FUNCTION public.enforce_max_profile_photos(), public.enforce_profile_birth_date_18_plus(),
--     public.enforce_profile_column_locks(), public.set_row_updated_at() TO authenticated;
--   COMMIT;
-- If step 4 was PERMITTED (a NOTICE for each statement did NOT appear), reverse it separately, as supabase_admin or a superuser:
--   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin GRANT EXECUTE ON FUNCTIONS TO PUBLIC;   -- restores the built-in default
--   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
--
-- Notes: REVOKE and ALTER DEFAULT PRIVILEGES take no relation lock, so the lock_timeout below is harmless but practically decorative (N40-09).
-- `psql -1 -f` on this file prints "there is already a transaction in progress" / "no transaction in progress" warnings (same as migration 080);
-- harmless, and the Supabase CLI does not print them (N40-12).

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 0. Precondition (N40-05): the loops below only see objects owned by `postgres`, and REVOKE by a role without rights on them is a WARNING, not an
--    error, so refuse to run as anyone who cannot act for postgres instead of committing a no-op.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    RAISE EXCEPTION 'default ACL migration: role postgres does not exist' USING ERRCODE = '42704';
  END IF;
  IF NOT pg_has_role(current_user, 'postgres', 'USAGE') THEN
    RAISE EXCEPTION 'default ACL migration must run as postgres, a member of postgres, or a superuser (current_user = %)', current_user
      USING ERRCODE = '42501';
  END IF;
END $$;

-- 1. Future functions and sequences created by postgres in public: no PUBLIC / anon / authenticated access. service_role keeps its default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM PUBLIC, anon, authenticated;

-- 1b. PostgreSQL's built-in "EXECUTE for PUBLIC" default for new functions can only be removed at the global level.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 2. Existing public sequences owned by postgres (the matrix showed funnel_events_id_seq and postback_outbox_id_seq with rwU for
--    anon/authenticated; the loop covers any other postgres-owned public sequence). Definer functions run as the owner, so nextval() inside
--    them is unaffected. The owner is matched explicitly (not current_user) so that a superuser run does not skip them (N40-05).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS seq
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'S' AND pg_get_userbyid(c.relowner) = 'postgres'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', r.seq);
  END LOOP;
END $$;

-- 2b. service_role has no INSERT on funnel_events or postback_outbox (migration 090), so it needs neither nextval (USAGE) nor setval (UPDATE) on
--     their sequences (N40-10). SELECT stays. The only writer, private.record_funnel_event, is a definer owned by postgres. Not in the loop above
--     because service_role keeps its default privileges on every other (and every future) sequence. Fails (rolls back) if a sequence is missing.
REVOKE UPDATE, USAGE ON SEQUENCE public.funnel_events_id_seq, public.postback_outbox_id_seq FROM service_role;

-- 3. Trigger functions in public were executable by authenticated through the old default. PostgreSQL checks EXECUTE on a trigger function
--    only at CREATE TRIGGER time, never when the trigger fires, and a trigger function cannot be called directly, so this changes nothing
--    for members and keeps the catalog check (pgTAP 0031) free of a long exception list. (Only prokind 'f' can return trigger.)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prorettype = 'pg_catalog.trigger'::regtype
       AND pg_get_userbyid(p.proowner) = 'postgres'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
  END LOOP;
END $$;

-- 4. supabase_admin default ACLs (objects created by supabase_admin: Supabase platform objects and extensions installed by the bootstrap
--    superuser; the dashboard SQL editor probably runs as postgres, UNVERIFIED). GUARDED, best effort: only supabase_admin or a superuser may
--    change them. Each statement runs in its own exception block; "permission denied to change default privileges" (42501, the error `postgres`
--    gets on the local CLI stack) is turned into a NOTICE so the migration still commits. If it IS permitted, it only REVOKEs.
--    The global (all-schemas) function revoke is needed because a schema-level REVOKE ... FROM PUBLIC does not remove PostgreSQL's built-in
--    PUBLIC execute default (N40-01); without it a function created later by supabase_admin stays executable by anon/authenticated.
DO $$
DECLARE stmt TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    RAISE NOTICE 'supabase_admin default ACLs: role does not exist, skipped';
    RETURN;
  END IF;
  FOREACH stmt IN ARRAY ARRAY[
    'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated',
    'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
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

-- 5. Closing assertions (N40-05): abort (nothing is committed) if an expected object was skipped or anything postgres-owned is still open.
--    Objects owned by OTHER roles (typically supabase_admin) cannot be fixed here; they only raise a WARNING with their count so a deploy is not
--    blocked by platform objects, but docs/operations/privcheck6.sql lists them and they must be investigated.
DO $$
DECLARE
  missing TEXT;
  n INT;
BEGIN
  SELECT string_agg(e.n, ', ') INTO missing
    FROM (VALUES ('funnel_events_id_seq'), ('postback_outbox_id_seq')) e(n)
   WHERE NOT EXISTS (SELECT 1 FROM pg_class c
                      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S' AND c.relname = e.n AND pg_get_userbyid(c.relowner) = 'postgres');
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'default ACL migration: expected sequence(s) missing or not owned by postgres (skipped): %', missing;
  END IF;

  SELECT string_agg(e.n, ', ') INTO missing
    FROM (VALUES ('enforce_max_profile_photos'), ('enforce_profile_birth_date_18_plus'), ('enforce_profile_column_locks'), ('set_row_updated_at')) e(n)
   WHERE NOT EXISTS (SELECT 1 FROM pg_proc p
                      WHERE p.pronamespace = 'public'::regnamespace AND p.proname = e.n AND p.prokind = 'f'
                        AND p.prorettype = 'pg_catalog.trigger'::regtype AND pg_get_userbyid(p.proowner) = 'postgres');
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'default ACL migration: expected trigger function(s) missing or not owned by postgres (skipped): %', missing;
  END IF;

  SELECT count(*) INTO n FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S' AND pg_get_userbyid(c.relowner) = 'postgres'
     AND (c.relacl IS NULL
          OR EXISTS (SELECT 1 FROM aclexplode(c.relacl) x WHERE x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon', 'authenticated')));
  IF n > 0 THEN
    RAISE EXCEPTION 'default ACL migration: % postgres-owned public sequence(s) still open to PUBLIC/anon/authenticated', n;
  END IF;

  SELECT count(*) INTO n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.prorettype = 'pg_catalog.trigger'::regtype
     AND pg_get_userbyid(p.proowner) = 'postgres'
     AND (p.proacl IS NULL
          OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon', 'authenticated')));
  IF n > 0 THEN
    RAISE EXCEPTION 'default ACL migration: % postgres-owned public trigger function(s) still executable by PUBLIC/anon/authenticated', n;
  END IF;

  IF has_sequence_privilege('service_role', 'public.funnel_events_id_seq', 'USAGE') OR has_sequence_privilege('service_role', 'public.funnel_events_id_seq', 'UPDATE')
     OR has_sequence_privilege('service_role', 'public.postback_outbox_id_seq', 'USAGE') OR has_sequence_privilege('service_role', 'public.postback_outbox_id_seq', 'UPDATE') THEN
    RAISE EXCEPTION 'default ACL migration: service_role still has USAGE/UPDATE on funnel_events_id_seq or postback_outbox_id_seq';
  END IF;

  SELECT count(*) INTO n FROM pg_default_acl d, aclexplode(d.defaclacl) x
   WHERE pg_get_userbyid(d.defaclrole) = 'postgres' AND d.defaclobjtype IN ('f', 'S')
     AND (d.defaclnamespace = 'public'::regnamespace OR d.defaclnamespace = 0)
     AND (x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon', 'authenticated'));
  IF n > 0 THEN
    RAISE EXCEPTION 'default ACL migration: default ACLs of postgres for functions/sequences still reach PUBLIC/anon/authenticated (% entries)', n;
  END IF;

  SELECT count(*) INTO n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND pg_get_userbyid(p.proowner) <> 'postgres';
  IF n > 0 THEN
    RAISE WARNING 'default ACL migration: % public function(s) not owned by postgres (e.g. extension objects created by supabase_admin); their ACLs were NOT changed, run privcheck6.sql', n;
  END IF;
  SELECT count(*) INTO n FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f') AND pg_get_userbyid(c.relowner) <> 'postgres';
  IF n > 0 THEN
    RAISE WARNING 'default ACL migration: % public relation(s) not owned by postgres; their ACLs were NOT changed, run privcheck6.sql', n;
  END IF;
END $$;

COMMIT;

-- supabase_admin default ACLs: step 4 above tries them and tolerates a refusal. On the local CLI stack (postgres is not a superuser) the exact
-- refusal is `ERROR:  permission denied to change default privileges` (caught and reported as a NOTICE, once per statement). Whatever the outcome
-- on hosted, the convention in docs/operations/default-acl-hardening.md applies: create schema objects only through migrations, install
-- extensions only WITH SCHEMA extensions. Check privcheck6.sql (sections default_acl, default_acl_global_f, owner_not_postgres) after applying.
