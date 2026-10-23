-- F-01 (migration 20261023000090): billing_apply_readback no longer trusts caller-supplied status/amount/currency.
-- A grant is bound to a stored, single-use, fresh, DB-checked readback record. Everything below runs AS service_role unless noted.
-- Also covers F-05/N1 database part (provider cancel queue) and the status-mapping parity with _shared/paypal.ts mapPayPalStatus.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(77);

DELETE FROM auth.users WHERE id IN ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000302');
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000301','authenticated','authenticated','f01-a@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000302','authenticated','authenticated','f01-b@example.test',now(),now());
INSERT INTO public.profiles (id, display_name, birth_date, verification_status, is_discoverable, is_suspended) VALUES
 ('00000000-0000-0000-0000-000000000301','F01 Alpha',DATE '1991-01-01','verified',TRUE,FALSE),
 ('00000000-0000-0000-0000-000000000302','F01 Bravo',DATE '1991-01-02','verified',TRUE,FALSE);
SELECT public.billing_register_pending_subscription('00000000-0000-0000-0000-000000000301','premium_monthly_ph','I-F01-1','P-F01-PH','sandbox');
SELECT public.billing_register_pending_subscription('00000000-0000-0000-0000-000000000302','premium_monthly_ph','I-F01-2','P-F01-PH','sandbox');
-- ledger rows (as the webhook records them: verified) + one UNverified row and one for a different subscription (owner inserts)
SELECT public.billing_record_event('WH-F01-ACT','BILLING.SUBSCRIPTION.ACTIVATED','I-F01-1',NULL,now());
SELECT public.billing_record_event('WH-F01-REF','PAYMENT.SALE.REFUNDED','I-F01-1',NULL,now());
SELECT public.billing_record_event('WH-F01-OTHER','BILLING.SUBSCRIPTION.ACTIVATED','I-F01-2',NULL,now());
INSERT INTO public.payment_events (provider, provider_event_id, event_type, resource_id, status, provider_verified)
VALUES ('paypal','WH-F01-UNVERIFIED','BILLING.SUBSCRIPTION.ACTIVATED','I-F01-1','received',FALSE);

-- ===== 1. catalog: shapes and privileges =====
SELECT is(to_regprocedure('public.billing_apply_readback(text,text,public.subscription_status,timestamptz,numeric,text,uuid)'), NULL, 'the old 7-argument, caller-trusting billing_apply_readback no longer exists');
SELECT ok(has_function_privilege('service_role','public.billing_apply_readback(uuid)','EXECUTE')
      AND has_function_privilege('service_role','public.billing_record_readback(text,text,text,timestamptz,numeric,text,uuid)','EXECUTE')
      AND has_function_privilege('service_role','public.billing_record_refund_readback(text,text,uuid)','EXECUTE')
      AND has_function_privilege('service_role','public.billing_list_pending_provider_cancels(text,integer)','EXECUTE')
      AND has_function_privilege('service_role','public.billing_record_provider_cancel(text,text)','EXECUTE'), 'service_role may execute the new RPCs');
SELECT ok(NOT (has_function_privilege('anon','public.billing_apply_readback(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.billing_apply_readback(uuid)','EXECUTE')
            OR has_function_privilege('anon','public.billing_record_readback(text,text,text,timestamptz,numeric,text,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.billing_record_readback(text,text,text,timestamptz,numeric,text,uuid)','EXECUTE')
            OR has_function_privilege('anon','public.billing_record_refund_readback(text,text,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.billing_record_refund_readback(text,text,uuid)','EXECUTE')
            OR has_function_privilege('anon','public.billing_list_pending_provider_cancels(text,integer)','EXECUTE') OR has_function_privilege('authenticated','public.billing_list_pending_provider_cancels(text,integer)','EXECUTE')
            OR has_function_privilege('anon','public.billing_record_provider_cancel(text,text)','EXECUTE') OR has_function_privilege('authenticated','public.billing_record_provider_cancel(text,text)','EXECUTE')), 'anon/authenticated cannot execute any of them');
SELECT ok((SELECT bool_and(p.prosecdef AND pg_get_userbyid(p.proowner) = 'postgres')
             FROM pg_proc p WHERE p.oid IN ('public.billing_apply_readback(uuid)'::regprocedure,'public.billing_record_readback(text,text,text,timestamptz,numeric,text,uuid)'::regprocedure,
               'public.billing_record_refund_readback(text,text,uuid)'::regprocedure,'public.billing_record_provider_cancel(text,text)'::regprocedure)), 'writers are SECURITY DEFINER owned by postgres');
SELECT ok(NOT (has_table_privilege('service_role','public.billing_readbacks','INSERT') OR has_table_privilege('service_role','public.billing_readbacks','UPDATE')
            OR has_table_privilege('service_role','public.billing_readbacks','DELETE') OR has_table_privilege('service_role','public.billing_readbacks','TRUNCATE')
            OR has_table_privilege('service_role','public.billing_readbacks','REFERENCES') OR has_table_privilege('service_role','public.billing_readbacks','TRIGGER'))
      AND has_table_privilege('service_role','public.billing_readbacks','SELECT'), 'billing_readbacks: service_role has SELECT only');
SELECT ok(NOT (has_table_privilege('anon','public.billing_readbacks','SELECT') OR has_table_privilege('authenticated','public.billing_readbacks','SELECT')), 'billing_readbacks: anon/authenticated have nothing');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.billing_readbacks'::regclass), 'billing_readbacks has RLS enabled (no policies: deny by default)');

-- ===== 2. the bare service_role call can no longer mint an entitlement =====
SET LOCAL ROLE service_role;
SELECT is((SELECT outcome FROM public.billing_apply_readback('11111111-1111-1111-1111-111111111111')), 'unknown_readback', 'a bare call with an invented readback id does nothing');
SELECT throws_ok($$SELECT public.billing_apply_readback('I-F01-1','P-F01-PH','active', now()+interval '20 days', 599.00, 'PHP', NULL)$$, '42883', NULL, 'the old call shape (status/amount/currency parameters) is rejected: no such function');
SELECT throws_ok($$INSERT INTO public.billing_readbacks (kind, subscription_id, provider_subscription_id, provider_plan_id, provider_status, mapped_status, period_end, last_payment_amount, last_payment_currency)
  SELECT 'subscription_read', id, provider_subscription_id, 'P-F01-PH', 'ACTIVE', 'active', now()+interval '20 days', 599.00, 'PHP' FROM public.subscriptions WHERE provider_subscription_id = 'I-F01-1'$$,
  '42501', 'permission denied for table billing_readbacks', 'service_role cannot forge a readback row directly');
SELECT throws_ok($$UPDATE public.billing_readbacks SET apply_outcome = 'granted'$$, '42501', 'permission denied for table billing_readbacks', 'service_role cannot UPDATE readbacks');
SELECT throws_ok($$DELETE FROM public.billing_readbacks$$, '42501', 'permission denied for table billing_readbacks', 'service_role cannot DELETE readbacks');
SELECT throws_ok($$TRUNCATE public.billing_readbacks$$, '42501', 'permission denied for table billing_readbacks', 'service_role cannot TRUNCATE readbacks');
SELECT throws_ok($$INSERT INTO public.entitlements (user_id, entitlement_key, status) VALUES ('00000000-0000-0000-0000-000000000301','premium','active')$$, '42501', 'permission denied for table entitlements', 'service_role still cannot write entitlements directly');

-- every forged-parameter attempt through the legitimate recorder is judged by the DATABASE against billing_plans / the ledger
CREATE TEMP TABLE t_out (label TEXT, outcome TEXT, granted BOOLEAN);
GRANT ALL ON t_out TO service_role;
INSERT INTO t_out SELECT 'garbage_status', a.outcome, a.granted FROM public.billing_apply_readback(public.billing_record_readback('I-F01-1','P-F01-PH','PWNED', now()+interval '20 days', 599.00, 'PHP', NULL)) a;
INSERT INTO t_out SELECT 'wrong_amount', a.outcome, a.granted FROM public.billing_apply_readback(public.billing_record_readback('I-F01-1','P-F01-PH','ACTIVE', now()+interval '20 days', 1.00, 'PHP', NULL)) a;
INSERT INTO t_out SELECT 'wrong_currency', a.outcome, a.granted FROM public.billing_apply_readback(public.billing_record_readback('I-F01-1','P-F01-PH','ACTIVE', now()+interval '20 days', 599.00, 'USD', NULL)) a;
INSERT INTO t_out SELECT 'fractional_amount', a.outcome, a.granted FROM public.billing_apply_readback(public.billing_record_readback('I-F01-1','P-F01-PH','ACTIVE', now()+interval '20 days', 599.001, 'PHP', NULL)) a;
INSERT INTO t_out SELECT 'no_payment', a.outcome, a.granted FROM public.billing_apply_readback(public.billing_record_readback('I-F01-1','P-F01-PH','ACTIVE', now()+interval '20 days', NULL, NULL, NULL)) a;
INSERT INTO t_out SELECT 'wrong_plan', a.outcome, a.granted FROM public.billing_apply_readback(public.billing_record_readback('I-F01-1','P-ATTACKER','ACTIVE', now()+interval '20 days', 599.00, 'PHP', NULL)) a;
INSERT INTO t_out SELECT 'past_period', a.outcome, a.granted FROM public.billing_apply_readback(public.billing_record_readback('I-F01-1','P-F01-PH','ACTIVE', now()-interval '1 day', 599.00, 'PHP', NULL)) a;
INSERT INTO t_out SELECT 'no_period', a.outcome, a.granted FROM public.billing_apply_readback(public.billing_record_readback('I-F01-1','P-F01-PH','ACTIVE', NULL, 599.00, 'PHP', NULL)) a;
INSERT INTO t_out SELECT 'lowercase_status', a.outcome, a.granted FROM public.billing_apply_readback(public.billing_record_readback('I-F01-1','P-F01-PH','active', now()+interval '20 days', 599.00, 'PHP', NULL)) a;
SELECT is((SELECT outcome FROM t_out WHERE label='garbage_status'), 'no_change', 'unknown PayPal status maps to approval_pending: no grant');
SELECT is((SELECT outcome FROM t_out WHERE label='wrong_amount'), 'settlement_mismatch', 'wrong amount never grants');
SELECT is((SELECT outcome FROM t_out WHERE label='wrong_currency'), 'settlement_mismatch', 'wrong currency never grants');
SELECT is((SELECT outcome FROM t_out WHERE label='fractional_amount'), 'settlement_mismatch', '599.001 is not 599.00 (no rounding in the comparison)');
SELECT is((SELECT outcome FROM t_out WHERE label='no_payment'), 'settlement_mismatch', 'ACTIVE without a last payment never grants');
SELECT is((SELECT outcome FROM t_out WHERE label='wrong_plan'), 'plan_mismatch', 'a different PayPal plan never grants');
SELECT is((SELECT outcome FROM t_out WHERE label='past_period'), 'settlement_mismatch', 'a past period end never grants');
SELECT is((SELECT outcome FROM t_out WHERE label='no_period'), 'settlement_mismatch', 'a missing period end never grants');
SELECT is((SELECT outcome FROM t_out WHERE label='lowercase_status'), 'no_change', 'only the exact PayPal status string ACTIVE counts');
SELECT is((SELECT count(*)::INT FROM t_out WHERE granted), 0, 'none of the forged attempts granted');
SELECT is((SELECT count(*)::INT FROM public.entitlements WHERE user_id = '00000000-0000-0000-0000-000000000301'), 0, 'no entitlement was minted by any forged attempt');
-- shape constraints on what may be recorded at all
SELECT throws_ok($$SELECT public.billing_record_readback('I-F01-1','P-F01-PH','ACTIVE', now()+interval '20 days', 599.00, NULL, NULL)$$, '23514', NULL, 'an amount without a currency is rejected');
SELECT throws_ok($$SELECT public.billing_record_readback('I-F01-1','P-F01-PH','ACTIVE', now()+interval '20 days', -1, 'PHP', NULL)$$, '23514', NULL, 'a negative amount is rejected');
SELECT throws_ok($$SELECT public.billing_record_readback('I-F01-1','P-F01-PH','ACTIVE', now()+interval '20 days', 599.00, 'php', NULL)$$, '23514', NULL, 'a non ISO-4217-shaped currency is rejected');
SELECT throws_ok($$SELECT public.billing_record_readback('I-F01-1','P-F01-PH','', now()+interval '20 days', 599.00, 'PHP', NULL)$$, '22023', 'invalid_readback', 'an empty status is rejected');
SELECT is(public.billing_record_readback('I-NOPE','P-F01-PH','ACTIVE', now()+interval '20 days', 599.00, 'PHP', NULL), NULL, 'an unknown subscription records nothing (returns NULL)');
-- the ledger row a readback cites must exist, be provider-verified and belong to the same subscription
SELECT throws_ok($$SELECT public.billing_record_readback('I-F01-1','P-F01-PH','ACTIVE', now()+interval '20 days', 599.00, 'PHP', '22222222-2222-2222-2222-222222222222')$$, '22023', 'readback_event_not_verified', 'a non-existent ledger row cannot be cited');
SELECT throws_ok($$SELECT public.billing_record_readback('I-F01-1','P-F01-PH','ACTIVE', now()+interval '20 days', 599.00, 'PHP', (SELECT id FROM public.payment_events WHERE provider_event_id='WH-F01-UNVERIFIED'))$$, '22023', 'readback_event_not_verified', 'an unverified ledger row cannot be cited');
SELECT throws_ok($$SELECT public.billing_record_readback('I-F01-1','P-F01-PH','ACTIVE', now()+interval '20 days', 599.00, 'PHP', (SELECT id FROM public.payment_events WHERE provider_event_id='WH-F01-OTHER'))$$, '22023', 'readback_event_subscription_mismatch', 'another subscription''s ledger row cannot be cited');
-- refunds: only a verified refund/reversal event can produce a revoke
SELECT throws_ok($$SELECT public.billing_record_refund_readback('I-F01-1','P-F01-PH', NULL)$$, '22023', 'refund_requires_verified_refund_event', 'a refund readback without a ledger event is rejected');
SELECT throws_ok($$SELECT public.billing_record_refund_readback('I-F01-1','P-F01-PH', (SELECT id FROM public.payment_events WHERE provider_event_id='WH-F01-ACT'))$$, '22023', 'refund_requires_verified_refund_event', 'a non-refund event cannot revoke');
SELECT throws_ok($$SELECT public.billing_record_refund_readback('I-F01-1','P-F01-PH', (SELECT id FROM public.payment_events WHERE provider_event_id='WH-F01-OTHER'))$$, '22023', 'refund_requires_verified_refund_event', 'another subscription''s non-refund event cannot revoke');
SELECT is((SELECT count(*)::INT FROM public.subscriptions WHERE provider_subscription_id = 'I-F01-1' AND status <> 'approval_pending'), 0, 'subscription untouched by rejected attempts');

-- ===== 3. the legitimate path grants; each readback is single-use =====
CREATE TEMP TABLE t_rb (label TEXT, id UUID);
GRANT ALL ON t_rb TO service_role;
INSERT INTO t_rb SELECT 'good', public.billing_record_readback('I-F01-1','P-F01-PH','ACTIVE', now()+interval '20 days', 599.00, 'PHP', (SELECT id FROM public.payment_events WHERE provider_event_id='WH-F01-ACT'));
SELECT is((SELECT outcome FROM public.billing_apply_readback((SELECT id FROM t_rb WHERE label='good'))), 'granted', 'a genuine ACTIVE readback (matching amount, currency, plan) grants');
SELECT is((SELECT status::TEXT FROM public.entitlements WHERE user_id = '00000000-0000-0000-0000-000000000301'), 'active', 'entitlement is active');
SELECT is((SELECT outcome FROM public.billing_apply_readback((SELECT id FROM t_rb WHERE label='good'))), 'readback_already_applied', 'the same readback cannot be applied twice (single use)');
SELECT is((SELECT granted FROM public.billing_apply_readback((SELECT id FROM t_rb WHERE label='good'))), FALSE, 'and a replay never reports granted');
SELECT is((SELECT apply_outcome FROM public.billing_readbacks WHERE id = (SELECT id FROM t_rb WHERE label='good')), 'granted', 'the evidence row records the outcome and is marked applied');
SELECT ok(EXISTS (SELECT 1 FROM public.audit_events WHERE action = 'billing.subscription.granted' AND metadata ->> 'readback_id' = (SELECT id::TEXT FROM t_rb WHERE label='good')), 'the audit row references the readback');

-- ===== 4. staleness and immutability (owner-side manipulation, transactional) =====
RESET ROLE;
INSERT INTO t_rb SELECT 'stale', public.billing_record_readback('I-F01-2','P-F01-PH','ACTIVE', now()+interval '20 days', 599.00, 'PHP', NULL);
ALTER TABLE public.billing_readbacks DISABLE TRIGGER trg_billing_readbacks_immutable;
UPDATE public.billing_readbacks SET recorded_at = now() - interval '16 minutes' WHERE id = (SELECT id FROM t_rb WHERE label='stale');
ALTER TABLE public.billing_readbacks ENABLE ALWAYS TRIGGER trg_billing_readbacks_immutable;
SET LOCAL ROLE service_role;
SELECT is((SELECT outcome FROM public.billing_apply_readback((SELECT id FROM t_rb WHERE label='stale'))), 'readback_stale', 'a readback older than 15 minutes is refused');
SELECT is((SELECT count(*)::INT FROM public.entitlements WHERE user_id = '00000000-0000-0000-0000-000000000302'), 0, 'and grants nothing');
RESET ROLE;
SELECT throws_ok($$UPDATE public.billing_readbacks SET mapped_status = 'cancelled' WHERE id = (SELECT id FROM t_rb WHERE label='good')$$, '42501', 'Billing readback evidence is immutable', 'even the owner cannot rewrite evidence');
SELECT throws_ok($$UPDATE public.billing_readbacks SET apply_outcome = 'x' WHERE id = (SELECT id FROM t_rb WHERE label='good')$$, '42501', 'Billing readback evidence is immutable', 'a consumed readback cannot be re-labelled');
SELECT throws_ok($$DELETE FROM public.billing_readbacks WHERE id = (SELECT id FROM t_rb WHERE label='good')$$, '42501', 'Billing readback evidence cannot be deleted', 'even the owner cannot delete evidence');
SELECT throws_ok($$TRUNCATE public.billing_readbacks$$, '42501', 'TRUNCATE is not permitted on public.billing_readbacks', 'TRUNCATE guard (ENABLE ALWAYS) blocks the owner too');
SELECT is((SELECT tgenabled::TEXT FROM pg_trigger WHERE tgname = 'trg_billing_readbacks_immutable'), 'A', 'immutability trigger is ENABLE ALWAYS');

-- ===== 5. refund revoke, terminal guard and the PayPal-side cancel queue (F-05/N1, database part) =====
SET LOCAL ROLE service_role;
INSERT INTO t_rb SELECT 'refund', public.billing_record_refund_readback('I-F01-1','P-F01-PH', (SELECT id FROM public.payment_events WHERE provider_event_id='WH-F01-REF'));
SELECT is((SELECT outcome FROM public.billing_apply_readback((SELECT id FROM t_rb WHERE label='refund'))), 'revoked', 'a verified refund event revokes');
SELECT is((SELECT status::TEXT FROM public.entitlements WHERE user_id = '00000000-0000-0000-0000-000000000301'), 'revoked', 'entitlement revoked');
SELECT is((SELECT provider_cancel_status FROM public.subscriptions WHERE provider_subscription_id='I-F01-1'), 'pending', 'the refund queues a PayPal-side cancel');
INSERT INTO t_rb SELECT 'late_active', public.billing_record_readback('I-F01-1','P-F01-PH','ACTIVE', now()+interval '20 days', 599.00, 'PHP', NULL);
SELECT is((SELECT outcome FROM public.billing_apply_readback((SELECT id FROM t_rb WHERE label='late_active'))), 'terminal_state', 'a late ACTIVE readback cannot re-grant a refunded subscription');
SELECT is((SELECT status::TEXT FROM public.entitlements WHERE user_id = '00000000-0000-0000-0000-000000000301'), 'revoked', 'premium stays revoked');
SELECT ok(EXISTS (SELECT 1 FROM public.billing_list_pending_provider_cancels('sandbox', 10) WHERE provider_subscription_id = 'I-F01-1'), 'pending cancel is listed for the reconciler');
SELECT is((SELECT count(*)::INT FROM public.billing_list_pending_provider_cancels('live', 10)), 0, 'nothing is listed for another environment');
SELECT is(public.billing_record_provider_cancel('I-F01-1','failed'), 'pending', 'a failed attempt stays pending');
SELECT is((SELECT provider_cancel_attempts FROM public.subscriptions WHERE provider_subscription_id='I-F01-1'), 1, 'and counts the attempt');
SELECT is((SELECT count(*)::INT FROM public.billing_list_pending_provider_cancels('sandbox', 10) WHERE provider_subscription_id = 'I-F01-1'), 0, 'a just-failed row backs off for 5 minutes');
SELECT is(public.billing_record_provider_cancel('I-F01-1','done'), 'done', 'success marks done');
SELECT is(public.billing_record_provider_cancel('I-F01-1','done'), 'done', 'recording done again is idempotent');
SELECT is(public.billing_record_provider_cancel('I-F01-1','failed'), 'done', 'a late failure cannot reopen a done cancel');
SELECT is(public.billing_record_provider_cancel('I-F01-2','done'), 'ignored', 'a subscription that is not refunded/revoked is ignored');
SELECT throws_ok($$SELECT public.billing_record_provider_cancel('I-F01-1','maybe')$$, '22023', 'invalid_cancel_result', 'only done/failed are accepted');
SELECT is((SELECT provider_cancel_status FROM public.subscriptions WHERE provider_subscription_id='I-F01-1'), 'done', 'final state is done');
SELECT throws_ok($$UPDATE public.subscriptions SET provider_cancel_status = 'done'$$, '42501', 'permission denied for table subscriptions', 'service_role still cannot write subscriptions directly');
RESET ROLE;

-- ===== 6. status mapping parity with supabase/functions/_shared/paypal.ts mapPayPalStatus =====
SELECT is((SELECT string_agg(s || '=' || private.billing_map_paypal_status(s)::TEXT, ',' ORDER BY s COLLATE "C") FROM unnest(ARRAY['ACTIVE','SUSPENDED','CANCELLED','EXPIRED','APPROVED','APPROVAL_PENDING','WHATEVER','active']) s),
  'ACTIVE=active,APPROVAL_PENDING=approval_pending,APPROVED=approval_pending,CANCELLED=cancelled,EXPIRED=expired,SUSPENDED=suspended,WHATEVER=approval_pending,active=approval_pending', 'DB status mapping equals mapPayPalStatus (unknown fails closed)');

-- ===== 7. clients cannot reach any of it =====
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}';
SELECT throws_ok($$SELECT public.billing_record_readback('I-F01-2','P-F01-PH','ACTIVE', now()+interval '20 days', 599.00, 'PHP', NULL)$$, '42501', NULL, 'authenticated cannot record a readback');
SELECT throws_ok($$SELECT public.billing_apply_readback('11111111-1111-1111-1111-111111111111')$$, '42501', NULL, 'authenticated cannot apply a readback');
SELECT throws_ok($$SELECT count(*) FROM public.billing_readbacks$$, '42501', 'permission denied for table billing_readbacks', 'authenticated cannot read readbacks');
RESET ROLE;
RESET "request.jwt.claims";
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.billing_apply_readback('11111111-1111-1111-1111-111111111111')$$, '42501', NULL, 'anon cannot apply a readback');
RESET ROLE;

-- ===== 8. negative proof: the privilege revocation is what blocks forging (re-grant temporarily, forged grant would succeed) =====
GRANT INSERT ON public.billing_readbacks TO service_role;
SET LOCAL ROLE service_role;
SELECT lives_ok($$INSERT INTO public.billing_readbacks (kind, subscription_id, provider_subscription_id, provider_plan_id, provider_status, mapped_status, period_end, last_payment_amount, last_payment_currency)
  SELECT 'subscription_read', id, provider_subscription_id, 'P-F01-PH', 'ACTIVE', 'active', now()+interval '20 days', 599.00, 'PHP' FROM public.subscriptions WHERE provider_subscription_id = 'I-F01-2'$$,
  'NEGATIVE PROOF: with INSERT re-granted the direct forgery succeeds, so the 42501 assertion above really depends on the revocation');
RESET ROLE;
REVOKE INSERT ON public.billing_readbacks FROM service_role;
SET LOCAL ROLE service_role;
SELECT throws_ok($$INSERT INTO public.billing_readbacks (kind, subscription_id, provider_subscription_id, mapped_status) SELECT 'subscription_read', id, provider_subscription_id, 'active' FROM public.subscriptions LIMIT 1$$,
  '42501', 'permission denied for table billing_readbacks', 'after re-revoking, the forgery is denied again');
RESET ROLE;

-- ===== 9. account deletion keeps working with readbacks present =====
SELECT lives_ok($$DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000302'$$, 'auth user deletion succeeds (readbacks reference subscriptions, which are anonymised not deleted)');
SELECT ok(EXISTS (SELECT 1 FROM public.billing_readbacks r JOIN public.subscriptions s ON s.id = r.subscription_id WHERE s.provider_subscription_id = 'I-F01-2' AND s.user_id IS NULL), 'readback evidence survives account deletion');
SELECT is(public.billing_record_readback('I-F01-2','P-F01-PH','ACTIVE', now()+interval '20 days', 599.00, 'PHP', NULL), NULL, 'a deleted user''s subscription can no longer be granted (record returns NULL)');

SELECT * FROM finish();
ROLLBACK;
