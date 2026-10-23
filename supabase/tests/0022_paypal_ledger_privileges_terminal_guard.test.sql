-- PR #35 review fixes: F1 (ledger privileges, asserted AS service_role) and F3 (terminal-state guard).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;

-- Test helper: drives the REAL two-step flow (billing_record_event / billing_record_readback / billing_record_refund_readback ->
-- billing_apply_readback(uuid)) with the old call shape, so the legacy scenarios below keep covering it. SECURITY INVOKER: runs as the caller.
CREATE OR REPLACE FUNCTION public.t_apply_readback(p_sub TEXT, p_plan TEXT, p_status TEXT, p_period TIMESTAMPTZ, p_amount NUMERIC, p_cur TEXT, p_event UUID DEFAULT NULL)
RETURNS TABLE (subscription_id UUID, granted BOOLEAN, outcome TEXT) LANGUAGE plpgsql AS $f$
DECLARE v_id UUID; v_ev UUID;
BEGIN
  IF p_status = 'revoked' THEN RAISE EXCEPTION 'revoked_cannot_be_produced_by_a_readback'; END IF;
  IF p_status = 'refunded' THEN
    SELECT e.event_id INTO v_ev FROM public.billing_record_event('T-RF-' || pg_catalog.gen_random_uuid()::TEXT, 'PAYMENT.SALE.REFUNDED', p_sub, NULL, now()) e;
    v_id := public.billing_record_refund_readback(p_sub, p_plan, v_ev);
  ELSE
    v_id := public.billing_record_readback(p_sub, p_plan,
      CASE p_status WHEN 'active' THEN 'ACTIVE' WHEN 'suspended' THEN 'SUSPENDED' WHEN 'cancelled' THEN 'CANCELLED' WHEN 'expired' THEN 'EXPIRED' ELSE 'APPROVAL_PENDING' END,
      p_period, p_amount, p_cur, p_event);
  END IF;
  IF v_id IS NULL THEN RETURN QUERY SELECT NULL::UUID, FALSE, 'unknown_subscription'::TEXT; RETURN; END IF;
  RETURN QUERY SELECT a.subscription_id, a.granted, a.outcome FROM public.billing_apply_readback(v_id) a;
END;
$f$;
SELECT plan(54);

DELETE FROM auth.users WHERE id IN ('00000000-0000-0000-0000-000000000181','00000000-0000-0000-0000-000000000182');
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000181','authenticated','authenticated','p4rev-a@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000182','authenticated','authenticated','p4rev-b@example.test',now(),now());
INSERT INTO public.profiles (id, display_name, birth_date, verification_status, is_discoverable, is_suspended) VALUES
 ('00000000-0000-0000-0000-000000000181','Rev Alpha',DATE '1991-01-01','verified',TRUE,FALSE),
 ('00000000-0000-0000-0000-000000000182','Rev Bravo',DATE '1991-01-02','verified',TRUE,FALSE);
SELECT public.billing_register_pending_subscription('00000000-0000-0000-0000-000000000181','premium_monthly_ph','I-REV-1','P-REV-PH','sandbox');
SELECT public.billing_record_event('WH-REV-SEED','PAYMENT.SALE.COMPLETED','I-REV-1',NULL,now());

-- ===== F1: catalog privileges on public.payment_events =====
SELECT ok(NOT has_table_privilege('service_role','public.payment_events','DELETE'),     'service_role has no DELETE');
SELECT ok(NOT has_table_privilege('service_role','public.payment_events','TRUNCATE'),   'service_role has no TRUNCATE');
SELECT ok(NOT has_table_privilege('service_role','public.payment_events','UPDATE'),     'service_role has no table-level UPDATE');
SELECT ok(NOT has_table_privilege('service_role','public.payment_events','REFERENCES'), 'service_role has no REFERENCES');
SELECT ok(NOT has_table_privilege('service_role','public.payment_events','TRIGGER'),    'service_role has no TRIGGER');
SELECT ok(has_table_privilege('service_role','public.payment_events','SELECT') AND has_table_privilege('service_role','public.payment_events','INSERT'), 'service_role keeps SELECT and INSERT');
-- F-06 (migration 20261023000090): every payment_events UPDATE runs inside owner-owned SECURITY DEFINER functions, so no column is updatable
SELECT is((SELECT count(*)::INT FROM information_schema.column_privileges WHERE grantee='service_role' AND table_schema='public' AND table_name='payment_events' AND privilege_type='UPDATE'), 0, 'service_role has NO column-level UPDATE on payment_events');
SELECT ok(NOT has_column_privilege('service_role','public.payment_events','provider_event_id','UPDATE')
          AND NOT has_column_privilege('service_role','public.payment_events','amount','UPDATE')
          AND NOT has_column_privilege('service_role','public.payment_events','resource_id','UPDATE')
          AND NOT has_column_privilege('service_role','public.payment_events','received_at','UPDATE'), 'provider-fact columns are not updatable by service_role');
SELECT ok(NOT (has_table_privilege('anon','public.payment_events','SELECT') OR has_table_privilege('anon','public.payment_events','INSERT')
            OR has_table_privilege('anon','public.payment_events','UPDATE') OR has_table_privilege('anon','public.payment_events','DELETE')
            OR has_table_privilege('anon','public.payment_events','TRUNCATE')), 'anon has no privileges');
SELECT ok(NOT (has_table_privilege('authenticated','public.payment_events','SELECT') OR has_table_privilege('authenticated','public.payment_events','INSERT')
            OR has_table_privilege('authenticated','public.payment_events','UPDATE') OR has_table_privilege('authenticated','public.payment_events','DELETE')
            OR has_table_privilege('authenticated','public.payment_events','TRUNCATE')), 'authenticated has no privileges');
SELECT is((SELECT count(*)::INT FROM pg_catalog.pg_class c, LATERAL pg_catalog.aclexplode(c.relacl) a
            WHERE c.oid = 'public.payment_events'::regclass AND a.grantee = 0), 0, 'no PUBLIC ACL entry on payment_events');

-- ===== F1: behaviour AS service_role (permission errors, not the trigger) =====
SET LOCAL ROLE service_role;
SELECT throws_ok($$DELETE FROM public.payment_events WHERE provider_event_id = 'WH-REV-SEED'$$, '42501', 'permission denied for table payment_events', 'service_role DELETE fails with a permission error');
SELECT throws_ok($$DELETE FROM public.payment_events$$, '42501', 'permission denied for table payment_events', 'service_role bulk DELETE fails with a permission error');
SELECT throws_ok($$TRUNCATE public.payment_events$$, '42501', 'permission denied for table payment_events', 'service_role TRUNCATE fails with a permission error');
SELECT throws_ok($$UPDATE public.payment_events SET provider_event_id = 'WH-X' WHERE provider_event_id = 'WH-REV-SEED'$$, '42501', 'permission denied for table payment_events', 'rewriting provider_event_id is a permission error');
SELECT throws_ok($$UPDATE public.payment_events SET resource_id = 'I-OTHER' WHERE provider_event_id = 'WH-REV-SEED'$$, '42501', 'permission denied for table payment_events', 'rewriting resource_id is a permission error');
SELECT throws_ok($$UPDATE public.payment_events SET amount = 1.00, currency = 'PHP' WHERE provider_event_id = 'WH-REV-SEED'$$, '42501', 'permission denied for table payment_events', 'rewriting amount/currency is a permission error');
SELECT throws_ok($$UPDATE public.payment_events SET status = 'processing', received_at = now() WHERE provider_event_id = 'WH-REV-SEED'$$, '42501', 'permission denied for table payment_events', 'mixing an allowed column with a forbidden one is a permission error');
SELECT is((SELECT count(*)::INT FROM public.payment_events WHERE provider_event_id = 'WH-REV-SEED' AND resource_id = 'I-REV-1' AND status = 'verified'), 1, 'ledger row untouched by the failed statements');
-- legitimate paths still work as service_role
SELECT lives_ok($$SELECT * FROM public.billing_record_event('WH-REV-NEW','BILLING.SUBSCRIPTION.ACTIVATED','I-REV-1',NULL,now())$$, 'insert through billing_record_event works');
SELECT lives_ok($$SELECT public.billing_finish_event((SELECT id FROM public.payment_events WHERE provider_event_id='WH-REV-NEW'), 'quarantined')$$, 'status update through billing_finish_event works');
SELECT lives_ok($$SELECT public.billing_flag_unresolved_event((SELECT id FROM public.payment_events WHERE provider_event_id='WH-REV-NEW'), 'test')$$, 'billing_flag_unresolved_event works');
SELECT lives_ok($$SELECT public.billing_finish_event((SELECT id FROM public.payment_events WHERE provider_event_id='WH-REV-NEW'), 'processed')$$, 'quarantined event heals through billing_finish_event');
SELECT is((SELECT status::TEXT FROM public.payment_events WHERE provider_event_id='WH-REV-NEW'), 'processed', 'ledger row is processed');
SELECT throws_ok($$UPDATE public.payment_events SET legal_hold = TRUE WHERE provider_event_id = 'WH-REV-SEED'$$, '42501', 'permission denied for table payment_events', 'legal_hold is no longer directly updatable (F-06)');
SELECT throws_ok($$UPDATE public.payment_events SET provider_verified = TRUE WHERE provider_event_id = 'WH-REV-SEED'$$, '42501', 'permission denied for table payment_events', 'provider_verified is no longer directly updatable (F-06)');
SELECT lives_ok($$SELECT count(*) FROM public.payment_events$$, 'SELECT still allowed');
SELECT lives_ok($$SELECT count(*) FROM public.billing_list_reprocessable_events(10)$$, 'reconciler candidate query works as service_role');
RESET ROLE;

-- ===== F3: terminal-state guard =====
SET LOCAL ROLE service_role;
SELECT is((SELECT outcome FROM public.t_apply_readback('I-REV-1','P-REV-PH','active', now()+interval '20 days', 599.00, 'PHP', NULL)), 'granted', 'ACTIVE readback with matching payment grants');
RESET ROLE;
SELECT is((SELECT status::TEXT FROM public.entitlements WHERE user_id='00000000-0000-0000-0000-000000000181'), 'active', 'premium is active');

-- a stale quarantined ACTIVATED event that predates the refund
INSERT INTO public.payment_events (provider, provider_event_id, event_type, resource_id, status, provider_verified, received_at)
VALUES ('paypal','WH-REV-STALE','BILLING.SUBSCRIPTION.ACTIVATED','I-REV-1','quarantined',TRUE, now() - interval '5 hours');

SET LOCAL ROLE service_role;
SELECT is((SELECT outcome FROM public.t_apply_readback('I-REV-1','P-REV-PH','refunded', NULL, NULL, NULL, NULL)), 'revoked', 'refund revokes');
RESET ROLE;
SELECT is((SELECT status::TEXT FROM public.subscriptions WHERE provider_subscription_id='I-REV-1'), 'refunded', 'subscription is refunded');
SELECT is((SELECT status::TEXT FROM public.entitlements WHERE user_id='00000000-0000-0000-0000-000000000181'), 'revoked', 'entitlement revoked');

-- the reconciler must not even pick up the stale event or the refunded subscription
SELECT is((SELECT count(*)::INT FROM public.billing_list_reprocessable_events(50) WHERE provider_event_id = 'WH-REV-STALE'), 0, 'stale quarantined ACTIVATED event for a refunded subscription is not reprocessed');
SELECT is((SELECT count(*)::INT FROM public.billing_list_reconcile_subscriptions('sandbox', 50) WHERE provider_subscription_id = 'I-REV-1'), 0, 'refunded subscription is not a reconcile candidate');
INSERT INTO public.payment_events (provider, provider_event_id, event_type, resource_id, status, provider_verified, received_at)
VALUES ('paypal','WH-REV-REFQ','PAYMENT.SALE.REFUNDED','I-REV-1','quarantined',TRUE, now() - interval '1 hour');
SELECT is((SELECT count(*)::INT FROM public.billing_list_reprocessable_events(50) WHERE provider_event_id = 'WH-REV-REFQ'), 1, 'a quarantined refund event for the same subscription is still retried');

-- even if the stale event IS applied (webhook redelivery), the apply path refuses
SET LOCAL ROLE service_role;
-- F-01: the referenced ledger row must exist and be provider-verified; a fabricated event id is refused (the old function accepted any uuid)
SELECT throws_ok($$SELECT * FROM public.t_apply_readback('I-REV-1','P-REV-PH','active', now()+interval '20 days', 599.00, 'PHP', '00000000-0000-0000-0000-0000000000ff')$$, '22023', 'readback_event_not_verified', 'a readback cannot cite a ledger row that does not exist');
INSERT INTO public.payment_events (id, provider, provider_event_id, event_type, resource_id, status, provider_verified)
VALUES ('00000000-0000-0000-0000-0000000000a1','paypal','WH-REV-STALE-A1','BILLING.SUBSCRIPTION.ACTIVATED','I-REV-1','verified',TRUE);
SELECT is((SELECT outcome FROM public.t_apply_readback('I-REV-1','P-REV-PH','active', now()+interval '20 days', 599.00, 'PHP', '00000000-0000-0000-0000-0000000000a1')), 'terminal_state', 'stale ACTIVE readback after refund is ignored');
SELECT is((SELECT granted FROM public.t_apply_readback('I-REV-1','P-REV-PH','active', now()+interval '20 days', 599.00, 'PHP', '00000000-0000-0000-0000-0000000000a1')), FALSE, 'and never reports granted');
SELECT is((SELECT outcome FROM public.t_apply_readback('I-REV-1','P-REV-PH','cancelled', now()+interval '20 days', NULL, NULL, NULL)), 'terminal_state', 'a cancelled readback cannot move a refunded subscription either');
SELECT is((SELECT outcome FROM public.t_apply_readback('I-REV-1','P-REV-PH','suspended', NULL, NULL, NULL, NULL)), 'terminal_state', 'nor can suspended');
SELECT is((SELECT outcome FROM public.t_apply_readback('I-REV-1','P-REV-PH','approval_pending', NULL, NULL, NULL, NULL)), 'terminal_state', 'nor can approval_pending');
SELECT is((SELECT outcome FROM public.t_apply_readback('I-REV-1','P-REV-PH','refunded', NULL, NULL, NULL, NULL)), 'revoked', 'a repeated refund is an idempotent revoke');
SELECT throws_ok($$SELECT * FROM public.t_apply_readback('I-REV-1','P-REV-PH','revoked', NULL, NULL, NULL, NULL)$$, 'P0001', 'revoked_cannot_be_produced_by_a_readback', 'revoked cannot be forged through a readback (only a verified refund event produces a terminal state)');
RESET ROLE;
SELECT is((SELECT status::TEXT FROM public.subscriptions WHERE provider_subscription_id='I-REV-1'), 'refunded', 'subscription stays terminal');
SELECT is((SELECT count(*)::INT FROM public.entitlements WHERE user_id='00000000-0000-0000-0000-000000000181' AND status='active'), 0, 'no active entitlement was re-created');
SELECT is((SELECT count(*)::INT FROM public.audit_events WHERE action='billing.subscription.terminal_state_ignored' AND metadata ->> 'event_id' = '00000000-0000-0000-0000-0000000000a1'), 1, 'exactly one audit row per ignored event, however often it is retried');

-- unknown/plan-mismatch behaviour of the apply path is unchanged
SET LOCAL ROLE service_role;
SELECT is((SELECT outcome FROM public.t_apply_readback('I-NOPE','P-REV-PH','active', now()+interval '20 days', 599.00, 'PHP', NULL)), 'unknown_subscription', 'unknown subscription unchanged');
RESET ROLE;

-- legitimate flows are unaffected: suspended -> active regrants; a NEW subscription after a refund grants
SELECT public.billing_register_pending_subscription('00000000-0000-0000-0000-000000000182','premium_monthly_ph','I-REV-3','P-REV-PH','sandbox');
SET LOCAL ROLE service_role;
SELECT is((SELECT outcome FROM public.t_apply_readback('I-REV-3','P-REV-PH','suspended', NULL, NULL, NULL, NULL)), 'revoked', 'suspend (non-terminal) is applied');
SELECT is((SELECT outcome FROM public.t_apply_readback('I-REV-3','P-REV-PH','active', now()+interval '20 days', 599.00, 'PHP', NULL)), 'granted', 'suspended -> active still re-grants');
RESET ROLE;
SELECT public.billing_register_pending_subscription('00000000-0000-0000-0000-000000000181','premium_monthly_ph','I-REV-2','P-REV-PH','sandbox');
SET LOCAL ROLE service_role;
SELECT is((SELECT outcome FROM public.t_apply_readback('I-REV-2','P-REV-PH','active', now()+interval '20 days', 599.00, 'PHP', NULL)), 'granted', 'a new subscription after a refund grants normally');
RESET ROLE;
SELECT is((SELECT status::TEXT FROM public.entitlements WHERE user_id='00000000-0000-0000-0000-000000000181'), 'active', 're-subscription restores premium');

-- ACLs of the replaced functions are unchanged: service_role only
SELECT ok(has_function_privilege('service_role','public.billing_apply_readback(uuid)','EXECUTE')
          AND NOT has_function_privilege('anon','public.billing_apply_readback(uuid)','EXECUTE')
          AND NOT has_function_privilege('authenticated','public.billing_apply_readback(uuid)','EXECUTE'), 'billing_apply_readback is service_role only');
SELECT ok(NOT has_function_privilege('authenticated','public.billing_list_reprocessable_events(integer)','EXECUTE')
          AND NOT has_function_privilege('authenticated','public.billing_list_reconcile_subscriptions(text,integer)','EXECUTE')
          AND has_function_privilege('service_role','public.billing_list_reprocessable_events(integer)','EXECUTE'), 'candidate queries are service_role only');

SELECT * FROM finish();
ROLLBACK;
