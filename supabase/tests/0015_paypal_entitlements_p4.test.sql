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
SELECT plan(27);

DELETE FROM auth.users WHERE id IN ('00000000-0000-0000-0000-000000000151','00000000-0000-0000-0000-000000000152','00000000-0000-0000-0000-000000000153');
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000151','authenticated','authenticated','p4a@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000152','authenticated','authenticated','p4b@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000153','authenticated','authenticated','p4c@example.test',now(),now());
INSERT INTO public.profiles (id, display_name, birth_date, verification_status, is_discoverable, is_suspended) VALUES
 ('00000000-0000-0000-0000-000000000151','P4 Alpha',DATE '1991-01-01','verified',TRUE,FALSE),
 ('00000000-0000-0000-0000-000000000152','P4 Bravo',DATE '1991-01-02','verified',TRUE,FALSE),
 ('00000000-0000-0000-0000-000000000153','P4 Charlie',DATE '1991-01-03','verified',TRUE,FALSE);
INSERT INTO public.swipes (actor_id, target_id, direction) VALUES
 ('00000000-0000-0000-0000-000000000152','00000000-0000-0000-0000-000000000151','like'),
 ('00000000-0000-0000-0000-000000000153','00000000-0000-0000-0000-000000000151','like');

-- Catalogue
SELECT is((SELECT amount FROM public.billing_plans WHERE market='PH'), 599.00::NUMERIC, 'PH plan is PHP 599.00');
SELECT is((SELECT currency FROM public.billing_plans WHERE market='PH'), 'PHP', 'PH plan currency PHP');
SELECT is((SELECT amount FROM public.billing_plans WHERE market='US'), 29.99::NUMERIC, 'US plan is USD 29.99');

-- Grants: clients never write billing state
SELECT ok(NOT has_table_privilege('authenticated','public.billing_plans','INSERT,UPDATE,DELETE'), 'clients cannot change prices');
SELECT ok(NOT has_table_privilege('anon','public.billing_plans','SELECT'), 'anon cannot read catalogue');
SELECT ok(NOT has_table_privilege('authenticated','public.subscriptions','INSERT,UPDATE,DELETE'), 'clients cannot write subscriptions');
SELECT ok(NOT has_table_privilege('authenticated','public.entitlements','INSERT,UPDATE,DELETE'), 'clients cannot write entitlements');
SELECT ok(NOT has_table_privilege('authenticated','public.payment_events','SELECT,INSERT,UPDATE,DELETE'), 'clients cannot touch payment ledger');
SELECT ok(NOT has_function_privilege('authenticated','public.billing_apply_readback(uuid)','EXECUTE'), 'clients cannot apply readback');
SELECT ok(NOT has_function_privilege('authenticated','public.billing_record_event(text,text,text,text,timestamptz)','EXECUTE'), 'clients cannot record events');
SELECT ok(NOT has_function_privilege('anon','public.billing_register_pending_subscription(uuid,text,text,text,text)','EXECUTE'), 'anon cannot register subscriptions');
SELECT ok(has_function_privilege('service_role','public.billing_apply_readback(uuid)','EXECUTE'), 'service_role may apply readback');
SELECT ok(NOT has_function_privilege('anon','public.get_liked_you()','EXECUTE'), 'anon cannot call liked-you');
SELECT throws_ok($$INSERT INTO public.subscriptions (user_id, provider, provider_subscription_id, provider_plan_id, environment) VALUES ('00000000-0000-0000-0000-000000000151','paypal','I-LIVE','P-1','live')$$, '23514', NULL, 'live environment rows are rejected');

-- Service-role reconciliation
SELECT lives_ok($$SELECT public.billing_register_pending_subscription('00000000-0000-0000-0000-000000000151','premium_monthly_ph','I-P4TEST','P-SANDBOX-PH','sandbox')$$, 'pending subscription registered');
SELECT is((SELECT outcome FROM public.t_apply_readback('I-P4TEST','P-SANDBOX-PH','approval_pending',NULL,NULL,NULL)), 'no_change', 'approval pending grants nothing');
SELECT is((SELECT outcome FROM public.t_apply_readback('I-P4TEST','P-SANDBOX-PH','active',now()+interval '30 days',29.99,'USD')), 'settlement_mismatch', 'wrong currency/amount never grants');
SELECT is((SELECT outcome FROM public.t_apply_readback('I-P4TEST','P-OTHER','active',now()+interval '30 days',599.00,'PHP')), 'plan_mismatch', 'plan id mismatch never grants');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.entitlements WHERE user_id='00000000-0000-0000-0000-000000000151'), 'no entitlement before verified ACTIVE settlement');
SELECT is((SELECT outcome FROM public.t_apply_readback('I-P4TEST','P-SANDBOX-PH','active',now()+interval '30 days',599.00,'PHP')), 'granted', 'verified ACTIVE readback grants');
SELECT lives_ok($$SELECT public.t_apply_readback('I-P4TEST','P-SANDBOX-PH','active',now()+interval '30 days',599.00,'PHP')$$, 'replayed readback is idempotent');
SELECT is((SELECT count(*)::INT FROM public.entitlements WHERE user_id='00000000-0000-0000-0000-000000000151'), 1, 'exactly one entitlement row');

-- Idempotent ledger
SELECT is((SELECT is_new FROM public.billing_record_event('WH-P4-1','BILLING.SUBSCRIPTION.ACTIVATED','I-P4TEST',NULL,now())), TRUE, 'first event is new');
SELECT is((SELECT is_new FROM public.billing_record_event('WH-P4-1','BILLING.SUBSCRIPTION.ACTIVATED','I-P4TEST',NULL,now())), FALSE, 'duplicate event id is detected');

-- Client view: own rows only, premium-gated liked-you
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000152","role":"authenticated"}', TRUE);
SELECT throws_ok($$SELECT * FROM public.get_liked_you()$$, '42501', 'premium_required', 'free user cannot list liked-you');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000151","role":"authenticated"}', TRUE);
SELECT is((SELECT count(*)::INT FROM public.get_liked_you()), 2, 'premium user sees incoming likes');
SELECT is((SELECT is_premium FROM public.get_my_premium_status()), TRUE, 'premium status reflects entitlement');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
