-- F-02 / F-03 / F-04 (migration 20261023000090): per-table writer lock-down, asserted AS service_role with SQLSTATE 42501,
-- while every legitimate writer (SECURITY DEFINER RPCs / triggers) keeps working. Includes negative proof by temporary re-grant.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(91);

DELETE FROM auth.users WHERE id IN ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000402');
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, raw_user_meta_data) VALUES
 ('00000000-0000-0000-0000-000000000401','authenticated','authenticated','wr-a@example.test',now(),now(),'{"consent":{"terms_privacy":"true","marketing":"true"}}'),
 ('00000000-0000-0000-0000-000000000402','authenticated','authenticated','wr-b@example.test',now(),now(),'{}');
INSERT INTO public.profiles (id, display_name, birth_date, verification_status, is_discoverable, is_suspended) VALUES
 ('00000000-0000-0000-0000-000000000401','Writer A',DATE '1991-01-01','verified',TRUE,FALSE),
 ('00000000-0000-0000-0000-000000000402','Writer B',DATE '1991-01-02','verified',TRUE,FALSE);

-- ===== legitimate writers still work (as the client / system principals they are meant for) =====
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}';
SELECT is(public.block_user('00000000-0000-0000-0000-000000000402'), '00000000-0000-0000-0000-000000000402'::UUID, 'writer blocks <- block_user (definer RPC) works');
SELECT is(public.unblock_user('00000000-0000-0000-0000-000000000402'), TRUE, 'writer blocks <- unblock_user works');
CREATE TEMP TABLE t_ids (label TEXT, id UUID);
GRANT ALL ON t_ids TO authenticated, service_role;
INSERT INTO t_ids SELECT 'report', public.submit_report('00000000-0000-0000-0000-000000000402','scam','writer test','00000000-0000-0000-0000-0000000004a1'::UUID);
SELECT ok((SELECT id FROM t_ids WHERE label='report') IS NOT NULL, 'writer reports <- submit_report works');
RESET ROLE;
RESET "request.jwt.claims";
SELECT is((SELECT count(*)::INT FROM public.user_consents WHERE user_id = '00000000-0000-0000-0000-000000000401'), 1, 'writer user_consents <- the auth.users signup trigger (definer) recorded the consent row');
SELECT is((SELECT count(*)::INT FROM public.signup_attributions WHERE user_id = '00000000-0000-0000-0000-000000000401'), 1, 'writer signup_attributions <- the signup trigger recorded attribution');
SELECT cmp_ok((SELECT count(*)::INT FROM public.funnel_events WHERE user_id = '00000000-0000-0000-0000-000000000401'), '>=', 1, 'writer funnel_events <- private.record_funnel_event recorded signup_completed');

-- ===== read-only tables: service_role has SELECT and nothing else =====
SET LOCAL ROLE service_role;
SELECT lives_ok(format('SELECT count(*) FROM public.%I', t), 'service_role can SELECT ' || t)
  FROM unnest(ARRAY['user_consents','billing_plans','billing_markets','attribution_networks','postback_outbox','signup_attributions','funnel_events','blocks','messages']) t;
SELECT throws_ok(format('INSERT INTO public.%I DEFAULT VALUES', t), '42501', format('permission denied for table %s', t), 'service_role INSERT denied on ' || t)
  FROM unnest(ARRAY['user_consents','billing_plans','billing_markets','attribution_networks','postback_outbox','signup_attributions','funnel_events','blocks','messages']) t;
SELECT throws_ok(format('DELETE FROM public.%I WHERE false', t), '42501', format('permission denied for table %s', t), 'service_role DELETE denied on ' || t)
  FROM unnest(ARRAY['user_consents','billing_plans','billing_markets','attribution_networks','postback_outbox','signup_attributions','funnel_events','blocks','messages']) t;
SELECT throws_ok($$UPDATE public.billing_plans SET amount = amount WHERE false$$, '42501', 'permission denied for table billing_plans', 'service_role cannot reprice billing_plans');
SELECT throws_ok($$UPDATE public.billing_markets SET is_enabled = is_enabled WHERE false$$, '42501', 'permission denied for table billing_markets', 'service_role cannot flip billing_markets');
SELECT throws_ok($$UPDATE public.user_consents SET user_id = user_id WHERE false$$, '42501', 'permission denied for table user_consents', 'service_role cannot rewrite consent evidence');
SELECT throws_ok($$UPDATE public.postback_outbox SET status = status WHERE false$$, '42501', 'permission denied for table postback_outbox', 'service_role cannot touch the postback outbox');
SELECT throws_ok($$UPDATE public.funnel_events SET user_id = user_id WHERE false$$, '42501', 'permission denied for table funnel_events', 'service_role cannot rewrite funnel events');
SELECT throws_ok($$UPDATE public.signup_attributions SET user_id = user_id WHERE false$$, '42501', 'permission denied for table signup_attributions', 'service_role cannot rewrite signup attribution');
SELECT throws_ok($$UPDATE public.blocks SET blocker_id = blocker_id WHERE false$$, '42501', 'permission denied for table blocks', 'service_role cannot rewrite blocks');
SELECT throws_ok($$UPDATE public.messages SET body = body WHERE false$$, '42501', 'permission denied for table messages', 'service_role cannot edit messages');
SELECT throws_ok(format('TRUNCATE public.%I', t), '42501', format('permission denied for table %s', t), 'service_role TRUNCATE denied on ' || t)
  FROM unnest(ARRAY['user_consents','billing_plans','billing_markets','attribution_networks','postback_outbox','signup_attributions','funnel_events','blocks','messages','reports','moderation_cases','verification_requests']) t;

-- ===== append-only evidence tables: INSERT/SELECT (+ narrow workflow columns), never DELETE/TRUNCATE =====
SELECT throws_ok(format('DELETE FROM public.%I WHERE false', t), '42501', format('permission denied for table %s', t), 'service_role DELETE denied on ' || t)
  FROM unnest(ARRAY['reports','moderation_cases','verification_requests']) t;
SELECT throws_ok($$UPDATE public.reports SET reporter_id = reporter_id WHERE false$$, '42501', 'permission denied for table reports', 'reports: reporter_id is immutable for service_role');
SELECT throws_ok($$UPDATE public.reports SET legal_hold = legal_hold WHERE false$$, '42501', 'permission denied for table reports', 'reports: legal_hold is not service_role writable');
SELECT throws_ok($$UPDATE public.reports SET retention_until = retention_until WHERE false$$, '42501', 'permission denied for table reports', 'reports: retention_until is not service_role writable');
SELECT lives_ok($$UPDATE public.reports SET status = status, severity = severity WHERE id = (SELECT id FROM t_ids WHERE label='report')$$, 'reports: status/severity (workflow columns) stay writable');
SELECT throws_ok($$UPDATE public.moderation_cases SET status = status WHERE false$$, '42501', 'permission denied for table moderation_cases', 'moderation_cases: no direct UPDATE (only moderation_transition_case)');
SELECT throws_ok($$UPDATE public.verification_requests SET user_id = user_id WHERE false$$, '42501', 'permission denied for table verification_requests', 'verification_requests: user_id immutable');
SELECT lives_ok($$UPDATE public.verification_requests SET status = status, attempts = attempts WHERE false$$, 'verification_requests: workflow columns stay writable');
SELECT lives_ok($$INSERT INTO public.verification_requests (user_id) SELECT '00000000-0000-0000-0000-000000000401' WHERE false$$, 'verification_requests: INSERT stays available');
SELECT lives_ok($$INSERT INTO public.reports (reporter_id, reported_user_id, category) SELECT '00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000402','scam' WHERE false$$, 'reports: INSERT stays available');
SELECT lives_ok($$INSERT INTO public.moderation_cases (report_id) SELECT id FROM public.reports WHERE false$$, 'moderation_cases: INSERT stays available');
SELECT lives_ok($$SELECT public.moderation_transition_case(id, 'in_review', 'writer test') FROM public.moderation_cases WHERE report_id = (SELECT id FROM t_ids WHERE label='report')$$, 'moderation_cases: the definer transition RPC still works for service_role');
RESET ROLE;

-- ===== F-06 payment_events: no UPDATE at all =====
SET LOCAL ROLE service_role;
SELECT throws_ok($$UPDATE public.payment_events SET status = status WHERE false$$, '42501', 'permission denied for table payment_events', 'payment_events: no UPDATE (status)');
SELECT throws_ok($$UPDATE public.payment_events SET processed_at = processed_at WHERE false$$, '42501', 'permission denied for table payment_events', 'payment_events: no UPDATE (processed_at)');
SELECT throws_ok($$UPDATE public.payment_events SET provider_verified = provider_verified WHERE false$$, '42501', 'permission denied for table payment_events', 'payment_events: no UPDATE (provider_verified)');
RESET ROLE;

-- ===== F-04 triage: blocks/messages/profiles =====
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}';
SELECT throws_ok($$INSERT INTO public.blocks (blocker_id, blocked_id) VALUES ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000402')$$, '42501', 'permission denied for table blocks', 'authenticated cannot write blocks directly (RPC only)');
SELECT throws_ok($$INSERT INTO public.messages (conversation_id, sender_id, body) VALUES (gen_random_uuid(),'00000000-0000-0000-0000-000000000401','x')$$, '42501', 'permission denied for table messages', 'authenticated cannot write messages directly (send_message only)');
SELECT throws_ok($$DELETE FROM public.blocks WHERE false$$, '42501', 'permission denied for table blocks', 'authenticated cannot delete blocks directly');
RESET ROLE;
RESET "request.jwt.claims";

-- ===== TRUNCATE guards: ENABLE ALWAYS statement triggers stop even the table owner =====
SELECT is((SELECT count(*)::INT FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('user_consents','reports','moderation_cases','verification_requests','billing_readbacks','privacy_requests','subscriptions','entitlements') AND t.tgname = 'trg_' || c.relname || '_no_truncate' AND t.tgenabled = 'A' AND (t.tgtype & 32) = 32),
  8, 'TRUNCATE guard (ENABLE ALWAYS) present on all 8 evidence/billing tables');
SELECT throws_ok(format('TRUNCATE public.%I CASCADE', t), '42501', NULL, 'owner TRUNCATE ... CASCADE blocked by guard on ' || t)
  FROM unnest(ARRAY['user_consents','reports','moderation_cases','verification_requests','billing_readbacks','privacy_requests','subscriptions','entitlements']) t;

-- ===== NEGATIVE PROOF: re-grant temporarily; the same operations now succeed, so the 42501 assertions above are load-bearing =====
GRANT UPDATE ON public.billing_plans TO service_role;
GRANT DELETE ON public.user_consents TO service_role;
GRANT UPDATE ON public.moderation_cases TO service_role;
GRANT UPDATE (legal_hold) ON public.reports TO service_role;
GRANT UPDATE ON public.payment_events TO service_role;
GRANT INSERT ON public.billing_plans TO service_role;
SET LOCAL ROLE service_role;
SELECT lives_ok($$UPDATE public.billing_plans SET amount = amount WHERE false$$, 'NEGATIVE PROOF: with UPDATE re-granted, repricing billing_plans is no longer denied');
SELECT lives_ok($$DELETE FROM public.user_consents WHERE false$$, 'NEGATIVE PROOF: with DELETE re-granted, consent evidence deletion is no longer denied');
SELECT lives_ok($$UPDATE public.moderation_cases SET status = status WHERE false$$, 'NEGATIVE PROOF: with UPDATE re-granted, moderation_cases UPDATE is no longer denied');
SELECT lives_ok($$UPDATE public.reports SET legal_hold = legal_hold WHERE false$$, 'NEGATIVE PROOF: with the column re-granted, reports.legal_hold UPDATE is no longer denied');
SELECT lives_ok($$UPDATE public.payment_events SET status = status WHERE false$$, 'NEGATIVE PROOF: with UPDATE re-granted, payment_events UPDATE is no longer denied');
SELECT lives_ok($$INSERT INTO public.billing_plans SELECT * FROM public.billing_plans WHERE false$$, 'NEGATIVE PROOF: with INSERT re-granted, billing_plans INSERT is no longer denied');
RESET ROLE;
REVOKE UPDATE ON public.billing_plans FROM service_role;
REVOKE DELETE ON public.user_consents FROM service_role;
REVOKE UPDATE ON public.moderation_cases FROM service_role;
REVOKE UPDATE (legal_hold) ON public.reports FROM service_role;
REVOKE UPDATE ON public.payment_events FROM service_role;
REVOKE INSERT ON public.billing_plans FROM service_role;
SET LOCAL ROLE service_role;
SELECT throws_ok($$UPDATE public.billing_plans SET amount = amount WHERE false$$, '42501', 'permission denied for table billing_plans', 'after re-revoking, billing_plans UPDATE is denied again');
SELECT throws_ok($$UPDATE public.reports SET legal_hold = legal_hold WHERE false$$, '42501', 'permission denied for table reports', 'after re-revoking, reports.legal_hold UPDATE is denied again');
SELECT throws_ok($$DELETE FROM public.user_consents WHERE false$$, '42501', 'permission denied for table user_consents', 'after re-revoking, user_consents DELETE is denied again');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
