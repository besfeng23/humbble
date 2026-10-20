-- P2-04 access-control matrix for public tables and Supabase Storage.
-- The moderator is simulated only through trusted JWT app_metadata; user_metadata
-- or a profile field is never an authorization source. All synthetic state rolls back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(65);

-- All 19 application tables from migrations 0001-0003 must retain RLS.
SELECT ok(NOT EXISTS (
  SELECT 1
    FROM (VALUES
      ('profiles'::TEXT COLLATE "C"), ('profile_photos'::TEXT COLLATE "C"),
      ('user_preferences'::TEXT COLLATE "C"), ('verification_requests'::TEXT COLLATE "C"),
      ('swipes'::TEXT COLLATE "C"), ('daily_swipe_quotas'::TEXT COLLATE "C"),
      ('matches'::TEXT COLLATE "C"), ('conversations'::TEXT COLLATE "C"),
      ('conversation_participants'::TEXT COLLATE "C"), ('messages'::TEXT COLLATE "C"),
      ('blocks'::TEXT COLLATE "C"), ('reports'::TEXT COLLATE "C"),
      ('moderation_cases'::TEXT COLLATE "C"), ('subscriptions'::TEXT COLLATE "C"),
      ('entitlements'::TEXT COLLATE "C"), ('payment_events'::TEXT COLLATE "C"),
      ('consent_records'::TEXT COLLATE "C"), ('privacy_requests'::TEXT COLLATE "C"),
      ('audit_events'::TEXT COLLATE "C")
    ) AS expected(table_name)
    LEFT JOIN pg_catalog.pg_class AS c
      ON c.relname::TEXT COLLATE "C" = expected.table_name
     AND c.relnamespace = 'public'::regnamespace
   WHERE c.oid IS NULL OR NOT c.relrowsecurity
), 'RLS is enabled on every P2-01 through P2-03 public table');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'storage.objects'::regclass), 'RLS is enabled on Storage objects');
SELECT ok((SELECT NOT b."public" AND b.file_size_limit = 5242880 AND array_to_string(b.allowed_mime_types, ',')::TEXT COLLATE "C" = 'image/jpeg,image/png,image/webp'::TEXT COLLATE "C" FROM storage.buckets AS b WHERE b.id::TEXT COLLATE "C" = 'profile_photos'::TEXT COLLATE "C"), 'profile_photos bucket is private with a 5 MiB image MIME/size allowlist');
SELECT ok((SELECT NOT b."public" AND b.file_size_limit = 10485760 AND array_to_string(b.allowed_mime_types, ',')::TEXT COLLATE "C" = 'image/jpeg,image/png,image/webp'::TEXT COLLATE "C" FROM storage.buckets AS b WHERE b.id::TEXT COLLATE "C" = 'verification_artifacts'::TEXT COLLATE "C"), 'verification_artifacts bucket is private with a restricted MIME/size limit');
SELECT is((SELECT count(*)::INTEGER FROM pg_catalog.pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname::TEXT COLLATE "C" IN ('p2_04_profile_photos_select_owner'::TEXT COLLATE "C", 'p2_04_profile_photos_insert_owner'::TEXT COLLATE "C", 'p2_04_profile_photos_update_owner'::TEXT COLLATE "C", 'p2_04_profile_photos_delete_owner'::TEXT COLLATE "C")), 4, 'four owner-folder policies protect profile photo objects');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname::TEXT COLLATE "C" = 'p2_04_block_verification_artifacts_client_access'::TEXT COLLATE "C" AND NOT polpermissive), 'verification artifacts have a restrictive client-deny policy');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname::TEXT COLLATE "C" LIKE 'p2_04_verification_artifacts_%'::TEXT COLLATE "C" AND polpermissive), 'no permissive client policy grants verification artifact access');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_policy AS p
   WHERE p.polrelid = 'public.profiles'::regclass
     AND p.polcmd IN ('r', '*')
     AND (pg_catalog.array_position(p.polroles, 0::OID) IS NOT NULL OR (SELECT oid FROM pg_catalog.pg_roles WHERE rolname::TEXT COLLATE "C" = 'anon'::TEXT COLLATE "C") = ANY(p.polroles))
), 'no anon or PUBLIC SELECT policy exposes profile fields');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname::TEXT COLLATE "C" = 'private'::TEXT COLLATE "C" AND p.proname::TEXT COLLATE "C" = 'is_trusted_moderator'::TEXT COLLATE "C"), 'trusted moderator check is implemented in the private schema');

-- Synthetic identities and fixture rows. UUIDs 0041-0045 are reserved by this test.
DELETE FROM storage.objects
 WHERE name::TEXT COLLATE "C" LIKE ANY (ARRAY[
   '00000000-0000-0000-0000-000000000041/%'::TEXT COLLATE "C",
   '00000000-0000-0000-0000-000000000042/%'::TEXT COLLATE "C"
 ]);
DELETE FROM public.audit_events WHERE action::TEXT COLLATE "C" = 'p204-retained-audit'::TEXT COLLATE "C";
DELETE FROM public.consent_records WHERE consent_key::TEXT COLLATE "C" = 'p204-consent'::TEXT COLLATE "C";
DELETE FROM public.payment_events WHERE provider_event_id::TEXT COLLATE "C" IN ('p204-payment-a'::TEXT COLLATE "C", 'p204-payment-b'::TEXT COLLATE "C");
DELETE FROM public.privacy_requests WHERE idempotency_key IN ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000042');
DELETE FROM public.entitlements WHERE entitlement_key::TEXT COLLATE "C" = 'p204-premium'::TEXT COLLATE "C";
DELETE FROM public.moderation_cases WHERE report_id IN (SELECT id FROM public.reports WHERE context_summary::TEXT COLLATE "C" IN ('p204-report-a'::TEXT COLLATE "C", 'p204-report-b'::TEXT COLLATE "C"));
DELETE FROM public.reports WHERE context_summary::TEXT COLLATE "C" IN ('p204-report-a'::TEXT COLLATE "C", 'p204-report-b'::TEXT COLLATE "C");
DELETE FROM public.subscriptions WHERE provider_subscription_id::TEXT COLLATE "C" IN ('p204-sub-a'::TEXT COLLATE "C", 'p204-sub-b'::TEXT COLLATE "C");
DELETE FROM public.verification_requests WHERE provider_session_id::TEXT COLLATE "C" = 'p204-verification-b'::TEXT COLLATE "C";
DELETE FROM public.profile_photos WHERE storage_path::TEXT COLLATE "C" LIKE ANY (ARRAY[
  '00000000-0000-0000-0000-000000000041/%'::TEXT COLLATE "C",
  '00000000-0000-0000-0000-000000000042/%'::TEXT COLLATE "C"
]);
DELETE FROM auth.users WHERE id IN (
  '00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000042',
  '00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000044',
  '00000000-0000-0000-0000-000000000045'
);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES
 ('00000000-0000-0000-0000-000000000041', 'authenticated', 'authenticated', 'p204-a@example.test', now(), now()),
 ('00000000-0000-0000-0000-000000000042', 'authenticated', 'authenticated', 'p204-b@example.test', now(), now()),
 ('00000000-0000-0000-0000-000000000043', 'authenticated', 'authenticated', 'p204-c@example.test', now(), now()),
 ('00000000-0000-0000-0000-000000000044', 'authenticated', 'authenticated', 'p204-d@example.test', now(), now()),
 ('00000000-0000-0000-0000-000000000045', 'authenticated', 'authenticated', 'p204-moderator@example.test', now(), now());
INSERT INTO public.profiles (id, display_name, birth_date, verification_status, is_discoverable, is_suspended)
VALUES
 ('00000000-0000-0000-0000-000000000041', 'P4 Alpha', DATE '1990-01-01', 'verified', TRUE, FALSE),
 ('00000000-0000-0000-0000-000000000042', 'P4 Bravo', DATE '1990-01-02', 'verified', TRUE, FALSE),
 ('00000000-0000-0000-0000-000000000043', 'P4 Charlie', DATE '1990-01-03', 'verified', TRUE, FALSE),
 ('00000000-0000-0000-0000-000000000044', 'P4 Delta', DATE '1990-01-04', 'verified', TRUE, FALSE),
 ('00000000-0000-0000-0000-000000000045', 'P4 Moderator', DATE '1990-01-05', 'verified', FALSE, FALSE);
INSERT INTO public.user_preferences (user_id) VALUES
 ('00000000-0000-0000-0000-000000000041'), ('00000000-0000-0000-0000-000000000042');
INSERT INTO public.profile_photos (user_id, storage_path, position) VALUES
 ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000041/one.jpg', 0),
 ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000042/one.jpg', 0);
INSERT INTO public.verification_requests (user_id, provider, provider_session_id, status)
VALUES ('00000000-0000-0000-0000-000000000042', 'fixture-provider', 'p204-verification-b', 'pending');
INSERT INTO public.swipes (actor_id, target_id, direction) VALUES
 ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000042', 'like'),
 ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000041', 'like');
INSERT INTO public.reports (reporter_id, reported_user_id, category, context_summary)
VALUES
 ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000042', 'safety', 'p204-report-a'),
 ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000041', 'harassment', 'p204-report-b');
INSERT INTO public.moderation_cases (report_id, assigned_moderator_id, status)
SELECT id, '00000000-0000-0000-0000-000000000045', 'open'
FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p204-report-a'::TEXT COLLATE "C";
INSERT INTO public.subscriptions (user_id, provider, provider_subscription_id, provider_plan_id, status)
VALUES
 ('00000000-0000-0000-0000-000000000041', 'p204', 'p204-sub-a', 'p204-plan', 'approval_pending'),
 ('00000000-0000-0000-0000-000000000042', 'p204', 'p204-sub-b', 'p204-plan', 'approval_pending');
INSERT INTO public.entitlements (user_id, entitlement_key, status)
VALUES
 ('00000000-0000-0000-0000-000000000041', 'p204-premium', 'inactive'),
 ('00000000-0000-0000-0000-000000000042', 'p204-premium', 'inactive');
INSERT INTO public.payment_events (provider, provider_event_id, event_type, user_id, amount, currency)
VALUES
 ('p204', 'p204-payment-a', 'TEST.EVENT', '00000000-0000-0000-0000-000000000041', 599.00, 'PHP'),
 ('p204', 'p204-payment-b', 'TEST.EVENT', '00000000-0000-0000-0000-000000000042', 599.00, 'PHP');
INSERT INTO public.consent_records (user_id, consent_key, version, choice, source)
VALUES
 ('00000000-0000-0000-0000-000000000041', 'p204-consent', 'v1', 'granted', 'test'),
 ('00000000-0000-0000-0000-000000000042', 'p204-consent', 'v1', 'granted', 'test');
INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key)
VALUES
 ('00000000-0000-0000-0000-000000000041', 'export', '00000000-0000-0000-0000-000000000041'),
 ('00000000-0000-0000-0000-000000000042', 'deletion', '00000000-0000-0000-0000-000000000042');
INSERT INTO public.audit_events (actor_id, action, metadata)
VALUES ('00000000-0000-0000-0000-000000000041', 'p204-retained-audit', '{"fixture":"p2-04"}'::JSONB);
INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES
 ('profile_photos', '00000000-0000-0000-0000-000000000041/one.jpg', '00000000-0000-0000-0000-000000000041', '{"mimetype":"image/jpeg","size":1024}'::JSONB),
 ('profile_photos', '00000000-0000-0000-0000-000000000042/one.jpg', '00000000-0000-0000-0000-000000000042', '{"mimetype":"image/jpeg","size":1024}'::JSONB),
 ('verification_artifacts', '00000000-0000-0000-0000-000000000042/provider-evidence.jpg', '00000000-0000-0000-0000-000000000042', '{"mimetype":"image/jpeg","size":1024}'::JSONB);

-- Anonymous sessions cannot read any private application rows or Storage objects.
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';
SELECT throws_ok($$SELECT id FROM public.profiles$$, '42501', NULL, 'anon cannot read profiles');
SELECT throws_ok($$SELECT user_id FROM public.user_preferences$$, '42501', NULL, 'anon cannot read preferences');
SELECT throws_ok($$SELECT id FROM public.conversations$$, '42501', NULL, 'anon cannot read conversations');
SELECT throws_ok($$SELECT name FROM storage.objects$$, '42501', NULL, 'anon cannot read private media');
SELECT throws_ok($$SELECT id FROM public.payment_events$$, '42501', NULL, 'anon cannot read payment events');
SELECT throws_ok($$SELECT id FROM public.audit_events$$, '42501', NULL, 'anon cannot read audit records');
RESET ROLE;
RESET "request.jwt.claims";

-- User A: self-only profiles, preferences and consent; participant-only messages;
-- own object folder only; no client access to provider evidence or payment/audit facts.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000041","role":"authenticated"}';
SELECT is((SELECT count(*)::INTEGER FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000041'), 1, 'user A reads own private profile');
SELECT is_empty($$SELECT id FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000042'$$, 'user A cannot read user B profile or birth date');
SELECT is((SELECT count(*)::INTEGER FROM public.user_preferences WHERE user_id = '00000000-0000-0000-0000-000000000041'), 1, 'user A reads own preferences');
SELECT is_empty($$SELECT user_id FROM public.user_preferences WHERE user_id = '00000000-0000-0000-0000-000000000042'$$, 'user A cannot read user B preferences');
SELECT is((SELECT count(*)::INTEGER FROM public.profile_photos WHERE user_id = '00000000-0000-0000-0000-000000000041'), 1, 'user A reads own photo metadata');
SELECT is_empty($$SELECT id FROM public.profile_photos WHERE user_id = '00000000-0000-0000-0000-000000000042'$$, 'user A cannot read user B photo metadata');
SELECT is((SELECT count(*)::INTEGER FROM storage.objects WHERE bucket_id::TEXT COLLATE "C" = 'profile_photos'::TEXT COLLATE "C"), 1, 'user A can list only objects in own photo folder');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner_id, metadata) VALUES ('profile_photos', '00000000-0000-0000-0000-000000000041/two.png', '00000000-0000-0000-0000-000000000041', '{"mimetype":"image/png","size":512}'::JSONB)$$, 'user A can upload within own photo folder');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner_id, metadata) VALUES ('profile_photos', '00000000-0000-0000-0000-000000000042/forbidden.png', '00000000-0000-0000-0000-000000000041', '{"mimetype":"image/png","size":512}'::JSONB)$$, '42501', NULL, 'user A cannot upload into user B photo folder');
SELECT is_empty($$SELECT name FROM storage.objects WHERE bucket_id::TEXT COLLATE "C" = 'verification_artifacts'::TEXT COLLATE "C"$$, 'user A cannot read verification artifacts even with a known path');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner_id, metadata) VALUES ('verification_artifacts', '00000000-0000-0000-0000-000000000041/forbidden.jpg', '00000000-0000-0000-0000-000000000041', '{"mimetype":"image/jpeg","size":128}'::JSONB)$$, '42501', NULL, 'user A cannot upload verification artifacts');
SELECT is((SELECT count(*)::INTEGER FROM public.conversations), 1, 'user A can read conversation as a participant');
SELECT is((SELECT count(*)::INTEGER FROM public.messages), 0, 'user A sees no messages before sending one');
SELECT lives_ok($$INSERT INTO public.messages (conversation_id, sender_id, body) SELECT c.id, auth.uid(), 'p204 message' FROM public.conversations c$$, 'participant can send in own active conversation');
SELECT is((SELECT count(*)::INTEGER FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p204-report-a'::TEXT COLLATE "C"), 1, 'user A reads own report');
SELECT is_empty($$SELECT id FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p204-report-b'::TEXT COLLATE "C"$$, 'user A cannot read user B report without moderator claim');
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000041","role":"authenticated","user_metadata":{"role":"moderator"}}';
SELECT is_empty($$SELECT id FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p204-report-b'::TEXT COLLATE "C"$$, 'user-editable user_metadata cannot grant moderator access');
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000041","role":"authenticated"}';
SELECT is((SELECT count(*)::INTEGER FROM public.subscriptions WHERE provider_subscription_id::TEXT COLLATE "C" = 'p204-sub-a'::TEXT COLLATE "C"), 1, 'user A reads own subscription');
SELECT is_empty($$SELECT id FROM public.subscriptions WHERE provider_subscription_id::TEXT COLLATE "C" = 'p204-sub-b'::TEXT COLLATE "C"$$, 'user A cannot read user B subscription');
SELECT is((SELECT count(*)::INTEGER FROM public.entitlements WHERE entitlement_key::TEXT COLLATE "C" = 'p204-premium'::TEXT COLLATE "C"), 1, 'user A reads own entitlement');
SELECT is_empty($$SELECT id FROM public.entitlements WHERE user_id = '00000000-0000-0000-0000-000000000042' AND entitlement_key::TEXT COLLATE "C" = 'p204-premium'::TEXT COLLATE "C"$$, 'user A cannot read user B entitlement');
SELECT is((SELECT count(*)::INTEGER FROM public.consent_records WHERE user_id = '00000000-0000-0000-0000-000000000041'), 1, 'user A reads own consent record');
SELECT is_empty($$SELECT id FROM public.consent_records WHERE user_id = '00000000-0000-0000-0000-000000000042'$$, 'user A cannot read user B consent history');
SELECT is((SELECT count(*)::INTEGER FROM public.privacy_requests WHERE user_id = '00000000-0000-0000-0000-000000000041'), 1, 'user A reads own privacy request');
SELECT is_empty($$SELECT id FROM public.privacy_requests WHERE user_id = '00000000-0000-0000-0000-000000000042'$$, 'user A cannot read user B privacy request');
SELECT throws_ok($$SELECT id FROM public.payment_events$$, '42501', NULL, 'user A cannot read payment events');
SELECT throws_ok($$SELECT id FROM public.audit_events$$, '42501', NULL, 'user A cannot read audit events');
SELECT is_empty($$SELECT id FROM public.moderation_cases$$, 'regular user cannot read moderation cases');
SELECT throws_ok($$UPDATE public.entitlements SET status = 'active' WHERE user_id = auth.uid()$$, '42501', NULL, 'user A cannot grant or activate own entitlement');
RESET ROLE;
RESET "request.jwt.claims";

-- User B has the mirror image of A's owner/participant restrictions.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000042","role":"authenticated"}';
SELECT is((SELECT count(*)::INTEGER FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000042'), 1, 'user B reads own private profile');
SELECT is_empty($$SELECT id FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000041'$$, 'user B cannot read user A profile');
SELECT is((SELECT count(*)::INTEGER FROM public.user_preferences WHERE user_id = '00000000-0000-0000-0000-000000000042'), 1, 'user B reads own preferences');
SELECT is_empty($$SELECT user_id FROM public.user_preferences WHERE user_id = '00000000-0000-0000-0000-000000000041'$$, 'user B cannot read user A preferences');
SELECT is((SELECT count(*)::INTEGER FROM storage.objects WHERE bucket_id::TEXT COLLATE "C" = 'profile_photos'::TEXT COLLATE "C"), 1, 'user B lists only own photo folder');
SELECT is((SELECT count(*)::INTEGER FROM public.messages), 1, 'user B reads participant message');
SELECT is((SELECT count(*)::INTEGER FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p204-report-b'::TEXT COLLATE "C"), 1, 'user B reads own report');
SELECT is_empty($$SELECT id FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p204-report-a'::TEXT COLLATE "C"$$, 'user B cannot read user A report without moderator claim');
RESET ROLE;
RESET "request.jwt.claims";

-- User C is neither participant: no conversation or message rows are visible.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000043","role":"authenticated"}';
SELECT is((SELECT count(*)::INTEGER FROM public.conversations), 0, 'non-participant user C cannot read user A/B conversation');
SELECT is_empty($$SELECT id FROM public.messages$$, 'non-participant user C cannot read user A/B messages');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner_id, metadata) VALUES ('profile_photos', '00000000-0000-0000-0000-000000000041/forbidden-c.png', '00000000-0000-0000-0000-000000000043', '{"mimetype":"image/png","size":128}'::JSONB)$$, '42501', NULL, 'user C cannot upload into user A photo folder');
RESET ROLE;
RESET "request.jwt.claims";
RESET "request.jwt.claims";

-- A trusted moderator claim comes from app_metadata, not user-editable metadata.
-- It permits report/case reads only; payment, audit and verification data remain private.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000045","role":"authenticated","app_metadata":{"role":"moderator"}}';
SELECT is((SELECT count(*)::INTEGER FROM public.reports WHERE context_summary::TEXT COLLATE "C" IN ('p204-report-a'::TEXT COLLATE "C", 'p204-report-b'::TEXT COLLATE "C")), 2, 'trusted moderator can read reports from both reporters');
SELECT is((SELECT count(*)::INTEGER FROM public.moderation_cases), 1, 'trusted moderator can read moderation cases');
SELECT throws_ok($$UPDATE public.reports SET status = 'closed' WHERE context_summary::TEXT COLLATE "C" = 'p204-report-a'::TEXT COLLATE "C"$$, '42501', NULL, 'moderator cannot bypass server-owned report update grants');
SELECT throws_ok($$UPDATE public.moderation_cases SET status = 'closed', closed_at = now()$$, '42501', NULL, 'moderator cannot directly change case workflow');
SELECT throws_ok($$SELECT id FROM public.payment_events$$, '42501', NULL, 'moderator cannot read payment events');
SELECT is_empty($$SELECT name FROM storage.objects WHERE bucket_id::TEXT COLLATE "C" = 'verification_artifacts'::TEXT COLLATE "C"$$, 'moderator cannot read verification artifacts');
RESET ROLE;
RESET "request.jwt.claims";

-- The trusted service role handles sensitive server workflows and artifacts.
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claims" = '{"role":"service_role"}';
SELECT is((SELECT count(*)::INTEGER FROM public.payment_events WHERE provider_event_id::TEXT COLLATE "C" IN ('p204-payment-a'::TEXT COLLATE "C", 'p204-payment-b'::TEXT COLLATE "C")), 2, 'service_role can read payment events');
SELECT is((SELECT count(*)::INTEGER FROM public.audit_events WHERE action::TEXT COLLATE "C" = 'p204-retained-audit'::TEXT COLLATE "C"), 1, 'service_role can read audit events');
SELECT is((SELECT count(*)::INTEGER FROM public.moderation_cases), 1, 'service_role can access moderation cases');
SELECT is((SELECT count(*)::INTEGER FROM storage.objects WHERE bucket_id::TEXT COLLATE "C" = 'verification_artifacts'::TEXT COLLATE "C"), 1, 'service_role can access restricted verification object metadata');
RESET ROLE;
RESET "request.jwt.claims";

SELECT * FROM finish();
ROLLBACK;
