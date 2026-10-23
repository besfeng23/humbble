-- Privilege hardening for audit_events, consent_records, privacy_requests, subscriptions, entitlements, payment_events
-- (migration 20261023000060). Behavioural assertions run AS service_role / authenticated and match the permission-denied
-- MESSAGE ('permission denied for table X'), so they can only be satisfied by a privilege revocation, never by the
-- pre-existing guard triggers (whose messages differ).
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
SELECT plan(101);

DELETE FROM auth.users WHERE id IN ('00000000-0000-0000-0000-000000000231','00000000-0000-0000-0000-000000000232');
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000231','authenticated','authenticated','p60-a@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000232','authenticated','authenticated','p60-b@example.test',now(),now());
INSERT INTO public.profiles (id, display_name, birth_date, verification_status, is_discoverable, is_suspended) VALUES
 ('00000000-0000-0000-0000-000000000231','Hard Alpha',DATE '1991-01-01','verified',TRUE,FALSE),
 ('00000000-0000-0000-0000-000000000232','Hard Bravo',DATE '1991-01-02','verified',TRUE,FALSE);

-- Seed rows as the owner (postgres) so DELETE/UPDATE have targets.
INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
VALUES ('00000000-0000-0000-0000-000000000231','p60.seed','test',NULL,'{"fixture":"p60"}');
INSERT INTO public.consent_records (user_id, consent_key, version, choice)
VALUES ('00000000-0000-0000-0000-000000000231','p60-consent','v1','granted');
INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key)
VALUES ('00000000-0000-0000-0000-000000000231','export','00000000-0000-0000-0000-000000000241');
SELECT public.billing_register_pending_subscription('00000000-0000-0000-0000-000000000231','premium_monthly_ph','I-P60-1','P-P60-PH','sandbox');
SELECT public.billing_record_event('WH-P60-SEED','PAYMENT.SALE.COMPLETED','I-P60-1',NULL,now());

-- ===== 1. catalog privileges, every affected table x role =====
SELECT ok(NOT (has_table_privilege('service_role','public.audit_events','DELETE') OR has_table_privilege('service_role','public.audit_events','TRUNCATE')
            OR has_table_privilege('service_role','public.audit_events','UPDATE') OR has_table_privilege('service_role','public.audit_events','REFERENCES')
            OR has_table_privilege('service_role','public.audit_events','TRIGGER')), 'audit_events: service_role has no DELETE/TRUNCATE/UPDATE/REFERENCES/TRIGGER');
SELECT ok(has_table_privilege('service_role','public.audit_events','SELECT') AND has_table_privilege('service_role','public.audit_events','INSERT'), 'audit_events: service_role keeps SELECT, INSERT');
SELECT ok(NOT (has_table_privilege('service_role','public.consent_records','DELETE') OR has_table_privilege('service_role','public.consent_records','TRUNCATE')
            OR has_table_privilege('service_role','public.consent_records','UPDATE') OR has_table_privilege('service_role','public.consent_records','REFERENCES')
            OR has_table_privilege('service_role','public.consent_records','TRIGGER')), 'consent_records: service_role has no DELETE/TRUNCATE/UPDATE/REFERENCES/TRIGGER');
SELECT ok(has_table_privilege('service_role','public.consent_records','SELECT') AND has_table_privilege('service_role','public.consent_records','INSERT'), 'consent_records: service_role keeps SELECT, INSERT');
SELECT ok(NOT (has_table_privilege('service_role','public.privacy_requests','DELETE') OR has_table_privilege('service_role','public.privacy_requests','TRUNCATE')
            OR has_table_privilege('service_role','public.privacy_requests','UPDATE') OR has_table_privilege('service_role','public.privacy_requests','REFERENCES')
            OR has_table_privilege('service_role','public.privacy_requests','TRIGGER')), 'privacy_requests: service_role has no DELETE/TRUNCATE/table-level UPDATE/REFERENCES/TRIGGER');
SELECT ok(has_table_privilege('service_role','public.privacy_requests','SELECT') AND has_table_privilege('service_role','public.privacy_requests','INSERT'), 'privacy_requests: service_role keeps SELECT, INSERT');
SELECT ok(has_column_privilege('service_role','public.privacy_requests','status','UPDATE') AND has_column_privilege('service_role','public.privacy_requests','completion_metadata','UPDATE')
          AND has_column_privilege('service_role','public.privacy_requests','failure_code','UPDATE') AND NOT has_column_privilege('service_role','public.privacy_requests','legal_hold','UPDATE')
          AND NOT has_column_privilege('service_role','public.privacy_requests','retention_until','UPDATE'), 'privacy_requests: workflow column UPDATE kept; legal_hold/retention_until no longer updatable (F-06)');
SELECT ok(NOT (has_column_privilege('service_role','public.privacy_requests','user_id','UPDATE') OR has_column_privilege('service_role','public.privacy_requests','request_type','UPDATE')
            OR has_column_privilege('service_role','public.privacy_requests','idempotency_key','UPDATE') OR has_column_privilege('service_role','public.privacy_requests','created_at','UPDATE')), 'privacy_requests: identity columns are not updatable by service_role');
SELECT ok(NOT (has_table_privilege('service_role','public.subscriptions','INSERT') OR has_table_privilege('service_role','public.subscriptions','UPDATE')
            OR has_table_privilege('service_role','public.subscriptions','DELETE') OR has_table_privilege('service_role','public.subscriptions','TRUNCATE')
            OR has_table_privilege('service_role','public.subscriptions','REFERENCES') OR has_table_privilege('service_role','public.subscriptions','TRIGGER')), 'subscriptions: service_role has no write/TRUNCATE/REFERENCES/TRIGGER');
SELECT ok(has_table_privilege('service_role','public.subscriptions','SELECT'), 'subscriptions: service_role keeps SELECT');
SELECT ok(NOT (has_table_privilege('service_role','public.entitlements','INSERT') OR has_table_privilege('service_role','public.entitlements','UPDATE')
            OR has_table_privilege('service_role','public.entitlements','DELETE') OR has_table_privilege('service_role','public.entitlements','TRUNCATE')
            OR has_table_privilege('service_role','public.entitlements','REFERENCES') OR has_table_privilege('service_role','public.entitlements','TRIGGER')), 'entitlements: service_role has no write/TRUNCATE/REFERENCES/TRIGGER');
SELECT ok(has_table_privilege('service_role','public.entitlements','SELECT'), 'entitlements: service_role keeps SELECT');
SELECT ok(NOT (has_table_privilege('service_role','public.payment_events','DELETE') OR has_table_privilege('service_role','public.payment_events','TRUNCATE')
            OR has_table_privilege('service_role','public.payment_events','UPDATE')), 'payment_events: still no DELETE/TRUNCATE/table-level UPDATE');
SELECT ok(NOT (has_column_privilege('service_role','public.payment_events','status','UPDATE') OR has_column_privilege('service_role','public.payment_events','provider_verified','UPDATE')
          OR has_column_privilege('service_role','public.payment_events','processed_at','UPDATE') OR has_column_privilege('service_role','public.payment_events','legal_hold','UPDATE')), 'payment_events (F-06): no process-state column is directly updatable (billing_finish_event is the only writer)');
SELECT ok(NOT has_column_privilege('service_role','public.payment_events','retention_until','UPDATE'), 'payment_events (N3): retention_until is no longer updatable by service_role');
SELECT is((SELECT count(*)::INT FROM information_schema.column_privileges WHERE grantee='service_role' AND table_schema='public' AND table_name='payment_events' AND privilege_type='UPDATE'), 0, 'payment_events: zero UPDATE columns for service_role');

-- anon: nothing on any of the six tables
SELECT is((SELECT count(*)::INT FROM unnest(ARRAY['audit_events','consent_records','privacy_requests','subscriptions','entitlements','payment_events']) t,
            unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
            WHERE has_table_privilege('anon','public.'||t,p)), 0, 'anon has no table privilege on any affected table');
-- authenticated: unchanged client contract
SELECT is((SELECT string_agg(t||':'||p, ',' ORDER BY t, p) FROM unnest(ARRAY['audit_events','consent_records','privacy_requests','subscriptions','entitlements','payment_events']) t,
            unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
            WHERE has_table_privilege('authenticated','public.'||t,p)),
          'consent_records:SELECT,entitlements:SELECT,privacy_requests:SELECT,subscriptions:SELECT', 'authenticated keeps exactly SELECT on consent/privacy/subscriptions/entitlements and nothing on audit_events/payment_events');
SELECT ok(has_column_privilege('authenticated','public.consent_records','consent_key','INSERT') AND has_column_privilege('authenticated','public.consent_records','choice','INSERT')
          AND has_column_privilege('authenticated','public.privacy_requests','request_type','INSERT') AND has_column_privilege('authenticated','public.privacy_requests','idempotency_key','INSERT'), 'authenticated keeps column-level INSERT on consent_records and privacy_requests');
SELECT ok(NOT (has_column_privilege('authenticated','public.consent_records','recorded_at','INSERT') OR has_column_privilege('authenticated','public.privacy_requests','status','INSERT')
            OR has_column_privilege('authenticated','public.privacy_requests','status','UPDATE') OR has_column_privilege('authenticated','public.consent_records','choice','UPDATE')), 'authenticated has no extra column privileges');
SELECT is((SELECT count(*)::INT FROM pg_class c, LATERAL aclexplode(c.relacl) a
            WHERE c.oid IN ('public.audit_events'::regclass,'public.consent_records'::regclass,'public.privacy_requests'::regclass,'public.subscriptions'::regclass,'public.entitlements'::regclass,'public.payment_events'::regclass)
              AND a.grantee = 0), 0, 'no PUBLIC ACL entry on any affected table');
SELECT is((SELECT count(*)::INT FROM pg_attribute a, LATERAL aclexplode(a.attacl) x
            WHERE a.attrelid IN ('public.audit_events'::regclass,'public.consent_records'::regclass,'public.privacy_requests'::regclass,'public.subscriptions'::regclass,'public.entitlements'::regclass,'public.payment_events'::regclass)
              AND a.attacl IS NOT NULL AND x.grantee = 0), 0, 'no PUBLIC column ACL entry on any affected table');

-- ===== 2. TRUNCATE guards =====
SELECT is((SELECT count(*)::INT FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgname IN ('trg_audit_events_no_truncate','trg_consent_records_no_truncate','trg_payment_events_no_truncate')
            AND (t.tgtype & 32) = 32 AND (t.tgtype & 1) = 0 AND (t.tgtype & 2) = 2 AND t.tgenabled = 'A'), 3, 'three BEFORE TRUNCATE statement triggers, ENABLE ALWAYS');
SELECT throws_ok($$TRUNCATE public.audit_events$$, '42501', 'TRUNCATE is not permitted on public.audit_events', 'guard blocks TRUNCATE audit_events even for the owner');
SELECT throws_ok($$TRUNCATE public.consent_records$$, '42501', 'TRUNCATE is not permitted on public.consent_records', 'guard blocks TRUNCATE consent_records even for the owner');
SELECT throws_ok($$TRUNCATE public.payment_events CASCADE$$, '42501', 'TRUNCATE is not permitted on public.payment_events', 'guard blocks TRUNCATE payment_events even for the owner');
SELECT ok(NOT has_function_privilege('service_role','private.prevent_evidence_truncate()','EXECUTE') AND NOT has_function_privilege('authenticated','private.prevent_evidence_truncate()','EXECUTE')
          AND NOT has_function_privilege('anon','private.prevent_evidence_truncate()','EXECUTE'), 'guard function is not executable by API roles');
-- defence in depth: even if TRUNCATE is re-granted to service_role (blanket GRANT, tooling), the guard still refuses it
GRANT TRUNCATE ON public.audit_events, public.consent_records, public.payment_events, public.billing_readbacks TO service_role;
SET LOCAL ROLE service_role;
SELECT throws_ok($$TRUNCATE public.audit_events$$, '42501', 'TRUNCATE is not permitted on public.audit_events', 'with TRUNCATE re-granted, the guard still blocks audit_events');
SELECT throws_ok($$TRUNCATE public.consent_records$$, '42501', 'TRUNCATE is not permitted on public.consent_records', 'with TRUNCATE re-granted, the guard still blocks consent_records');
SELECT throws_ok($$TRUNCATE public.payment_events CASCADE$$, '42501', 'TRUNCATE is not permitted on public.payment_events', 'with TRUNCATE re-granted, the guard still blocks payment_events');
RESET ROLE;
REVOKE TRUNCATE ON public.audit_events, public.consent_records, public.payment_events, public.billing_readbacks FROM service_role;
SELECT is((SELECT count(*)::INT FROM public.audit_events WHERE action = 'p60.seed'), 1, 'audit seed row survived the TRUNCATE attempts');

-- ===== 3. behaviour AS service_role: DELETE / TRUNCATE / forbidden UPDATE are permission errors =====
SET LOCAL ROLE service_role;
-- audit_events
SELECT throws_ok($$DELETE FROM public.audit_events WHERE action = 'p60.seed'$$, '42501', 'permission denied for table audit_events', 'audit_events DELETE is a permission error');
SELECT throws_ok($$DELETE FROM public.audit_events$$, '42501', 'permission denied for table audit_events', 'audit_events bulk DELETE is a permission error');
SELECT throws_ok($$TRUNCATE public.audit_events$$, '42501', 'permission denied for table audit_events', 'audit_events TRUNCATE is a permission error');
SELECT throws_ok($$UPDATE public.audit_events SET action = 'tampered' WHERE action = 'p60.seed'$$, '42501', 'permission denied for table audit_events', 'audit_events UPDATE is a permission error');
-- consent_records
SELECT throws_ok($$DELETE FROM public.consent_records WHERE consent_key = 'p60-consent'$$, '42501', 'permission denied for table consent_records', 'consent_records DELETE is a permission error');
SELECT throws_ok($$DELETE FROM public.consent_records$$, '42501', 'permission denied for table consent_records', 'consent_records bulk DELETE is a permission error');
SELECT throws_ok($$TRUNCATE public.consent_records$$, '42501', 'permission denied for table consent_records', 'consent_records TRUNCATE is a permission error');
SELECT throws_ok($$UPDATE public.consent_records SET choice = 'withdrawn' WHERE consent_key = 'p60-consent'$$, '42501', 'permission denied for table consent_records', 'consent_records UPDATE is a permission error');
-- privacy_requests
SELECT throws_ok($$DELETE FROM public.privacy_requests WHERE idempotency_key = '00000000-0000-0000-0000-000000000241'$$, '42501', 'permission denied for table privacy_requests', 'privacy_requests DELETE is a permission error');
SELECT throws_ok($$TRUNCATE public.privacy_requests$$, '42501', 'permission denied for table privacy_requests', 'privacy_requests TRUNCATE is a permission error');
SELECT throws_ok($$UPDATE public.privacy_requests SET user_id = NULL WHERE idempotency_key = '00000000-0000-0000-0000-000000000241'$$, '42501', 'permission denied for table privacy_requests', 'privacy_requests user_id rewrite is a permission error');
SELECT throws_ok($$UPDATE public.privacy_requests SET request_type = 'deletion' WHERE idempotency_key = '00000000-0000-0000-0000-000000000241'$$, '42501', 'permission denied for table privacy_requests', 'privacy_requests request_type rewrite is a permission error');
SELECT throws_ok($$UPDATE public.privacy_requests SET status = 'in_progress', created_at = now() WHERE idempotency_key = '00000000-0000-0000-0000-000000000241'$$, '42501', 'permission denied for table privacy_requests', 'mixing an allowed column with a forbidden one is a permission error');
-- subscriptions
SELECT throws_ok($$DELETE FROM public.subscriptions WHERE provider_subscription_id = 'I-P60-1'$$, '42501', 'permission denied for table subscriptions', 'subscriptions DELETE is a permission error');
SELECT throws_ok($$TRUNCATE public.subscriptions$$, '42501', 'permission denied for table subscriptions', 'subscriptions TRUNCATE is a permission error');
SELECT throws_ok($$UPDATE public.subscriptions SET status = 'active' WHERE provider_subscription_id = 'I-P60-1'$$, '42501', 'permission denied for table subscriptions', 'subscriptions UPDATE (direct activation) is a permission error');
SELECT throws_ok($$INSERT INTO public.subscriptions (user_id, provider, provider_subscription_id, provider_plan_id, plan_key, status) VALUES ('00000000-0000-0000-0000-000000000231','paypal','I-P60-FORGED','P-P60-PH','premium_monthly_ph','active')$$, '42501', 'permission denied for table subscriptions', 'subscriptions INSERT is a permission error');
-- entitlements
SELECT throws_ok($$INSERT INTO public.entitlements (user_id, entitlement_key, status) VALUES ('00000000-0000-0000-0000-000000000231','premium','active')$$, '42501', 'permission denied for table entitlements', 'entitlements INSERT (forged premium) is a permission error');
SELECT throws_ok($$UPDATE public.entitlements SET status = 'active'$$, '42501', 'permission denied for table entitlements', 'entitlements UPDATE is a permission error');
SELECT throws_ok($$DELETE FROM public.entitlements$$, '42501', 'permission denied for table entitlements', 'entitlements DELETE is a permission error');
SELECT throws_ok($$TRUNCATE public.entitlements$$, '42501', 'permission denied for table entitlements', 'entitlements TRUNCATE is a permission error');
-- payment_events (still denied + N3)
SELECT throws_ok($$DELETE FROM public.payment_events WHERE provider_event_id = 'WH-P60-SEED'$$, '42501', 'permission denied for table payment_events', 'payment_events DELETE is a permission error');
SELECT throws_ok($$TRUNCATE public.payment_events$$, '42501', 'permission denied for table payment_events', 'payment_events TRUNCATE is a permission error');
SELECT throws_ok($$UPDATE public.payment_events SET retention_until = now() + interval '1 day' WHERE provider_event_id = 'WH-P60-SEED'$$, '42501', 'permission denied for table payment_events', 'payment_events retention_until UPDATE is now a permission error (N3)');
SELECT throws_ok($$UPDATE public.payment_events SET amount = 1.00 WHERE provider_event_id = 'WH-P60-SEED'$$, '42501', 'permission denied for table payment_events', 'payment_events amount UPDATE is a permission error');
RESET ROLE;
SELECT ok(EXISTS (SELECT 1 FROM public.audit_events WHERE action='p60.seed')
          AND EXISTS (SELECT 1 FROM public.consent_records WHERE consent_key='p60-consent' AND choice='granted')
          AND EXISTS (SELECT 1 FROM public.privacy_requests WHERE idempotency_key='00000000-0000-0000-0000-000000000241' AND status='requested')
          AND EXISTS (SELECT 1 FROM public.subscriptions WHERE provider_subscription_id='I-P60-1' AND status='approval_pending')
          AND NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE provider_subscription_id='I-P60-FORGED')
          AND NOT EXISTS (SELECT 1 FROM public.entitlements WHERE user_id='00000000-0000-0000-0000-000000000231')
          AND EXISTS (SELECT 1 FROM public.payment_events WHERE provider_event_id='WH-P60-SEED' AND retention_until IS NULL), 'every row is untouched by the failed statements');

-- ===== 4. legitimate paths AS service_role still work =====
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT count(*) FROM public.audit_events$$, 'service_role SELECT audit_events');
SELECT lives_ok($$INSERT INTO public.audit_events (actor_id, action, target_type, metadata) VALUES (NULL, 'p60.service_insert', 'test', '{}')$$, 'service_role INSERT audit_events (append-only contract)');
SELECT lives_ok($$INSERT INTO public.consent_records (user_id, consent_key, version, choice) VALUES ('00000000-0000-0000-0000-000000000231','p60-consent-2','v1','denied')$$, 'service_role INSERT consent_records');
SELECT lives_ok($$SELECT count(*) FROM public.consent_records$$, 'service_role SELECT consent_records');
SELECT lives_ok($$INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key) VALUES ('00000000-0000-0000-0000-000000000232','deletion','00000000-0000-0000-0000-000000000242')$$, 'service_role INSERT privacy_requests');
SELECT lives_ok($$UPDATE public.privacy_requests SET status = 'in_progress' WHERE idempotency_key = '00000000-0000-0000-0000-000000000242'$$, 'service_role workflow UPDATE (status) on privacy_requests');
SELECT lives_ok($$UPDATE public.privacy_requests SET status = 'completed', completion_metadata = '{"outcome":"p60"}' WHERE idempotency_key = '00000000-0000-0000-0000-000000000242'$$, 'service_role completes a privacy request');
SELECT throws_ok($$UPDATE public.privacy_requests SET legal_hold = TRUE, retention_until = now() + interval '1 year' WHERE idempotency_key = '00000000-0000-0000-0000-000000000241'$$, '42501', 'permission denied for table privacy_requests', 'service_role can no longer flip legal_hold/retention_until on privacy_requests (F-06)');
SELECT lives_ok($$SELECT count(*) FROM public.subscriptions$$, 'service_role SELECT subscriptions (billingStore.latestSubscription)');
SELECT lives_ok($$SELECT provider_subscription_id, status FROM public.subscriptions WHERE user_id = '00000000-0000-0000-0000-000000000231' AND provider = 'paypal' ORDER BY created_at DESC LIMIT 1$$, 'service_role SELECT with the exact Edge Function projection');
SELECT lives_ok($$SELECT count(*) FROM public.entitlements$$, 'service_role SELECT entitlements');
-- SECURITY DEFINER billing RPCs (owner postgres) still write subscriptions / entitlements / ledger / audit
SELECT lives_ok($$SELECT public.billing_register_pending_subscription('00000000-0000-0000-0000-000000000232','premium_monthly_ph','I-P60-2','P-P60-PH','sandbox')$$, 'billing_register_pending_subscription inserts a subscription');
SELECT is((SELECT outcome FROM public.t_apply_readback('I-P60-1','P-P60-PH','active', now()+interval '20 days', 599.00, 'PHP', NULL)), 'granted', 'billing_apply_readback grants (writes subscriptions + entitlements + audit)');
SELECT lives_ok($$SELECT * FROM public.billing_record_event('WH-P60-NEW','BILLING.SUBSCRIPTION.ACTIVATED','I-P60-1',NULL,now())$$, 'billing_record_event inserts into the ledger');
SELECT lives_ok($$SELECT public.billing_finish_event((SELECT id FROM public.payment_events WHERE provider_event_id='WH-P60-NEW'), 'quarantined')$$, 'billing_finish_event updates the ledger');
SELECT lives_ok($$SELECT public.billing_flag_unresolved_event((SELECT id FROM public.payment_events WHERE provider_event_id='WH-P60-NEW'), 'p60')$$, 'billing_flag_unresolved_event writes ledger + audit');
SELECT is((SELECT outcome FROM public.t_apply_readback('I-P60-1','P-P60-PH','refunded', NULL, NULL, NULL, NULL)), 'revoked', 'billing_apply_readback revokes (updates subscriptions + entitlements)');
SELECT throws_ok($$UPDATE public.payment_events SET legal_hold = TRUE WHERE provider_event_id = 'WH-P60-SEED'$$, '42501', 'permission denied for table payment_events', 'payment_events legal_hold UPDATE is a permission error (F-06)');
RESET ROLE;
SELECT is((SELECT status::TEXT FROM public.entitlements WHERE user_id='00000000-0000-0000-0000-000000000231'), 'revoked', 'entitlement was written by the RPC and is revoked');
SELECT is((SELECT status::TEXT FROM public.subscriptions WHERE provider_subscription_id='I-P60-1'), 'refunded', 'subscription was updated by the RPC');
SELECT cmp_ok((SELECT count(*)::INT FROM public.audit_events WHERE action LIKE 'billing.%'), '>=', 2, 'billing RPCs appended audit events');

-- ===== 5. legitimate client paths AS authenticated =====
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000231","role":"authenticated"}';
SELECT lives_ok($$INSERT INTO public.consent_records (user_id, consent_key, version, choice, source, metadata) VALUES ('00000000-0000-0000-0000-000000000231','p60-client-consent','v1','granted','app','{}')$$, 'authenticated can still record own consent');
SELECT is((SELECT count(*)::INT FROM public.consent_records WHERE consent_key IN ('p60-consent','p60-client-consent')), 2, 'authenticated reads only own consent rows');
SELECT lives_ok($$SELECT public.request_privacy_action('deletion','00000000-0000-0000-0000-000000000243')$$, 'authenticated request_privacy_action still works (writes privacy_requests + audit_events as definer)');
SELECT lives_ok($$INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key) VALUES ('00000000-0000-0000-0000-000000000231','export','00000000-0000-0000-0000-000000000244')$$, 'authenticated can still insert own privacy request directly');
SELECT is((SELECT count(*)::INT FROM public.privacy_requests), 3, 'authenticated reads only own privacy requests');
SELECT is((SELECT count(*)::INT FROM public.subscriptions), 1, 'authenticated reads only own subscription');
SELECT is((SELECT count(*)::INT FROM public.entitlements), 1, 'authenticated reads only own entitlement');
SELECT lives_ok($$SELECT public.get_my_premium_status()$$, 'get_my_premium_status still works');
SELECT lives_ok($$SELECT public.block_user('00000000-0000-0000-0000-000000000232')$$, 'block_user still writes audit_events as definer');
SELECT lives_ok($$SELECT public.submit_report('00000000-0000-0000-0000-000000000232','safety','p60 report',NULL)$$, 'submit_report still writes audit_events as definer');
SELECT throws_ok($$SELECT count(*) FROM public.audit_events$$, '42501', 'permission denied for table audit_events', 'authenticated still cannot read audit_events');
SELECT throws_ok($$UPDATE public.consent_records SET choice = 'withdrawn'$$, '42501', 'permission denied for table consent_records', 'authenticated still cannot edit consent');
SELECT throws_ok($$DELETE FROM public.privacy_requests$$, '42501', 'permission denied for table privacy_requests', 'authenticated still cannot delete privacy requests');
SELECT throws_ok($$UPDATE public.subscriptions SET status = 'active'$$, '42501', 'permission denied for table subscriptions', 'authenticated still cannot update subscriptions');
SELECT throws_ok($$INSERT INTO public.entitlements (user_id, entitlement_key, status) VALUES ('00000000-0000-0000-0000-000000000231','forged','active')$$, '42501', 'permission denied for table entitlements', 'authenticated still cannot mint entitlements');
SELECT throws_ok($$TRUNCATE public.consent_records$$, '42501', 'permission denied for table consent_records', 'authenticated cannot TRUNCATE');
RESET ROLE;
RESET "request.jwt.claims";

-- ===== 6. account deletion keeps working (FK actions run as the table owner, not service_role) =====
-- (supabase_auth_admin cannot be impersonated from the pgTAP session; the RI actions run as the table owner either way.)
INSERT INTO public.payment_events (provider, provider_event_id, event_type, resource_id, user_id, subscription_id, status, provider_verified)
VALUES ('paypal','WH-P60-FK','PAYMENT.SALE.COMPLETED','I-P60-1','00000000-0000-0000-0000-000000000231',
        (SELECT id FROM public.subscriptions WHERE provider_subscription_id='I-P60-1'),'received',FALSE);
SELECT lives_ok($$DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000231'$$, 'auth user deletion succeeds with the hardened grants (FK actions run as table owner)');
SELECT ok(EXISTS (SELECT 1 FROM public.audit_events WHERE action='p60.seed' AND actor_id IS NULL), 'audit_events survive deletion with actor_id nulled');
SELECT ok(EXISTS (SELECT 1 FROM public.consent_records WHERE consent_key='p60-consent' AND user_id IS NULL), 'consent_records survive deletion with user_id nulled');
SELECT ok(EXISTS (SELECT 1 FROM public.privacy_requests WHERE idempotency_key='00000000-0000-0000-0000-000000000241' AND user_id IS NULL), 'privacy_requests survive deletion with user_id nulled');
SELECT ok(EXISTS (SELECT 1 FROM public.subscriptions WHERE provider_subscription_id='I-P60-1' AND user_id IS NULL), 'subscriptions survive deletion with user_id nulled');
SELECT ok(EXISTS (SELECT 1 FROM public.payment_events WHERE provider_event_id='WH-P60-FK' AND user_id IS NULL AND subscription_id IS NOT NULL), 'payment_events survive deletion with user_id nulled');
SELECT is((SELECT count(*)::INT FROM public.entitlements WHERE source_subscription_id = (SELECT id FROM public.subscriptions WHERE provider_subscription_id='I-P60-1')), 0, 'derived entitlement is removed (ON DELETE CASCADE)');

SELECT * FROM finish();
ROLLBACK;
