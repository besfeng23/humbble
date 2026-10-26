-- Local/CI fixtures only. Proves the recovered identity-link schema's boundary.
-- Provider-session verification belongs to api/sincera/link-identity.mjs.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(26);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-00000000a601', 'authenticated', 'authenticated', 'sincera-link-a@example.test', now(), now()),
 ('00000000-0000-0000-0000-00000000a602', 'authenticated', 'authenticated', 'sincera-link-b@example.test', now(), now());

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='private.bubble_identity_links'::regclass), 'links have RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='private.bubble_identity_link_audit'::regclass), 'link audit has RLS enabled');
SELECT ok((SELECT prosecdef AND pg_get_userbyid(proowner)='postgres' AND proconfig=ARRAY['search_path=""']::text[] FROM pg_proc WHERE oid='public.sincera_activate_bubble_link(text,uuid,text)'::regprocedure), 'link RPC is owned by postgres with an empty pinned search_path');
SELECT ok(NOT has_function_privilege('anon','public.sincera_activate_bubble_link(text,uuid,text)','EXECUTE'), 'anonymous cannot activate links');
SELECT ok(NOT has_function_privilege('authenticated','public.sincera_activate_bubble_link(text,uuid,text)','EXECUTE'), 'members cannot activate links directly');
SELECT ok(has_function_privilege('service_role','public.sincera_activate_bubble_link(text,uuid,text)','EXECUTE'), 'trusted server can activate links');
SELECT is_empty($$SELECT x.grantee FROM pg_proc p, aclexplode(p.proacl) x WHERE p.oid='public.sincera_activate_bubble_link(text,uuid,text)'::regprocedure AND x.grantee=0$$, 'no PUBLIC execute grant');
SELECT ok(NOT has_table_privilege('anon','private.bubble_identity_links','SELECT') AND NOT has_table_privilege('anon','private.bubble_identity_link_audit','SELECT'), 'anonymous cannot read private mappings or audit');
SELECT ok(NOT has_table_privilege('authenticated','private.bubble_identity_links','SELECT') AND NOT has_table_privilege('authenticated','private.bubble_identity_link_audit','SELECT'), 'members cannot read private mappings or audit');
SELECT ok(NOT has_table_privilege('service_role','private.bubble_identity_link_audit','UPDATE') AND NOT has_table_privilege('service_role','private.bubble_identity_link_audit','DELETE'), 'server cannot update or delete link audit entries');

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.sincera_activate_bubble_link('1793000000001x000000000000000001','00000000-0000-0000-0000-00000000a601','00000000-0000-0000-0000-00000000e601')$$, '42501', NULL, 'anonymous direct call is denied');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.sincera_activate_bubble_link('1793000000001x000000000000000001','00000000-0000-0000-0000-00000000a601','00000000-0000-0000-0000-00000000e601')$$, '42501', NULL, 'member direct call is denied');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT ok(public.sincera_activate_bubble_link('1793000000001x000000000000000001','00000000-0000-0000-0000-00000000a601','00000000-0000-0000-0000-00000000e601'), 'trusted server creates a verified mapping');
SELECT ok(public.sincera_activate_bubble_link('1793000000001x000000000000000001','00000000-0000-0000-0000-00000000a601','00000000-0000-0000-0000-00000000e602'), 'sequential replay of the same mapping succeeds');
RESET ROLE;
SELECT is((SELECT count(*) FROM private.bubble_identity_links WHERE bubble_user_id='1793000000001x000000000000000001' AND state='verified'), 1::bigint, 'one mapping after replay');
SELECT is((SELECT count(*) FROM private.bubble_identity_link_audit WHERE bubble_user_id='1793000000001x000000000000000001'), 1::bigint, 'sequential replay does not duplicate audit');
SELECT ok((SELECT bubble_proof_verified_at IS NOT NULL AND supabase_proof_verified_at IS NOT NULL AND verified_at IS NOT NULL AND verification_method='bubble_member_token_and_supabase_auth' AND evidence_reference='00000000-0000-0000-0000-00000000e601' FROM private.bubble_identity_links WHERE bubble_user_id='1793000000001x000000000000000001'), 'both proof timestamps and original opaque evidence are retained');

SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.sincera_activate_bubble_link('1793000000001x000000000000000001','00000000-0000-0000-0000-00000000a602','00000000-0000-0000-0000-00000000e603')$$, '23505', 'conflicting linked account', 'Bubble identity cannot be reassigned');
SELECT throws_ok($$SELECT public.sincera_activate_bubble_link('1793000000002x000000000000000002','00000000-0000-0000-0000-00000000a601','00000000-0000-0000-0000-00000000e603')$$, '23505', NULL, 'Supabase identity cannot be claimed by another Bubble identity');
SELECT throws_ok($$SELECT public.sincera_activate_bubble_link('invalid','00000000-0000-0000-0000-00000000a602','00000000-0000-0000-0000-00000000e603')$$, '22023', 'invalid Bubble member ID', 'invalid Bubble identity is rejected');
SELECT throws_ok($$SELECT public.sincera_activate_bubble_link('1793000000002x000000000000000002','00000000-0000-0000-0000-00000000a699','00000000-0000-0000-0000-00000000e603')$$, '22023', 'Supabase identity not found', 'missing Supabase identity is rejected');
SELECT throws_ok($$SELECT public.sincera_activate_bubble_link('1793000000002x000000000000000002','00000000-0000-0000-0000-00000000a602','00000000-0000-0000-0000-00000000zzzz')$$, '22023', 'invalid evidence reference format', 'non-UUID evidence is rejected');
RESET ROLE;

UPDATE private.bubble_identity_links SET state='revoked' WHERE bubble_user_id='1793000000001x000000000000000001';
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.sincera_activate_bubble_link('1793000000001x000000000000000001','00000000-0000-0000-0000-00000000a601','00000000-0000-0000-0000-00000000e603')$$, '23505', 'conflicting linked account', 'revoked mapping cannot be reactivated by replay');
RESET ROLE;
SELECT throws_ok($$INSERT INTO private.bubble_identity_links(bubble_user_id,supabase_user_id,state,verified_at) VALUES('1793000000003x000000000000000003','00000000-0000-0000-0000-00000000a602','verified',now())$$, '23514', NULL, 'verified state requires both proofs');
SELECT ok((SELECT state='revoked' AND supabase_user_id='00000000-0000-0000-0000-00000000a601' FROM private.bubble_identity_links WHERE bubble_user_id='1793000000001x000000000000000001'), 'denials preserve mapping ownership and revocation');
SELECT is((SELECT count(*) FROM private.bubble_identity_link_audit WHERE bubble_user_id='1793000000001x000000000000000001'), 1::bigint, 'failed attempts add no linked audit row');

SELECT * FROM finish();
ROLLBACK;
