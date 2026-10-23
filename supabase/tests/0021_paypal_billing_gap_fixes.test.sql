BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(45);

DELETE FROM auth.users WHERE id IN ('00000000-0000-0000-0000-000000000171','00000000-0000-0000-0000-000000000172','00000000-0000-0000-0000-000000000173');
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000171','authenticated','authenticated','p4fix-a@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000172','authenticated','authenticated','p4fix-b@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000173','authenticated','authenticated','p4fix-c@example.test',now(),now());
INSERT INTO public.profiles (id, display_name, birth_date, verification_status, is_discoverable, is_suspended) VALUES
 ('00000000-0000-0000-0000-000000000171','Fix Alpha',DATE '1991-01-01','verified',TRUE,FALSE),
 ('00000000-0000-0000-0000-000000000172','Fix Bravo',DATE '1991-01-02','verified',TRUE,FALSE),
 ('00000000-0000-0000-0000-000000000173','Fix Charlie',DATE '1991-01-03','verified',TRUE,FALSE);

-- G4: environment is explicit and recorded; live is refused by the RPC (and by the CHECK).
SELECT hasnt_function('public', 'billing_register_pending_subscription', ARRAY['uuid','text','text','text'], 'environment-less 4-arg registration is gone');
SELECT lives_ok($$SELECT public.billing_register_pending_subscription('00000000-0000-0000-0000-000000000171','premium_monthly_ph','I-FIX-1','P-FIX-PH','sandbox')$$, 'sandbox registration works');
SELECT is((SELECT environment FROM public.subscriptions WHERE provider_subscription_id = 'I-FIX-1'), 'sandbox', 'environment recorded from the argument');
SELECT throws_ok($$SELECT public.billing_register_pending_subscription('00000000-0000-0000-0000-000000000171','premium_monthly_ph','I-FIX-LIVE','P-FIX-PH','live')$$, '42501', 'live_environment_refused', 'live registration refused');
SELECT throws_ok($$SELECT public.billing_register_pending_subscription('00000000-0000-0000-0000-000000000171','premium_monthly_ph','I-FIX-NULL','P-FIX-PH',NULL)$$, '22023', 'invalid_environment', 'missing environment refused');
SELECT throws_ok($$SELECT public.billing_register_pending_subscription('00000000-0000-0000-0000-000000000171','premium_monthly_ph','I-FIX-JUNK','P-FIX-PH','staging')$$, '22023', 'invalid_environment', 'unknown environment refused');
SELECT is((SELECT count(*)::INT FROM public.subscriptions WHERE provider_subscription_id IN ('I-FIX-LIVE','I-FIX-NULL','I-FIX-JUNK')), 0, 'no row was stored for refused environments');

-- Grants: all new/changed functions are service_role only.
SELECT ok(NOT has_function_privilege('anon','public.billing_register_pending_subscription(uuid,text,text,text,text)','EXECUTE'), 'anon cannot register (5-arg)');
SELECT ok(NOT has_function_privilege('authenticated','public.billing_register_pending_subscription(uuid,text,text,text,text)','EXECUTE'), 'authenticated cannot register (5-arg)');
SELECT ok(NOT has_function_privilege('anon','public.billing_flag_unresolved_event(uuid,text)','EXECUTE'), 'anon cannot flag events');
SELECT ok(NOT has_function_privilege('authenticated','public.billing_flag_unresolved_event(uuid,text)','EXECUTE'), 'authenticated cannot flag events');
SELECT ok(NOT has_function_privilege('anon','public.billing_list_reconcile_subscriptions(text,integer)','EXECUTE'), 'anon cannot list reconcile candidates');
SELECT ok(NOT has_function_privilege('authenticated','public.billing_list_reconcile_subscriptions(text,integer)','EXECUTE'), 'authenticated cannot list reconcile candidates');
SELECT ok(NOT has_function_privilege('anon','public.billing_list_reprocessable_events(integer)','EXECUTE'), 'anon cannot list reprocessable events');
SELECT ok(NOT has_function_privilege('authenticated','public.billing_list_reprocessable_events(integer)','EXECUTE'), 'authenticated cannot list reprocessable events');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
   WHERE p.oid = ANY (ARRAY[
     'public.billing_register_pending_subscription(uuid,text,text,text,text)'::regprocedure,
     'public.billing_finish_event(uuid,public.payment_event_status)'::regprocedure,
     'public.billing_flag_unresolved_event(uuid,text)'::regprocedure,
     'public.billing_list_reconcile_subscriptions(text,integer)'::regprocedure,
     'public.billing_list_reprocessable_events(integer)'::regprocedure])
     AND a.grantee = 0), 'no PUBLIC execute on any billing function touched by this change');
SELECT ok(has_function_privilege('service_role','public.billing_flag_unresolved_event(uuid,text)','EXECUTE')
      AND has_function_privilege('service_role','public.billing_list_reconcile_subscriptions(text,integer)','EXECUTE')
      AND has_function_privilege('service_role','public.billing_list_reprocessable_events(integer)','EXECUTE')
      AND has_function_privilege('service_role','public.billing_register_pending_subscription(uuid,text,text,text,text)','EXECUTE'), 'service_role may execute them');

-- G2: a quarantined event can heal to processed; processed events stay terminal.
SELECT is((SELECT is_new FROM public.billing_record_event('WH-FIX-Q1','BILLING.SUBSCRIPTION.ACTIVATED','I-FIX-1',NULL,now())), TRUE, 'event recorded');
SELECT lives_ok($$SELECT public.billing_finish_event((SELECT id FROM public.payment_events WHERE provider_event_id='WH-FIX-Q1'), 'quarantined')$$, 'event quarantined');
SELECT is((SELECT status::TEXT FROM public.payment_events WHERE provider_event_id='WH-FIX-Q1'), 'quarantined', 'status quarantined');
SELECT is((SELECT event_status::TEXT FROM public.billing_record_event('WH-FIX-Q1','BILLING.SUBSCRIPTION.ACTIVATED','I-FIX-1',NULL,now())), 'quarantined', 'redelivery sees quarantined (handler re-evaluates it)');
SELECT lives_ok($$SELECT public.billing_finish_event((SELECT id FROM public.payment_events WHERE provider_event_id='WH-FIX-Q1'), 'processed')$$, 'quarantined event heals');
SELECT is((SELECT status::TEXT FROM public.payment_events WHERE provider_event_id='WH-FIX-Q1'), 'processed', 'healed to processed');
SELECT ok((SELECT processed_at IS NOT NULL FROM public.payment_events WHERE provider_event_id='WH-FIX-Q1'), 'processed_at set');
SELECT lives_ok($$SELECT public.billing_finish_event((SELECT id FROM public.payment_events WHERE provider_event_id='WH-FIX-Q1'), 'quarantined')$$, 're-quarantine call is accepted');
SELECT is((SELECT status::TEXT FROM public.payment_events WHERE provider_event_id='WH-FIX-Q1'), 'processed', 'a processed event is never moved back');

-- Ledger guard: quarantined -> processing is the only new transition; provider facts stay immutable, processed terminal.
SELECT throws_ok($$UPDATE public.payment_events SET status = 'verified' WHERE provider_event_id='WH-FIX-Q1'$$, '23514', NULL, 'processed -> verified still rejected');
SELECT throws_ok($$UPDATE public.payment_events SET resource_id = 'I-OTHER' WHERE provider_event_id='WH-FIX-Q1'$$, '42501', 'Payment event provider facts are immutable', 'provider facts still immutable');

-- G1: unresolved refund is quarantined + audited once, never marked processed.
SELECT is((SELECT is_new FROM public.billing_record_event('WH-FIX-REF','PAYMENT.SALE.REFUNDED','SALE-FIX-1',NULL,now())), TRUE, 'refund event recorded with sale id as resource');
SELECT lives_ok($$SELECT public.billing_flag_unresolved_event((SELECT id FROM public.payment_events WHERE provider_event_id='WH-FIX-REF'), 'refund_sale_unresolved')$$, 'flag unresolved');
SELECT lives_ok($$SELECT public.billing_flag_unresolved_event((SELECT id FROM public.payment_events WHERE provider_event_id='WH-FIX-REF'), 'refund_sale_unresolved')$$, 'flag is idempotent');
SELECT is((SELECT status::TEXT FROM public.payment_events WHERE provider_event_id='WH-FIX-REF'), 'quarantined', 'unresolved refund is quarantined');
SELECT is((SELECT count(*)::INT FROM public.audit_events WHERE action='billing.event.unresolved' AND target_id=(SELECT id FROM public.payment_events WHERE provider_event_id='WH-FIX-REF')), 1, 'exactly one audit row');

-- G3: reconciler candidate queries.
INSERT INTO public.subscriptions (user_id, provider, provider_subscription_id, provider_plan_id, plan_key, status, created_at, last_verified_at, current_period_end) VALUES
 ('00000000-0000-0000-0000-000000000172','paypal','I-FIX-OLDPEND','P-1','premium_monthly_ph','approval_pending', now()-interval '10 minutes', NULL, NULL),
 ('00000000-0000-0000-0000-000000000172','paypal','I-FIX-NEWPEND','P-1','premium_monthly_ph','approval_pending', now()-interval '30 seconds', NULL, NULL),
 ('00000000-0000-0000-0000-000000000172','paypal','I-FIX-ANCIENT','P-1','premium_monthly_ph','approval_pending', now()-interval '5 days', NULL, NULL),
 ('00000000-0000-0000-0000-000000000173','paypal','I-FIX-STALE','P-1','premium_monthly_ph','active', now()-interval '3 days', now()-interval '7 hours', now()+interval '20 days'),
 ('00000000-0000-0000-0000-000000000173','paypal','I-FIX-FRESH','P-1','premium_monthly_ph','active', now()-interval '3 days', now()-interval '1 hour', now()+interval '20 days'),
 ('00000000-0000-0000-0000-000000000173','paypal','I-FIX-REFUNDED','P-1','premium_monthly_ph','refunded', now()-interval '3 days', now()-interval '9 hours', now()+interval '20 days');
SELECT bag_eq($$SELECT provider_subscription_id FROM public.billing_list_reconcile_subscriptions('sandbox', 50)$$,
  $$VALUES ('I-FIX-OLDPEND'), ('I-FIX-STALE')$$,
  'candidates: pending (2 min..48 h) and stale-active only; not new/ancient pending, fresh active or refunded');
SELECT is((SELECT count(*)::INT FROM public.billing_list_reconcile_subscriptions('sandbox', 1)), 1, 'limit is honoured');
SELECT is((SELECT count(*)::INT FROM public.billing_list_reconcile_subscriptions('live', 50)), 0, 'environment filter');

-- A quarantined event pulls its subscription in even when that subscription is otherwise fresh.
SELECT lives_ok($$SELECT public.billing_record_event('WH-FIX-UNS','BILLING.SUBSCRIPTION.ACTIVATED','I-FIX-FRESH',NULL,now())$$, 'event for fresh sub recorded');
SELECT lives_ok($$SELECT public.billing_finish_event((SELECT id FROM public.payment_events WHERE provider_event_id='WH-FIX-UNS'), 'quarantined')$$, 'and quarantined');
SELECT is((SELECT reason FROM public.billing_list_reconcile_subscriptions('sandbox', 50) WHERE provider_subscription_id = 'I-FIX-FRESH'), 'event_unsettled', 'quarantined event makes its subscription a candidate');

-- Reprocessable events: quarantined, or stuck verified/processing > 10 min; never processed or fresh-verified.
SELECT lives_ok($$SELECT public.billing_record_event('WH-FIX-FRESHV','PAYMENT.SALE.COMPLETED','I-FIX-FRESH',NULL,now())$$, 'fresh verified event');
INSERT INTO public.payment_events (provider, provider_event_id, event_type, resource_id, status, provider_verified, received_at)
VALUES ('paypal','WH-FIX-STUCK','PAYMENT.SALE.COMPLETED','I-FIX-STALE','verified',TRUE, now() - interval '20 minutes');
SELECT ok(TRUE, 'stuck verified event (inserted 20 minutes in the past)');
SELECT bag_eq($$SELECT provider_event_id FROM public.billing_list_reprocessable_events(50)$$,
  $$VALUES ('WH-FIX-REF'), ('WH-FIX-UNS'), ('WH-FIX-STUCK')$$,
  'reprocessable = quarantined + stuck; not processed (Q1) or fresh-verified');
SELECT is((SELECT resource_id FROM public.billing_list_reprocessable_events(50) WHERE provider_event_id = 'WH-FIX-REF'), 'SALE-FIX-1', 'unresolved refund keeps the sale id for retry');

-- Clients cannot call the reconciler queries.
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.billing_list_reprocessable_events(5)$$, '42501', NULL, 'authenticated cannot list events');
SELECT throws_ok($$SELECT * FROM public.billing_flag_unresolved_event('00000000-0000-0000-0000-000000000000','x')$$, '42501', NULL, 'authenticated cannot flag events');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
