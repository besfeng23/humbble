-- pgTAP tests for P2-01: identity/profile schema, RLS, column locks, age gate,
-- photo limits, and verification metadata minimization.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(55);

-- Tables and enum contract (8 assertions).
SELECT has_table('public', 'profiles', 'profiles table exists');
SELECT has_table('public', 'profile_photos', 'profile_photos table exists');
SELECT has_table('public', 'user_preferences', 'user_preferences table exists');
SELECT has_table('public', 'verification_requests', 'verification_requests table exists');
SELECT has_enum('public', 'verification_state', 'verification_state enum exists');
SELECT enum_has_labels(
  'public', 'verification_state',
  ARRAY['not_started', 'pending', 'verified', 'failed', 'requires_review'],
  'verification_state has the five approved values'
);
SELECT has_enum('public', 'relationship_intention', 'relationship_intention enum exists');
SELECT enum_has_labels(
  'public', 'relationship_intention',
  ARRAY['serious_relationship', 'long_term_dating', 'cultural_connection_and_dating'],
  'relationship_intention has the approved values'
);

-- The verification record has exactly the approved provider-metadata columns.
SELECT results_eq(
  $$
    SELECT column_name::TEXT
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'verification_requests'
     ORDER BY ordinal_position
  $$,
  $$ VALUES
    ('id'::TEXT), ('user_id'::TEXT), ('provider'::TEXT),
    ('provider_session_id'::TEXT), ('status'::TEXT), ('attempts'::TEXT),
    ('created_at'::TEXT), ('decided_at'::TEXT)
  $$,
  'verification_requests contains only approved metadata columns'
);
SELECT hasnt_column('public', 'verification_requests', 'artifact_storage_path', 'no artifact_storage_path column');
SELECT hasnt_column('public', 'verification_requests', 'artifact_purge_after', 'no artifact_purge_after column');
SELECT hasnt_column('public', 'verification_requests', 'selfie_storage_path', 'no selfie storage path column');
SELECT hasnt_column('public', 'verification_requests', 'raw_selfie', 'no raw selfie column');
SELECT hasnt_column('public', 'verification_requests', 'biometric_template', 'no biometric template column');

-- RLS must be enabled on every relation in this migration (4 assertions).
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c
            JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'profiles'), 'RLS enabled on profiles');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c
            JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'profile_photos'), 'RLS enabled on profile_photos');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c
            JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'user_preferences'), 'RLS enabled on user_preferences');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c
            JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'verification_requests'), 'RLS enabled on verification_requests');

-- Synthetic Auth identities are created as the migration/test owner, never as
-- an application client. Keep all test effects inside this transaction.
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'user-alpha@example.test', pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'user-bravo@example.test', pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'user-underage@example.test', pg_catalog.now(), pg_catalog.now());

-- Age boundary and safe defaults. Set the Auth JWT claims for each role test.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT throws_ok(
  $$ INSERT INTO public.profiles (id, display_name, birth_date)
     VALUES ('00000000-0000-0000-0000-000000000003', 'Underage User',
             (CURRENT_DATE - INTERVAL '18 years' + INTERVAL '1 day')::DATE) $$,
  '23514', NULL, 'DOB one day short of 18 is rejected'
);

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT lives_ok(
  $$ INSERT INTO public.profiles
       (id, display_name, birth_date, verification_status, is_discoverable, is_suspended)
     VALUES ('00000000-0000-0000-0000-000000000001', 'User Alpha',
             (CURRENT_DATE - INTERVAL '18 years')::DATE, 'verified', TRUE, TRUE) $$,
  'DOB exactly 18 succeeds and profile can be created'
);
SELECT results_eq(
  $$ SELECT verification_status FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('not_started'::public.verification_state) $$,
  'client INSERT cannot set verification_status'
);
SELECT results_eq(
  $$ SELECT is_discoverable FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001' $$,
  $$ VALUES (FALSE) $$,
  'client INSERT cannot make a profile discoverable'
);
SELECT results_eq(
  $$ SELECT is_suspended FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001' $$,
  $$ VALUES (FALSE) $$,
  'client INSERT cannot set is_suspended'
);
SELECT results_eq(
  $$ SELECT is_incognito FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001' $$,
  $$ VALUES (FALSE) $$,
  'is_incognito defaults to false'
);

-- User B can create their own row, but user A cannot see or update it. The
-- explicit DOB query ensures there is no client-facing cross-user DOB access.
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT lives_ok(
  $$ INSERT INTO public.profiles (id, display_name, birth_date)
     VALUES ('00000000-0000-0000-0000-000000000002', 'User Bravo', DATE '1995-05-15') $$,
  'User B can insert their own profile'
);
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT is_empty(
  $$ SELECT id FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000002' $$,
  'User A cannot SELECT User B profile'
);
SELECT is_empty(
  $$ SELECT birth_date FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000002' $$,
  'User A cannot read User B birth_date'
);
SELECT lives_ok(
  $$ UPDATE public.profiles SET display_name = 'Tampered Name'
      WHERE id = '00000000-0000-0000-0000-000000000002' $$,
  'Cross-user UPDATE is scoped to zero rows by RLS'
);
RESET ROLE;
SELECT results_eq(
  $$ SELECT display_name FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000002' $$,
  $$ VALUES ('User Bravo'::TEXT) $$,
  'User B profile remains unchanged after User A update attempt'
);

-- Grants are the primary write barrier on server-controlled fields.
SELECT ok(
  NOT pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
  AND NOT pg_catalog.has_table_privilege('anon', 'public.profiles', 'UPDATE'),
  'authenticated and anon have no table-wide UPDATE privilege on profiles'
);
SELECT ok(
  pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
  AND pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'city_region', 'UPDATE')
  AND pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'occupation', 'UPDATE')
  AND pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'education_level', 'UPDATE')
  AND pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'languages_spoken', 'UPDATE')
  AND pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'shared_interests', 'UPDATE')
  AND pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'relationship_intention', 'UPDATE')
  AND pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'prompts', 'UPDATE')
  AND pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'is_incognito', 'UPDATE'),
  'authenticated may UPDATE only the nine user-editable profile columns'
);
SELECT ok(
  NOT pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE')
  AND NOT pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE')
  AND NOT pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'UPDATE')
  AND NOT pg_catalog.has_column_privilege('anon', 'public.profiles', 'display_name', 'UPDATE'),
  'profile identity/timestamps are locked and anon has no profile UPDATE column grants'
);
SELECT ok(NOT pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'birth_date', 'UPDATE'),
  'authenticated has no UPDATE privilege on birth_date');
SELECT ok(NOT pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'verification_status', 'UPDATE'),
  'authenticated has no UPDATE privilege on verification_status');
SELECT ok(NOT pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'is_discoverable', 'UPDATE'),
  'authenticated has no UPDATE privilege on is_discoverable');
SELECT ok(NOT pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'is_suspended', 'UPDATE'),
  'authenticated has no UPDATE privilege on is_suspended');

-- Temporary grants inside this test transaction exercise the trigger itself as
-- a second line of defense. ROLLBACK below removes these test-only grants.
GRANT UPDATE (birth_date, verification_status, is_discoverable, is_suspended)
  ON TABLE public.profiles TO authenticated;
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ UPDATE public.profiles SET city_region = 'Metro Manila', occupation = 'Engineer'
      WHERE id = '00000000-0000-0000-0000-000000000001' $$,
  'client can update the explicitly editable profile columns'
);
SELECT throws_ok(
  $$ UPDATE public.profiles SET birth_date = DATE '1990-01-01'
      WHERE id = '00000000-0000-0000-0000-000000000001' $$,
  '42501', NULL, 'trigger rejects changes to birth_date even if UPDATE is granted'
);
SELECT throws_ok(
  $$ UPDATE public.profiles SET verification_status = 'verified'
      WHERE id = '00000000-0000-0000-0000-000000000001' $$,
  '42501', NULL, 'trigger rejects changes to verification_status even if UPDATE is granted'
);
SELECT throws_ok(
  $$ UPDATE public.profiles SET is_discoverable = TRUE
      WHERE id = '00000000-0000-0000-0000-000000000001' $$,
  '42501', NULL, 'trigger rejects changes to is_discoverable even if UPDATE is granted'
);
SELECT throws_ok(
  $$ UPDATE public.profiles SET is_suspended = TRUE
      WHERE id = '00000000-0000-0000-0000-000000000001' $$,
  '42501', NULL, 'trigger rejects changes to is_suspended even if UPDATE is granted'
);
RESET ROLE;

-- Position is zero-based 0..5; the trigger serializes photo writes per profile
-- and rejects a seventh row even when the attempted position also duplicates.
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ INSERT INTO public.profile_photos (user_id, storage_path, position)
     VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001/photo-0.jpg', 0) $$,
  'first profile photo can be inserted'
);
SELECT throws_ok(
  $$ INSERT INTO public.profile_photos (user_id, storage_path, position)
     VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001/photo-dup.jpg', 0) $$,
  '23505', NULL, 'duplicate photo position is rejected'
);
SELECT lives_ok(
  $$ INSERT INTO public.profile_photos (user_id, storage_path, position) VALUES
       ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001/photo-1.jpg', 1),
       ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001/photo-2.jpg', 2),
       ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001/photo-3.jpg', 3),
       ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001/photo-4.jpg', 4),
       ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001/photo-5.jpg', 5) $$,
  'profile can hold six photos at positions 0 through 5'
);
SELECT throws_ok(
  $$ INSERT INTO public.profile_photos (user_id, storage_path, position)
     VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001/photo-6.jpg', 5) $$,
  '23514', 'Maximum of 6 profile photos allowed per user',
  'seventh profile photo is rejected by trigger'
);

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT is_empty(
  $$ SELECT storage_path FROM public.profile_photos WHERE user_id = '00000000-0000-0000-0000-000000000001' $$,
  'User B cannot read User A profile-photo metadata'
);
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT lives_ok(
  $$ INSERT INTO public.user_preferences (user_id, min_age, max_age, max_distance_km)
     VALUES ('00000000-0000-0000-0000-000000000001', 22, 35, 25) $$,
  'valid preferences can be inserted'
);
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT is_empty(
  $$ SELECT user_id FROM public.user_preferences WHERE user_id = '00000000-0000-0000-0000-000000000001' $$,
  'User B cannot read User A preferences'
);
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT throws_ok(
  $$ UPDATE public.user_preferences SET min_age = 17
      WHERE user_id = '00000000-0000-0000-0000-000000000001' $$,
  '23514', NULL, 'preferences reject min_age below 18'
);
SELECT throws_ok(
  $$ UPDATE public.user_preferences SET min_age = 40, max_age = 30
      WHERE user_id = '00000000-0000-0000-0000-000000000001' $$,
  '23514', NULL, 'preferences reject min_age greater than max_age'
);

-- Client-side verification writes are denied; only trusted server workflows
-- can create/change decisions. Owner SELECT remains available and scoped.
SELECT throws_ok(
  $$ INSERT INTO public.verification_requests (user_id, provider, provider_session_id, status)
     VALUES ('00000000-0000-0000-0000-000000000001', 'provider-x', 'client-forged', 'verified') $$,
  '42501', NULL, 'authenticated client cannot INSERT verification_requests'
);
RESET ROLE;
INSERT INTO public.verification_requests (user_id, provider, provider_session_id, status, attempts)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'provider-x', 'session-alpha', 'pending', 1),
  ('00000000-0000-0000-0000-000000000002', 'provider-x', 'session-bravo', 'verified', 1);
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT results_eq(
  $$ SELECT provider_session_id FROM public.verification_requests $$,
  $$ VALUES ('session-alpha'::TEXT) $$,
  'User A can SELECT only their own verification request'
);
SELECT is_empty(
  $$ SELECT provider_session_id FROM public.verification_requests WHERE user_id = '00000000-0000-0000-0000-000000000002' $$,
  'User A cannot read User B verification request'
);
SELECT throws_ok(
  $$ UPDATE public.verification_requests SET status = 'verified'
      WHERE user_id = '00000000-0000-0000-0000-000000000001' $$,
  '42501', NULL, 'authenticated client cannot UPDATE verification_requests'
);
SELECT throws_ok(
  $$ DELETE FROM public.verification_requests WHERE user_id = '00000000-0000-0000-0000-000000000001' $$,
  '42501', NULL, 'authenticated client cannot DELETE verification_requests'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
