BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(12);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'private.discovery_cursors'::regclass), 'private.discovery_cursors has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'private.pair_exclusions'::regclass), 'private.pair_exclusions has RLS enabled');

SELECT ok(NOT has_table_privilege('anon', 'private.discovery_cursors', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'anon has no privileges on private.discovery_cursors');
SELECT ok(NOT has_table_privilege('authenticated', 'private.discovery_cursors', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'authenticated has no privileges on private.discovery_cursors');
SELECT ok(NOT has_table_privilege('anon', 'private.pair_exclusions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'anon has no privileges on private.pair_exclusions');
SELECT ok(NOT has_table_privilege('authenticated', 'private.pair_exclusions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'authenticated has no privileges on private.pair_exclusions');
SELECT is((SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema = 'private' AND table_name IN ('discovery_cursors','pair_exclusions') AND grantee IN ('anon','authenticated','PUBLIC')), 0, 'no table grants to anon/authenticated/PUBLIC on private tables');
SELECT ok(NOT has_sequence_privilege('authenticated', 'private.discovery_cursor_token_seq', 'USAGE,SELECT,UPDATE') AND NOT has_sequence_privilege('anon', 'private.discovery_cursor_token_seq', 'USAGE,SELECT,UPDATE'), 'clients have no privileges on the discovery cursor sequence');

-- Accessor functions stay SECURITY DEFINER owned by postgres, so RLS does not break them.
SELECT is((SELECT count(*)::int FROM pg_proc p WHERE p.oid IN (
    'public.get_discovery_feed(integer,timestamptz)'::regprocedure,
    'public.record_swipe(uuid,public.swipe_direction)'::regprocedure,
    'private.is_pair_excluded(uuid,uuid)'::regprocedure,
    'private.record_pair_exclusion_on_block()'::regprocedure,
    'private.guard_swipe_pair()'::regprocedure)
  AND p.prosecdef AND pg_get_userbyid(p.proowner) = 'postgres'), 5, 'all accessor functions are SECURITY DEFINER owned by postgres');
SELECT ok(NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'private.pair_exclusions'::regclass) AND NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'private.discovery_cursors'::regclass), 'RLS is not forced, so the postgres-owned definers bypass it');

-- Functional check: definer path still writes and reads pair exclusions under RLS.
DELETE FROM auth.users WHERE id IN ('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000072');
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000071','authenticated','authenticated','rls71@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000072','authenticated','authenticated','rls72@example.test',now(),now());
INSERT INTO private.pair_exclusions(user_a_id, user_b_id, reason) VALUES ('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000072','test');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000071","role":"authenticated"}';
SELECT throws_ok($$SELECT count(*) FROM private.pair_exclusions$$, '42501', NULL, 'authenticated cannot read private.pair_exclusions directly');
RESET ROLE;
SELECT ok(private.is_pair_excluded('00000000-0000-0000-0000-000000000072','00000000-0000-0000-0000-000000000071'), 'SECURITY DEFINER is_pair_excluded still reads the table with RLS enabled');

SELECT * FROM finish();
ROLLBACK;
