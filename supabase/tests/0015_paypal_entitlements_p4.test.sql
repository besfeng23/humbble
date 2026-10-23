BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
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
SELECT ok(NOT has_function_privilege('authenticated','public.billing_apply_readback(text,text,public.subscription_status,timestamptz,numeric,text,uuid)','EXECUTE'), 'clients cannot apply readback');
SELECT ok(NOT has_function_privilege('authenticated','public.billing_record_event(text,text,text,text,timestamptz)','EXECUTE'), 'clients cannot record events');
SELECT ok(NOT has_function_privilege('anon','public.billing_register_pending_subscription(uuid,text,text,text,text)','EXECUTE'), 'anon cannot register subscriptions');
SELECT ok(has_function_privilege('service_role','public.billing_apply_readback(text,text,public.subscription_status,timestamptz,numeric,text,uuid)','EXECUTE'), 'service_role may apply readback');
SELECT ok(NOT has_function_privilege('anon','public.get_liked_you()','EXECUTE'), 'anon cannot call liked-you');
SELECT throws_ok($$INSERT INTO public.subscriptions (user_id, provider, provider_subscription_id, provider_plan_id, environment) VALUES ('00000000-0000-0000-0000-000000000151','paypal','I-LIVE','P-1','live')$$, '23514', NULL, 'live environment rows are rejected');

-- Service-role reconciliation
SELECT lives_ok($$SELECT public.billing_register_pending_subscription('00000000-0000-0000-0000-000000000151','premium_monthly_ph','I-P4TEST','P-SANDBOX-PH','sandbox')$$, 'pending subscription registered');
SELECT is((SELECT outcome FROM public.billing_apply_readback('I-P4TEST','P-SANDBOX-PH','approval_pending',NULL,NULL,NULL)), 'no_change', 'approval pending grants nothing');
SELECT is((SELECT outcome FROM public.billing_apply_readback('I-P4TEST','P-SANDBOX-PH','active',now()+interval '30 days',29.99,'USD')), 'settlement_mismatch', 'wrong currency/amount never grants');
SELECT is((SELECT outcome FROM public.billing_apply_readback('I-P4TEST','P-OTHER','active',now()+interval '30 days',599.00,'PHP')), 'plan_mismatch', 'plan id mismatch never grants');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.entitlements WHERE user_id='00000000-0000-0000-0000-000000000151'), 'no entitlement before verified ACTIVE settlement');
SELECT is((SELECT outcome FROM public.billing_apply_readback('I-P4TEST','P-SANDBOX-PH','active',now()+interval '30 days',599.00,'PHP')), 'granted', 'verified ACTIVE readback grants');
SELECT lives_ok($$SELECT public.billing_apply_readback('I-P4TEST','P-SANDBOX-PH','active',now()+interval '30 days',599.00,'PHP')$$, 'replayed readback is idempotent');
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
