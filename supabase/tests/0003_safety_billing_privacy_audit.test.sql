-- pgTAP tests for P2-03. Fixtures are synthetic; retained test records are
-- identified and cleaned on subsequent runs before the Auth fixtures are reset.
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;

-- Stable fixture IDs are deliberately outside the P2-01/P2-02 test range.
DELETE FROM public.audit_events
 WHERE (metadata ->> 'fixture')::TEXT COLLATE "C" = 'p2-03'::TEXT COLLATE "C";
DELETE FROM public.consent_records
 WHERE consent_key::TEXT COLLATE "C" IN ('p203-test-consent'::TEXT COLLATE "C", 'p203-retention-consent'::TEXT COLLATE "C");
DELETE FROM public.payment_events
 WHERE provider_event_id::TEXT COLLATE "C" IN ('p203-event-main'::TEXT COLLATE "C", 'p203-event-retention'::TEXT COLLATE "C");
DELETE FROM public.privacy_requests
 WHERE idempotency_key IN (
   '00000000-0000-0000-0000-000000000031',
   '00000000-0000-0000-0000-000000000035'
 );
DELETE FROM public.entitlements
 WHERE entitlement_key::TEXT COLLATE "C" = 'p203-test-premium'::TEXT COLLATE "C";
DELETE FROM public.moderation_cases
 WHERE report_id IN (SELECT id FROM public.reports WHERE context_summary::TEXT COLLATE "C" IN ('p203-test-report'::TEXT COLLATE "C", 'p203-retention-report'::TEXT COLLATE "C"));
DELETE FROM public.reports
 WHERE context_summary::TEXT COLLATE "C" IN ('p203-test-report'::TEXT COLLATE "C", 'p203-retention-report'::TEXT COLLATE "C");
DELETE FROM public.subscriptions
 WHERE provider_subscription_id::TEXT COLLATE "C" IN ('p203-sub-main'::TEXT COLLATE "C", 'p203-sub-retention'::TEXT COLLATE "C");
DELETE FROM auth.users
 WHERE id IN (
   '00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000022',
   '00000000-0000-0000-0000-000000000023',
   '00000000-0000-0000-0000-000000000024',
   '00000000-0000-0000-0000-000000000025'
 );

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES
 ('00000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated', 'p203-alpha@example.test', now(), now()),
 ('00000000-0000-0000-0000-000000000022', 'authenticated', 'authenticated', 'p203-bravo@example.test', now(), now()),
 ('00000000-0000-0000-0000-000000000023', 'authenticated', 'authenticated', 'p203-charlie@example.test', now(), now()),
 ('00000000-0000-0000-0000-000000000024', 'authenticated', 'authenticated', 'p203-delta@example.test', now(), now()),
 ('00000000-0000-0000-0000-000000000025', 'authenticated', 'authenticated', 'p203-retention@example.test', now(), now());

INSERT INTO public.profiles (id, display_name, birth_date, verification_status, is_discoverable, is_suspended)
VALUES
 ('00000000-0000-0000-0000-000000000021', 'P3 Alpha', DATE '1990-01-01', 'verified', TRUE, FALSE),
 ('00000000-0000-0000-0000-000000000022', 'P3 Bravo', DATE '1990-01-02', 'verified', TRUE, FALSE),
 ('00000000-0000-0000-0000-000000000023', 'P3 Charlie', DATE '1990-01-03', 'verified', TRUE, FALSE),
 ('00000000-0000-0000-0000-000000000024', 'P3 Delta', DATE '1990-01-04', 'verified', TRUE, FALSE),
 ('00000000-0000-0000-0000-000000000025', 'P3 Retention', DATE '1990-01-05', 'verified', TRUE, FALSE);

INSERT INTO public.subscriptions
 (user_id, provider, provider_subscription_id, provider_plan_id, status, current_period_start, current_period_end)
VALUES
 ('00000000-0000-0000-0000-000000000021', 'paypal', 'p203-sub-main', 'p203-plan-test', 'active', now(), now() + interval '1 month'),
 ('00000000-0000-0000-0000-000000000025', 'paypal', 'p203-sub-retention', 'p203-plan-test', 'active', now(), now() + interval '1 month');

-- An ACTIVE subscription alone does not create an entitlement.
SELECT plan(92);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.entitlements WHERE user_id = '00000000-0000-0000-0000-000000000021'),
  'active subscription alone does not mint an entitlement'
);

INSERT INTO public.payment_events
 (provider, provider_event_id, event_type, resource_id, user_id, subscription_id, amount, currency, status, payload_sha256)
SELECT 'paypal', 'p203-event-main', 'PAYMENT.SALE.COMPLETED', 'sale-p203-main', s.user_id, s.id,
       599.00, 'PHP', 'received', repeat('a', 64)
  FROM public.subscriptions AS s
 WHERE s.provider_subscription_id::TEXT COLLATE "C" = 'p203-sub-main'::TEXT COLLATE "C";
INSERT INTO public.payment_events
 (provider, provider_event_id, event_type, resource_id, user_id, subscription_id, amount, currency, status)
SELECT 'paypal', 'p203-event-retention', 'PAYMENT.SALE.COMPLETED', 'sale-p203-retention', s.user_id, s.id,
       599.00, 'PHP', 'received'
  FROM public.subscriptions AS s
 WHERE s.provider_subscription_id::TEXT COLLATE "C" = 'p203-sub-retention'::TEXT COLLATE "C";

INSERT INTO public.reports (reporter_id, reported_user_id, category, context_summary, severity)
VALUES
 ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000022', 'safety', 'p203-test-report', 'high'),
 ('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000021', 'underage', 'p203-retention-report', 'urgent');
INSERT INTO public.moderation_cases (report_id, status)
SELECT id, 'open'
  FROM public.reports
 WHERE context_summary::TEXT COLLATE "C" IN ('p203-test-report'::TEXT COLLATE "C", 'p203-retention-report'::TEXT COLLATE "C");
INSERT INTO public.consent_records (user_id, consent_key, version, choice, source, metadata)
VALUES
 ('00000000-0000-0000-0000-000000000021', 'p203-test-consent', 'v1', 'granted', 'app', '{"fixture":"p2-03"}'::jsonb),
 ('00000000-0000-0000-0000-000000000025', 'p203-retention-consent', 'v1', 'denied', 'app', '{"fixture":"p2-03"}'::jsonb);
INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key)
VALUES
 ('00000000-0000-0000-0000-000000000021', 'export', '00000000-0000-0000-0000-000000000031'),
 ('00000000-0000-0000-0000-000000000025', 'deletion', '00000000-0000-0000-0000-000000000035');
INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
VALUES
 ('00000000-0000-0000-0000-000000000021', 'p203-test-event', 'account', '00000000-0000-0000-0000-000000000021', '{"fixture":"p2-03"}'::jsonb),
 ('00000000-0000-0000-0000-000000000025', 'p203-retention-event', 'privacy_request', NULL, '{"fixture":"p2-03"}'::jsonb);
INSERT INTO public.entitlements (user_id, entitlement_key, status, source_subscription_id)
SELECT s.user_id, 'p203-test-premium', 'active', s.id
  FROM public.subscriptions AS s
 WHERE s.provider_subscription_id::TEXT COLLATE "C" IN ('p203-sub-main'::TEXT COLLATE "C", 'p203-sub-retention'::TEXT COLLATE "C");

-- Required relations/enums (20 assertions including label checks).
SELECT has_table('public', 'reports', 'reports table exists');
SELECT has_table('public', 'moderation_cases', 'moderation_cases table exists');
SELECT has_table('public', 'subscriptions', 'subscriptions table exists');
SELECT has_table('public', 'entitlements', 'entitlements table exists');
SELECT has_table('public', 'payment_events', 'payment_events table exists');
SELECT has_table('public', 'consent_records', 'consent_records table exists');
SELECT has_table('public', 'privacy_requests', 'privacy_requests table exists');
SELECT has_table('public', 'audit_events', 'audit_events table exists');
SELECT has_enum('public', 'report_category', 'report_category enum exists');
SELECT has_enum('public', 'report_status', 'report_status enum exists');
SELECT has_enum('public', 'report_severity', 'report_severity enum exists');
SELECT has_enum('public', 'moderation_case_status', 'moderation_case_status enum exists');
SELECT has_enum('public', 'subscription_status', 'subscription_status enum exists');
SELECT has_enum('public', 'entitlement_status', 'entitlement_status enum exists');
SELECT has_enum('public', 'payment_event_status', 'payment_event_status enum exists');
SELECT has_enum('public', 'privacy_request_type', 'privacy_request_type enum exists');
SELECT has_enum('public', 'privacy_request_status', 'privacy_request_status enum exists');
SELECT has_enum('public', 'consent_choice', 'consent_choice enum exists');
SELECT enum_has_labels('public', 'subscription_status', ARRAY['approval_pending'::TEXT COLLATE "C", 'active'::TEXT COLLATE "C", 'past_due'::TEXT COLLATE "C", 'suspended'::TEXT COLLATE "C", 'cancelled'::TEXT COLLATE "C", 'expired'::TEXT COLLATE "C", 'refunded'::TEXT COLLATE "C", 'revoked'::TEXT COLLATE "C"], 'subscription states include server-reconciled lifecycle values');
SELECT enum_has_labels('public', 'payment_event_status', ARRAY['received'::TEXT COLLATE "C", 'verified'::TEXT COLLATE "C", 'processing'::TEXT COLLATE "C", 'processed'::TEXT COLLATE "C", 'quarantined'::TEXT COLLATE "C", 'failed'::TEXT COLLATE "C"], 'payment event states include quarantine and processing outcomes');
SELECT enum_has_labels('public', 'privacy_request_type', ARRAY['export'::TEXT COLLATE "C", 'deletion'::TEXT COLLATE "C"], 'privacy request type is constrained to export or deletion');
SELECT enum_has_labels('public', 'privacy_request_status', ARRAY['requested'::TEXT COLLATE "C", 'in_progress'::TEXT COLLATE "C", 'completed'::TEXT COLLATE "C", 'failed'::TEXT COLLATE "C", 'cancelled'::TEXT COLLATE "C"], 'privacy request states define the worker lifecycle');

-- RLS on each P2-03 relation (8 assertions).
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.reports'::regclass), 'RLS enabled on reports');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.moderation_cases'::regclass), 'RLS enabled on moderation_cases');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.subscriptions'::regclass), 'RLS enabled on subscriptions');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.entitlements'::regclass), 'RLS enabled on entitlements');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.payment_events'::regclass), 'RLS enabled on payment_events');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.consent_records'::regclass), 'RLS enabled on consent_records');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.privacy_requests'::regclass), 'RLS enabled on privacy_requests');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.audit_events'::regclass), 'RLS enabled on audit_events');

-- High-value indexes and idempotency contract.
SELECT has_index('public', 'reports', 'idx_reports_status_severity_created_at', 'report triage index exists');
SELECT has_index('public', 'moderation_cases', 'idx_moderation_cases_status_created_at', 'moderation queue index exists');
SELECT has_index('public', 'subscriptions', 'uq_subscriptions_provider_subscription', 'provider subscription reference is unique');
SELECT has_index('public', 'entitlements', 'uq_entitlements_user_key', 'one entitlement row per user/key');
SELECT has_index('public', 'payment_events', 'uq_payment_events_provider_event', 'provider event idempotency index exists');
SELECT has_index('public', 'payment_events', 'idx_payment_events_financial_reconciliation', 'amount/currency reconciliation index exists');
SELECT has_index('public', 'consent_records', 'idx_consent_records_user_recorded_at', 'consent history lookup index exists');
SELECT has_index('public', 'privacy_requests', 'idx_privacy_requests_status_created_at', 'privacy worker queue index exists');
SELECT has_index('public', 'privacy_requests', 'uq_privacy_requests_user_idempotency', 'privacy requests have a per-user idempotency index');
SELECT has_index('public', 'audit_events', 'idx_audit_events_target_created_at', 'audit target lookup index exists');
SELECT has_column('public', 'payment_events', 'provider_event_id', 'payment events retain the provider event id');
SELECT has_column('public', 'payment_events', 'amount', 'payment events retain amount for reconciliation');
SELECT has_column('public', 'payment_events', 'currency', 'payment events retain currency for reconciliation');

-- No client writes to moderation, subscription/entitlement authority, events or audit.
SELECT ok(
 NOT pg_catalog.has_table_privilege('anon', 'public.payment_events', 'SELECT')
 AND NOT pg_catalog.has_table_privilege('authenticated', 'public.payment_events', 'INSERT')
 AND NOT pg_catalog.has_table_privilege('authenticated', 'public.payment_events', 'UPDATE')
 AND NOT pg_catalog.has_table_privilege('authenticated', 'public.payment_events', 'DELETE'),
 'client roles cannot read or mutate payment event records'
);
SELECT ok(
 NOT pg_catalog.has_table_privilege('authenticated', 'public.audit_events', 'SELECT')
 AND NOT pg_catalog.has_table_privilege('authenticated', 'public.audit_events', 'INSERT')
 AND NOT pg_catalog.has_table_privilege('authenticated', 'public.audit_events', 'UPDATE')
 AND NOT pg_catalog.has_table_privilege('authenticated', 'public.audit_events', 'DELETE'),
 'client roles have no audit event access'
);
-- SELECT is granted to authenticated in P2-04, but RLS must hide every case
-- from a normal user. Test effective row visibility rather than table privilege.
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';
SELECT is_empty(
  $$SELECT id FROM public.moderation_cases$$,
  'normal authenticated user cannot read moderation cases under RLS'
);
RESET ROLE;
RESET "request.jwt.claims";
SELECT ok(
 NOT pg_catalog.has_table_privilege('authenticated', 'public.reports', 'UPDATE')
 AND NOT pg_catalog.has_table_privilege('authenticated', 'public.reports', 'DELETE'),
 'client report records are immutable after submission'
);
SELECT ok(
 NOT pg_catalog.has_table_privilege('authenticated', 'public.subscriptions', 'INSERT')
 AND NOT pg_catalog.has_table_privilege('authenticated', 'public.subscriptions', 'UPDATE')
 AND NOT pg_catalog.has_table_privilege('authenticated', 'public.subscriptions', 'DELETE'),
 'clients cannot change provider subscription state'
);
SELECT ok(
 NOT pg_catalog.has_table_privilege('authenticated', 'public.entitlements', 'INSERT')
 AND NOT pg_catalog.has_table_privilege('authenticated', 'public.entitlements', 'UPDATE')
 AND NOT pg_catalog.has_table_privilege('authenticated', 'public.entitlements', 'DELETE'),
 'clients cannot mint, change or revoke entitlements'
);
SELECT ok(
 NOT pg_catalog.has_table_privilege('authenticated', 'public.consent_records', 'UPDATE')
 AND NOT pg_catalog.has_table_privilege('authenticated', 'public.consent_records', 'DELETE')
 AND NOT pg_catalog.has_table_privilege('authenticated', 'public.privacy_requests', 'UPDATE'),
 'consent is append-only and privacy request progress is worker-controlled'
);

-- Idempotency, financial value shape, and server-only processing state.
SELECT throws_ok(
 $$INSERT INTO public.payment_events (provider, provider_event_id, event_type, amount, currency) VALUES ('paypal', 'p203-event-main', 'PAYMENT.SALE.COMPLETED', 599.00, 'PHP')$$,
 '23505', NULL, 'duplicate provider/event id is rejected'
);
SELECT throws_ok(
 $$INSERT INTO public.payment_events (provider, provider_event_id, event_type, amount, currency) VALUES ('paypal', 'p203-event-bad-currency', 'PAYMENT.SALE.COMPLETED', 599.00, NULL)$$,
 '23514', NULL, 'payment amount and currency must be present together'
);
SELECT throws_ok(
 $$INSERT INTO public.payment_events (provider, provider_event_id, event_type, amount, currency, status, provider_verified) VALUES ('paypal', 'p203-unverified-event', 'PAYMENT.SALE.COMPLETED', 599.00, 'PHP', 'verified', FALSE)$$,
 '23514', NULL, 'verified payment event state requires provider verification'
);
SELECT ok(
 (SELECT amount = 599.00 AND currency::TEXT COLLATE "C" = 'PHP'::TEXT COLLATE "C"
    FROM public.payment_events WHERE provider_event_id::TEXT COLLATE "C" = 'p203-event-main'::TEXT COLLATE "C"),
 'payment event preserves amount and currency for later reconciliation'
);
SELECT ok(
 (SELECT subscription_id IS NOT NULL FROM public.payment_events WHERE provider_event_id::TEXT COLLATE "C" = 'p203-event-main'::TEXT COLLATE "C"),
 'payment event can reference its subscription'
);
SELECT ok(
 (SELECT retention_until IS NULL AND legal_hold IS NULL FROM public.payment_events WHERE provider_event_id::TEXT COLLATE "C" = 'p203-event-main'::TEXT COLLATE "C"),
 'retention deadline and legal hold remain unassessed until approved'
);

-- Report ownership/visibility and no client moderation access.
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';
SELECT is((SELECT count(*)::INTEGER FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p203-test-report'::TEXT COLLATE "C"), 1, 'reporter can read their own report');
SELECT is_empty($$SELECT id FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p203-retention-report'::TEXT COLLATE "C"$$, 'reporter cannot read another account report');
SELECT throws_ok(
 $$INSERT INTO public.reports (reporter_id, reported_user_id, category, context_summary) VALUES ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000023', 'safety', 'spoofed reporter')$$,
 '42501', NULL, 'client cannot submit a report using another reporter id'
);
SELECT throws_ok(
 $$SELECT public.submit_report(NULL, 'safety', 'missing target')$$,
 '22023', 'reported_user_and_category_required', 'report submission requires a reported account'
);
SELECT throws_ok(
 $$INSERT INTO public.moderation_cases (status) VALUES ('open')$$,
 '42501', NULL, 'client cannot create moderation cases'
);
SELECT throws_ok(
 $$INSERT INTO public.payment_events (provider, provider_event_id, event_type, amount, currency) VALUES ('paypal', 'p203-client-event', 'PAYMENT.SALE.COMPLETED', 1.00, 'PHP')$$,
 '42501', NULL, 'client cannot insert provider payment events'
);
SELECT throws_ok(
 $$INSERT INTO public.entitlements (user_id, entitlement_key, status) VALUES ('00000000-0000-0000-0000-000000000021', 'forged-premium', 'active')$$,
 '42501', NULL, 'client cannot grant itself an entitlement'
);
SELECT throws_ok(
 $$UPDATE public.subscriptions SET status = 'active' WHERE provider_subscription_id::TEXT COLLATE "C" = 'p203-sub-main'::TEXT COLLATE "C"$$,
 '42501', NULL, 'client cannot activate a subscription by changing its status'
);
SELECT is((SELECT count(*)::INTEGER FROM public.consent_records WHERE consent_key::TEXT COLLATE "C" = 'p203-test-consent'::TEXT COLLATE "C"), 1, 'consent owner can read own consent history');
SELECT is_empty($$SELECT id FROM public.consent_records WHERE consent_key::TEXT COLLATE "C" = 'p203-retention-consent'::TEXT COLLATE "C"$$, 'consent owner cannot read another account consent history');
SELECT throws_ok(
 $$UPDATE public.consent_records SET choice = 'withdrawn' WHERE consent_key::TEXT COLLATE "C" = 'p203-test-consent'::TEXT COLLATE "C"$$,
 '42501', NULL, 'consent history cannot be edited by the client'
);
SELECT is((SELECT count(*)::INTEGER FROM public.subscriptions WHERE provider_subscription_id::TEXT COLLATE "C" = 'p203-sub-main'::TEXT COLLATE "C"), 1, 'subscription owner can read their subscription');
SELECT is_empty($$SELECT id FROM public.subscriptions WHERE provider_subscription_id::TEXT COLLATE "C" = 'p203-sub-retention'::TEXT COLLATE "C"$$, 'subscription owner cannot read another account subscription');
SELECT is((SELECT count(*)::INTEGER FROM public.entitlements WHERE entitlement_key::TEXT COLLATE "C" = 'p203-test-premium'::TEXT COLLATE "C"), 1, 'entitlement owner can read their own entitlement');
SELECT is_empty($$SELECT id FROM public.entitlements WHERE user_id = '00000000-0000-0000-0000-000000000025' AND entitlement_key::TEXT COLLATE "C" = 'p203-test-premium'::TEXT COLLATE "C"$$, 'entitlement owner cannot read another account entitlement');
SELECT is((SELECT count(*)::INTEGER FROM public.privacy_requests WHERE idempotency_key = '00000000-0000-0000-0000-000000000031'), 1, 'privacy request owner can read their request');
SELECT is_empty($$SELECT id FROM public.privacy_requests WHERE idempotency_key = '00000000-0000-0000-0000-000000000035'$$, 'privacy request owner cannot read another account request');
SELECT throws_ok(
 $$INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key) VALUES ('00000000-0000-0000-0000-000000000021', 'export', '00000000-0000-0000-0000-000000000031')$$,
 '23505', NULL, 'privacy request idempotency key rejects duplicate submission'
);
SELECT throws_ok(
 $$UPDATE public.privacy_requests SET status = 'in_progress' WHERE idempotency_key = '00000000-0000-0000-0000-000000000031'$$,
 '42501', NULL, 'client cannot advance privacy request workflow state'
);
RESET ROLE;
RESET "request.jwt.claims";

-- Provider event processing is server-only and provider facts remain immutable.
SET ROLE service_role;
SELECT lives_ok(
 $$UPDATE public.payment_events SET status = 'verified', provider_verified = TRUE WHERE provider_event_id::TEXT COLLATE "C" = 'p203-event-main'::TEXT COLLATE "C"$$,
 'trusted server can advance payment verification state'
);
SELECT throws_ok(
 $$UPDATE public.payment_events SET provider_event_id = 'p203-event-mutated' WHERE provider_event_id::TEXT COLLATE "C" = 'p203-event-main'::TEXT COLLATE "C"$$,
 '42501', NULL, 'trusted server cannot rewrite provider event id through narrow grants'
);
SELECT throws_ok(
 $$UPDATE public.payment_events SET status = 'processed', provider_verified = TRUE, processed_at = now() WHERE provider_event_id::TEXT COLLATE "C" = 'p203-event-main'::TEXT COLLATE "C"$$,
 '23514', NULL, 'payment event cannot skip the processing state'
);
SELECT throws_ok(
 $$UPDATE public.audit_events SET action = 'mutated' WHERE action::TEXT COLLATE "C" = 'p203-test-event'::TEXT COLLATE "C"$$,
 '42501', NULL, 'server role cannot update immutable audit records'
);
SELECT throws_ok(
 $$DELETE FROM public.audit_events WHERE action::TEXT COLLATE "C" = 'p203-test-event'::TEXT COLLATE "C"$$,
 '42501', NULL, 'server role cannot delete immutable audit records'
);
RESET ROLE;

-- The worker may advance requests along the explicit state machine; completed
-- requests are terminal and carry a completion timestamp.
UPDATE public.privacy_requests
   SET status = 'in_progress'
 WHERE idempotency_key = '00000000-0000-0000-0000-000000000031';
SELECT is((SELECT status::TEXT COLLATE "C" FROM public.privacy_requests WHERE idempotency_key = '00000000-0000-0000-0000-000000000031'), 'in_progress'::TEXT COLLATE "C", 'privacy request moves from requested to in_progress');
UPDATE public.privacy_requests
   SET status = 'completed', completion_metadata = '{"outcome":"synthetic-test"}'::jsonb
 WHERE idempotency_key = '00000000-0000-0000-0000-000000000031';
SELECT ok((SELECT status = 'completed'::public.privacy_request_status AND completed_at IS NOT NULL FROM public.privacy_requests WHERE idempotency_key = '00000000-0000-0000-0000-000000000031'), 'completion transition sets completed_at');
SELECT throws_ok(
 $$UPDATE public.privacy_requests SET status = 'in_progress' WHERE idempotency_key = '00000000-0000-0000-0000-000000000031'$$,
 '23514', NULL, 'completed privacy request cannot be reopened'
);

-- Delete one synthetic account: safety, financial, consent, privacy and audit
-- history must survive with direct identity foreign keys set to NULL. Derived
-- entitlements are deleted because access must not survive account deletion.
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000025';
SELECT ok(EXISTS (SELECT 1 FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p203-retention-report'::TEXT COLLATE "C" AND reporter_id IS NULL), 'report history survives account deletion with reporter id nulled');
SELECT ok(EXISTS (SELECT 1 FROM public.subscriptions WHERE provider_subscription_id::TEXT COLLATE "C" = 'p203-sub-retention'::TEXT COLLATE "C" AND user_id IS NULL), 'subscription history survives account deletion with owner id nulled');
SELECT ok(EXISTS (SELECT 1 FROM public.payment_events WHERE provider_event_id::TEXT COLLATE "C" = 'p203-event-retention'::TEXT COLLATE "C" AND user_id IS NULL), 'payment event survives account deletion with user id nulled');
SELECT ok(EXISTS (SELECT 1 FROM public.consent_records WHERE consent_key::TEXT COLLATE "C" = 'p203-retention-consent'::TEXT COLLATE "C" AND user_id IS NULL), 'consent evidence survives account deletion with user id nulled');
SELECT ok(EXISTS (SELECT 1 FROM public.privacy_requests WHERE idempotency_key = '00000000-0000-0000-0000-000000000035' AND user_id IS NULL), 'privacy request evidence survives account deletion with user id nulled');
SELECT ok(EXISTS (SELECT 1 FROM public.audit_events WHERE action::TEXT COLLATE "C" = 'p203-retention-event'::TEXT COLLATE "C" AND actor_id IS NULL), 'audit trail survives account deletion with actor id nulled');
SELECT is((SELECT count(*)::INTEGER FROM public.entitlements WHERE entitlement_key::TEXT COLLATE "C" = 'p203-test-premium'::TEXT COLLATE "C" AND user_id IS NULL), 0, 'derived entitlement does not retain a deleted profile');
SELECT ok((SELECT retention_until IS NULL AND legal_hold IS NULL FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p203-retention-report'::TEXT COLLATE "C"), 'unknown retention and legal-hold decisions remain explicitly unassessed');

-- Cleanup run-specific synthetic records. Audit/consent triggers allow only
-- privileged database maintenance to purge; these tests do not run as clients.
DELETE FROM public.audit_events
 WHERE (metadata ->> 'fixture')::TEXT COLLATE "C" = 'p2-03'::TEXT COLLATE "C";
DELETE FROM public.consent_records
 WHERE consent_key::TEXT COLLATE "C" IN ('p203-test-consent'::TEXT COLLATE "C", 'p203-retention-consent'::TEXT COLLATE "C");
DELETE FROM public.payment_events
 WHERE provider_event_id::TEXT COLLATE "C" IN ('p203-event-main'::TEXT COLLATE "C", 'p203-event-retention'::TEXT COLLATE "C");
DELETE FROM public.privacy_requests
 WHERE idempotency_key IN (
   '00000000-0000-0000-0000-000000000031',
   '00000000-0000-0000-0000-000000000035'
 );
DELETE FROM public.entitlements
 WHERE entitlement_key::TEXT COLLATE "C" = 'p203-test-premium'::TEXT COLLATE "C";
DELETE FROM public.moderation_cases
 WHERE report_id IN (SELECT id FROM public.reports WHERE context_summary::TEXT COLLATE "C" IN ('p203-test-report'::TEXT COLLATE "C", 'p203-retention-report'::TEXT COLLATE "C"));
DELETE FROM public.reports
 WHERE context_summary::TEXT COLLATE "C" IN ('p203-test-report'::TEXT COLLATE "C", 'p203-retention-report'::TEXT COLLATE "C");
DELETE FROM public.subscriptions
 WHERE provider_subscription_id::TEXT COLLATE "C" IN ('p203-sub-main'::TEXT COLLATE "C", 'p203-sub-retention'::TEXT COLLATE "C");
DELETE FROM auth.users
 WHERE id IN (
   '00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000022',
   '00000000-0000-0000-0000-000000000023',
   '00000000-0000-0000-0000-000000000024'
 );
SELECT * FROM finish();
