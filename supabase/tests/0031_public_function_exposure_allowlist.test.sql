-- Themis PR #39 re-review (migration 20261023000100): catalog check that FAILS when a function in schema public is executable by anon or
-- authenticated without being on the explicit allowlist below, when a public sequence is open to PUBLIC/anon/authenticated, or when the
-- default ACLs for new functions/sequences created by postgres become permissive again.
-- Scope: every pg_proc row in public, ALL kinds (functions, procedures, aggregates, window functions; Themis N40-03), including
-- extension-owned ones. An allowlisted function is also PINNED (Themis N40-04): SECURITY DEFINER vs INVOKER, owner and the proconfig
-- (search_path) must equal the values below, so switching a definer RPC to INVOKER or unpinning its search_path fails this file.
-- Limits (by design): this inspects the database under test only (CI / local), never hosted; the global-default detector (#11) cannot see a
-- global PUBLIC re-grant because PostgreSQL deletes the row when it equals the built-in default (Themis N40-11), the behavioural probes
-- (#13, #14, #16) are what catch that case.
--
-- HOW TO MAINTAIN: a new client-callable RPC must be added to allowed_exec in the SAME PR with a justification comment. Every other new
-- function must `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` and grant only what it needs (docs/operations/default-acl-hardening.md).
--
-- The allowlist was derived from (a) every supabase-js `.rpc('...')` call in app/, lib/, components/, hooks/, (b) the grants in the migrations,
-- and (c) the pgTAP suites that call each function as `authenticated` / `anon`. Anything service_role-only (billing_*, purge_*, admin_*,
-- claim_notification_jobs, quiz_funnel_summary, ...) is deliberately NOT on it.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(37);

-- sig is pg_proc.oid::regprocedure::text; anon / authenticated are the EXPECTED EXECUTE state (whole-name match, no wildcards).
-- definer = prosecdef, owner = pg_get_userbyid(proowner), config = array_to_string(proconfig, ',') (the pinned search_path), all EXPECTED.
CREATE TEMP TABLE allowed_exec (sig TEXT PRIMARY KEY, anon BOOLEAN NOT NULL, authenticated BOOLEAN NOT NULL,
                                definer BOOLEAN NOT NULL, owner TEXT NOT NULL, config TEXT NOT NULL, why TEXT NOT NULL);
INSERT INTO allowed_exec VALUES
 -- ANONYMOUS + signed-in: the privacy-respecting quiz funnel (PR #37). Pre-signup visitors have no session; the function is a definer that
 -- validates and rate-limits input and is the only writer of public.quiz_events.
 ('record_quiz_event(uuid,text,integer,text,text,text,text,text,text)',  true, true, true, 'postgres', 'search_path=""', 'PR #37 anonymous quiz funnel events (lib/quizAnalytics.ts)'),
 -- SIGNED-IN members only (called from the app with the member JWT; each is a definer that derives the actor from auth.uid()):
 ('block_user(uuid)',                                            false, true, true, 'postgres', 'search_path=public, pg_temp', 'safety: block a member (app/blocks)'),
 ('unblock_user(uuid)',                                          false, true, true, 'postgres', 'search_path=public, pg_temp', 'safety: undo a block'),
 ('list_blocked_users()',                                        false, true, true, 'postgres', 'search_path=public, pg_temp', 'safety: blocked-users screen'),
 ('submit_report(uuid,report_category,text,uuid)',               false, true, true, 'postgres', 'search_path=public, pg_temp', 'safety: report a member/message'),
 ('unmatch(uuid)',                                               false, true, true, 'postgres', 'search_path=public, pg_temp', 'matching: end a match'),
 ('record_swipe(uuid,swipe_direction)',                          false, true, true, 'postgres', 'search_path=public, pg_temp', 'matching: swipe (quota enforced in the function)'),
 ('get_discovery_feed(integer,timestamp with time zone)',        false, true, true, 'postgres', 'search_path=public, pg_temp', 'discovery feed'),
 ('get_liked_you()',                                             false, true, true, 'postgres', 'search_path=public, pg_temp', 'premium: likes list (entitlement checked inside)'),
 ('get_liked_you_count()',                                       false, true, true, 'postgres', 'search_path=public, pg_temp', 'premium: likes count'),
 ('get_conversation_list()',                                     false, true, true, 'postgres', 'search_path=public, pg_temp', 'messaging: inbox'),
 ('send_message(uuid,text,uuid)',                                false, true, true, 'postgres', 'search_path=public, pg_temp', 'messaging: send (membership, blocks, idempotency checked inside)'),
 ('register_push_token(text,text)',                              false, true, true, 'postgres', 'search_path=public, pg_temp', 'notifications: register device token'),
 ('unregister_push_token(text)',                                 false, true, true, 'postgres', 'search_path=public, pg_temp', 'notifications: remove device token'),
 ('request_privacy_action(privacy_request_type,uuid)',           false, true, true, 'postgres', 'search_path=public, pg_temp', 'privacy: export/deletion request (idempotent)'),
 ('refresh_my_discoverability()',                                false, true, true, 'postgres', 'search_path=public, pg_temp', 'profile: recompute own discoverability'),
 ('get_my_premium_status()',                                     false, true, true, 'postgres', 'search_path=public, pg_temp', 'billing (read only): own entitlement status'),
 ('get_billing_plan(text)',                                      false, true, true, 'postgres', 'search_path=public, pg_temp', 'billing (read only): price shown to the member'),
 ('has_active_entitlement(uuid)',                                false, true, false, 'postgres', 'search_path=public, pg_temp', 'used by RLS/RPC checks that run as the member; invoker function, reads only'),
 ('moderation_transition_case(uuid,moderation_case_status,text)',  false, true, true, 'postgres', 'search_path=public, pg_temp', 'moderator tooling; authorisation (moderator role) is checked inside the definer');

CREATE TEMP VIEW v_fn_actual AS
SELECT p.oid::regprocedure::text AS sig,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       p.prosecdef AS definer, pg_get_userbyid(p.proowner)::TEXT AS owner, coalesce(array_to_string(p.proconfig, ','), '') AS config
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prokind IN ('f','p','a','w')
   AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

-- detector 1: executable by anon/authenticated beyond the allowlist (an unexpected function, an allowlisted one with a wider audience, or an
-- allowlisted one whose security mode / owner / pinned search_path changed)
CREATE TEMP VIEW v_fn_unexpected AS
SELECT sig, anon, authenticated, definer, owner, config FROM v_fn_actual
EXCEPT
SELECT sig, anon, authenticated, definer, owner, config FROM allowed_exec;

-- detector 2: any public function whose ACL grants PUBLIC (explicitly, or NULL ACL = built-in PUBLIC execute)
CREATE TEMP VIEW v_fn_public AS
SELECT p.oid::regprocedure::text AS sig
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prokind IN ('f','p','a','w')
   AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0));

-- detector 3: public sequences open to PUBLIC / anon / authenticated
CREATE TEMP VIEW v_seq_exposed AS
SELECT c.relname::TEXT AS seq
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'S'
   AND (c.relacl IS NULL
        OR EXISTS (SELECT 1 FROM aclexplode(c.relacl) x WHERE x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon','authenticated'))
        OR has_sequence_privilege('anon', c.oid, 'USAGE') OR has_sequence_privilege('anon', c.oid, 'SELECT') OR has_sequence_privilege('anon', c.oid, 'UPDATE')
        OR has_sequence_privilege('authenticated', c.oid, 'USAGE') OR has_sequence_privilege('authenticated', c.oid, 'SELECT') OR has_sequence_privilege('authenticated', c.oid, 'UPDATE'));

-- detector 4: default ACLs for NEW functions / sequences created by postgres (schema public and global) that reach PUBLIC/anon/authenticated
CREATE TEMP VIEW v_default_acl_open AS
SELECT d.defaclobjtype::TEXT AS objtype, coalesce(d.defaclnamespace::regnamespace::TEXT, 'global') AS scope
  FROM pg_default_acl d, aclexplode(d.defaclacl) x
 WHERE pg_get_userbyid(d.defaclrole) = 'postgres' AND d.defaclobjtype IN ('f','S')
   AND (d.defaclnamespace = 'public'::regnamespace OR d.defaclnamespace = 0)
   AND (x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon','authenticated'));

-- 1-4. the real catalog
SELECT is_empty($$SELECT * FROM v_fn_unexpected$$, 'no public function is executable by anon/authenticated beyond the allowlist (a row = an unreviewed client-callable function)');
SELECT is_empty($$SELECT sig, anon, authenticated, definer, owner, config FROM allowed_exec EXCEPT SELECT sig, anon, authenticated, definer, owner, config FROM v_fn_actual$$,
                'every allowlist entry exists with exactly the documented audience, SECURITY DEFINER/INVOKER mode, owner and pinned search_path (stale, narrowed or unpinned entries fail)');
SELECT is_empty($$SELECT * FROM v_fn_public$$, 'no public function grants EXECUTE to PUBLIC (and none has a NULL ACL)');
SELECT is_empty($$SELECT * FROM v_seq_exposed$$, 'no public sequence is open to PUBLIC/anon/authenticated');

-- 5. the allowlist's only anonymous entry is the quiz recorder
SELECT is((SELECT count(*)::INT FROM v_fn_actual WHERE anon), 1, 'exactly one public function is anon-callable');
SELECT ok((SELECT anon AND authenticated FROM v_fn_actual WHERE sig LIKE 'record_quiz_event(%'), 'it is record_quiz_event, for anon and authenticated');

-- 6. trigger functions are not callable by API roles (EXECUTE is only checked at CREATE TRIGGER time, never when a trigger fires)
SELECT is_empty($$SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prorettype = 'pg_catalog.trigger'::regtype
                   AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))$$,
                'trigger functions in public are not executable by anon/authenticated');

-- 7. sequences: the two that were open stay closed for API roles; service_role keeps only SELECT on them (Themis N40-10: it has no INSERT on
--    funnel_events / postback_outbox, so USAGE (nextval) and UPDATE (setval) are removed; the only writer, private.record_funnel_event, is a
--    definer owned by postgres)
SELECT is_empty($$SELECT 1 FROM (VALUES ('funnel_events_id_seq'),('postback_outbox_id_seq')) s(n)
                   WHERE has_sequence_privilege('anon', 'public.'||n, 'USAGE') OR has_sequence_privilege('authenticated', 'public.'||n, 'USAGE')
                      OR has_sequence_privilege('anon', 'public.'||n, 'UPDATE') OR has_sequence_privilege('authenticated', 'public.'||n, 'UPDATE')
                      OR has_sequence_privilege('anon', 'public.'||n, 'SELECT') OR has_sequence_privilege('authenticated', 'public.'||n, 'SELECT')$$,
                'funnel_events_id_seq / postback_outbox_id_seq: no USAGE/SELECT/UPDATE for anon or authenticated');
SELECT ok(NOT has_sequence_privilege('service_role', 'public.funnel_events_id_seq', 'USAGE') AND NOT has_sequence_privilege('service_role', 'public.postback_outbox_id_seq', 'USAGE')
          AND NOT has_sequence_privilege('service_role', 'public.funnel_events_id_seq', 'UPDATE') AND NOT has_sequence_privilege('service_role', 'public.postback_outbox_id_seq', 'UPDATE'),
          'service_role has no USAGE (nextval) and no UPDATE (setval) on funnel_events_id_seq / postback_outbox_id_seq');
SELECT ok(has_sequence_privilege('service_role', 'public.funnel_events_id_seq', 'SELECT') AND has_sequence_privilege('service_role', 'public.postback_outbox_id_seq', 'SELECT')
          AND NOT has_table_privilege('service_role', 'public.funnel_events', 'INSERT') AND NOT has_table_privilege('service_role', 'public.postback_outbox', 'INSERT'),
          'service_role keeps SELECT on both sequences and (as the matrix in 0029 requires) has no INSERT on either table');

-- 8-9. default ACLs for new objects
SELECT is_empty($$SELECT * FROM v_default_acl_open$$, 'default ACLs of postgres (schema public and global) for functions and sequences give nothing to PUBLIC/anon/authenticated');
SELECT ok(EXISTS (SELECT 1 FROM pg_default_acl d, aclexplode(d.defaclacl) x WHERE pg_get_userbyid(d.defaclrole) = 'postgres' AND d.defaclnamespace = 'public'::regnamespace AND d.defaclobjtype = 'f' AND pg_get_userbyid(x.grantee) = 'service_role' AND x.privilege_type = 'EXECUTE')
      AND EXISTS (SELECT 1 FROM pg_default_acl d, aclexplode(d.defaclacl) x WHERE pg_get_userbyid(d.defaclrole) = 'postgres' AND d.defaclnamespace = 'public'::regnamespace AND d.defaclobjtype = 'S' AND pg_get_userbyid(x.grantee) = 'service_role' AND x.privilege_type = 'USAGE'),
      'service_role keeps its default EXECUTE on new functions and USAGE on new sequences (kept as is)');

-- 10-15. behaviour: objects created now by postgres in public are born closed to API roles
CREATE FUNCTION public.t_probe_new_fn() RETURNS INT LANGUAGE sql AS $$ SELECT 1 $$;
CREATE SEQUENCE public.t_probe_new_seq;
SELECT ok(NOT has_function_privilege('anon', 'public.t_probe_new_fn()', 'EXECUTE'), 'a new function is NOT executable by anon (nor via PUBLIC)');
SELECT ok(NOT has_function_privilege('authenticated', 'public.t_probe_new_fn()', 'EXECUTE'), 'a new function is NOT executable by authenticated');
SELECT ok(has_function_privilege('service_role', 'public.t_probe_new_fn()', 'EXECUTE'), 'a new function is executable by service_role (kept as is)');
SELECT is_empty($$SELECT sig FROM v_fn_public WHERE sig LIKE 't_probe_new_fn%'$$, 'a new function has no PUBLIC ACL entry');
SELECT ok(NOT has_sequence_privilege('anon', 'public.t_probe_new_seq', 'USAGE') AND NOT has_sequence_privilege('authenticated', 'public.t_probe_new_seq', 'USAGE')
          AND NOT has_sequence_privilege('authenticated', 'public.t_probe_new_seq', 'UPDATE') AND NOT has_sequence_privilege('anon', 'public.t_probe_new_seq', 'SELECT'),
          'a new sequence is closed to anon/authenticated');
SELECT ok(has_sequence_privilege('service_role', 'public.t_probe_new_seq', 'USAGE'), 'a new sequence keeps service_role USAGE (kept as is)');

-- NEGATIVE PROOFS (each is reverted inside this transaction, and the whole file ends in ROLLBACK)
-- (a) re-grant EXECUTE on a service-role-only function to authenticated -> detector 1 flags it, and removing it clears it again
GRANT EXECUTE ON FUNCTION public.billing_apply_readback(uuid) TO authenticated;
SELECT isnt_empty($$SELECT * FROM v_fn_unexpected WHERE sig LIKE 'billing_apply_readback%'$$, 'NEGATIVE PROOF (a): GRANT EXECUTE to authenticated on a billing function is flagged by the allowlist check');
REVOKE EXECUTE ON FUNCTION public.billing_apply_readback(uuid) FROM authenticated;
SELECT is_empty($$SELECT * FROM v_fn_unexpected$$, 'after revoking (a) the allowlist check is clean again');

-- (b) grant EXECUTE to PUBLIC (the classic CREATE FUNCTION default) on a service-role-only function -> detectors 1 and 2 flag it
GRANT EXECUTE ON FUNCTION public.billing_purge_readbacks(interval) TO PUBLIC;
SELECT isnt_empty($$SELECT * FROM v_fn_public WHERE sig LIKE 'billing_purge_readbacks%'$$, 'NEGATIVE PROOF (b): GRANT EXECUTE TO PUBLIC is flagged by the PUBLIC-ACL check');
SELECT isnt_empty($$SELECT * FROM v_fn_unexpected WHERE sig LIKE 'billing_purge_readbacks%'$$, 'NEGATIVE PROOF (b): ... and by the allowlist check (PUBLIC implies anon)');
REVOKE EXECUTE ON FUNCTION public.billing_purge_readbacks(interval) FROM PUBLIC;

-- (c) re-grant USAGE on a sequence to anon -> detector 3 flags it
GRANT USAGE ON SEQUENCE public.funnel_events_id_seq TO anon;
SELECT isnt_empty($$SELECT * FROM v_seq_exposed WHERE seq = 'funnel_events_id_seq'$$, 'NEGATIVE PROOF (c): GRANT USAGE on funnel_events_id_seq to anon is flagged');
REVOKE ALL ON SEQUENCE public.funnel_events_id_seq FROM anon;

-- (d) restore the permissive default ACLs -> a new function is born anon-executable and detector 4 flags the default
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
CREATE FUNCTION public.t_probe_permissive_fn() RETURNS INT LANGUAGE sql AS $$ SELECT 1 $$;
SELECT ok(has_function_privilege('anon', 'public.t_probe_permissive_fn()', 'EXECUTE') AND EXISTS (SELECT 1 FROM v_fn_unexpected WHERE sig LIKE 't_probe_permissive_fn%'),
          'NEGATIVE PROOF (d): with the permissive default restored a new function is anon-executable and the allowlist check flags it');
SELECT isnt_empty($$SELECT * FROM v_default_acl_open$$, 'NEGATIVE PROOF (d): ... and the default-ACL check flags the permissive default');
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
SELECT is_empty($$SELECT * FROM v_default_acl_open$$, 'after re-revoking (d) the default-ACL check is clean again');
DROP FUNCTION public.t_probe_permissive_fn();  -- born anon-executable under the restored default; remove it so the proofs below start from a clean allowlist state

-- (e) an AGGREGATE (prokind 'a') in public granted to anon / PUBLIC: invisible to the old prokind IN ('f','p') filter (Themis N40-03)
CREATE AGGREGATE public.t_probe_agg(integer) (SFUNC = int4pl, STYPE = integer);
SELECT ok(NOT has_function_privilege('anon', 'public.t_probe_agg(integer)', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.t_probe_agg(integer)', 'EXECUTE'),
          'a new aggregate is born closed to anon/authenticated');
GRANT EXECUTE ON FUNCTION public.t_probe_agg(integer) TO anon;
SELECT isnt_empty($$SELECT * FROM v_fn_unexpected WHERE sig LIKE 't_probe_agg%'$$, 'NEGATIVE PROOF (e): GRANT EXECUTE on an aggregate to anon is flagged by the allowlist check');
REVOKE EXECUTE ON FUNCTION public.t_probe_agg(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.t_probe_agg(integer) TO PUBLIC;
SELECT isnt_empty($$SELECT * FROM v_fn_public WHERE sig LIKE 't_probe_agg%'$$, 'NEGATIVE PROOF (e): GRANT EXECUTE on an aggregate TO PUBLIC is flagged by the PUBLIC-ACL check');
REVOKE EXECUTE ON FUNCTION public.t_probe_agg(integer) FROM PUBLIC;
SELECT is_empty($$SELECT * FROM v_fn_unexpected$$, 'after reverting (e) the allowlist check is clean again');

-- (f) an allowlisted SECURITY DEFINER RPC switched to SECURITY INVOKER -> flagged (Themis N40-04); restored afterwards
ALTER FUNCTION public.block_user(uuid) SECURITY INVOKER;
SELECT isnt_empty($$SELECT * FROM v_fn_unexpected WHERE sig LIKE 'block_user%'$$, 'NEGATIVE PROOF (f): an allowlisted definer RPC switched to SECURITY INVOKER is flagged');
ALTER FUNCTION public.block_user(uuid) SECURITY DEFINER;
SELECT is_empty($$SELECT * FROM v_fn_unexpected$$, 'after reverting (f) the allowlist check is clean again');

-- (g) an allowlisted RPC with its search_path unpinned or changed -> flagged (Themis N40-04); restored afterwards
ALTER FUNCTION public.block_user(uuid) RESET search_path;
SELECT isnt_empty($$SELECT * FROM v_fn_unexpected WHERE sig LIKE 'block_user%'$$, 'NEGATIVE PROOF (g): an allowlisted RPC with search_path reset (unpinned) is flagged');
ALTER FUNCTION public.block_user(uuid) SET search_path = public, extensions, pg_temp;
SELECT isnt_empty($$SELECT * FROM v_fn_unexpected WHERE sig LIKE 'block_user%'$$, 'NEGATIVE PROOF (g): ... and so is one with a different search_path');
ALTER FUNCTION public.block_user(uuid) SET search_path = public, pg_temp;
SELECT is_empty($$SELECT * FROM v_fn_unexpected$$, 'after reverting (g) the allowlist check is clean again');

-- (h) an allowlisted RPC whose OWNER changed (a definer runs with its owner's rights) -> flagged (Themis N40-04); restored afterwards
CREATE ROLE t_probe_owner NOLOGIN;
GRANT t_probe_owner TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA public TO t_probe_owner;
ALTER FUNCTION public.block_user(uuid) OWNER TO t_probe_owner;
SELECT isnt_empty($$SELECT * FROM v_fn_unexpected WHERE sig LIKE 'block_user%'$$, 'NEGATIVE PROOF (h): an allowlisted RPC owned by another role is flagged');
ALTER FUNCTION public.block_user(uuid) OWNER TO postgres;
SELECT is_empty($$SELECT * FROM v_fn_unexpected$$, 'after reverting (h) the allowlist check is clean again');

SELECT * FROM finish();
ROLLBACK;
