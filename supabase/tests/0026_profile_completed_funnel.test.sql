BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(43);

-- PROFILE-COMPLETED fixtures 0301-0305 (rolled back).
-- 301 member who builds the profile step by step as 'authenticated' (the real client path)
-- 302 operator-created complete profile (privileged writer)
-- 303 operator-created incomplete profile with a city
-- 304 member whose photo rows exist before the storage objects (upload-order race)
-- 305 member completing the profile while the funnel write is made to fail (best-effort analytics)
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
SELECT ('00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0'))::UUID,
       'authenticated', 'authenticated', 'pc-funnel-' || g || '@example.test', pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.generate_series(301, 305) AS series(g);

-- Signup itself must not have produced a profile_completed event.
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE event = 'profile_completed'
            AND user_id IN (SELECT id FROM auth.users WHERE email LIKE 'pc-funnel-%')), 0, 'no profile_completed after signup alone');

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
SELECT 'profile_photos', '00000000-0000-0000-0000-000000000' || g::TEXT || '/p' || n || '.jpg', '00000000-0000-0000-0000-000000000' || g::TEXT,
       '{"mimetype":"image/jpeg","size":2048}'::JSONB
  FROM (VALUES (301), (302), (305)) AS u(g) CROSS JOIN pg_catalog.generate_series(1, 3) AS photos(n);

-- 1. Partial profiles do not fire the event.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}';
SELECT lives_ok($$INSERT INTO public.profiles (id, display_name, birth_date, city_region, relationship_intention, prompts)
  VALUES ('00000000-0000-0000-0000-000000000301', 'Funnel One', DATE '1992-01-01', 'Stockholm', 'long_term_dating', '[]'::JSONB)$$,
  'member creates own profile with a city');
RESET ROLE;
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id = '00000000-0000-0000-0000-000000000301' AND event = 'profile_completed'), 0,
  'city entered: profile_completed NOT fired');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}';
SELECT lives_ok($$UPDATE public.profiles SET prompts =
  '[{"key":"weekend","question":"q","answer":"a"},{"key":"values","question":"q","answer":"b"},{"key":"relationship_goal","question":"q","answer":"c"}]'::JSONB
  WHERE id = '00000000-0000-0000-0000-000000000301'$$, 'member saves the three prompts');
SELECT lives_ok($$INSERT INTO public.profile_photos (user_id, storage_path, position)
  VALUES ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000301/p1.jpg', 0)$$, 'member adds one photo');
RESET ROLE;
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id = '00000000-0000-0000-0000-000000000301' AND event = 'profile_completed'), 0,
  'prompts + one photo: profile_completed NOT fired');
SELECT is(private.is_profile_complete('00000000-0000-0000-0000-000000000301'), FALSE, 'precondition: profile is still incomplete');

-- 2. Fires once, when the profile first becomes complete.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}';
SELECT lives_ok($$INSERT INTO public.profile_photos (user_id, storage_path, position)
  VALUES ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000301/p2.jpg', 1)$$, 'member adds the second photo');
RESET ROLE;
SELECT is(private.is_profile_complete('00000000-0000-0000-0000-000000000301'), TRUE, 'precondition: profile is now complete');
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id = '00000000-0000-0000-0000-000000000301' AND event = 'profile_completed'), 1,
  'profile complete: profile_completed fired exactly once');
CREATE TEMP TABLE pc_first AS
  SELECT id, occurred_at FROM public.funnel_events WHERE user_id = '00000000-0000-0000-0000-000000000301' AND event = 'profile_completed';
GRANT SELECT ON pc_first TO authenticated;

-- 3. Later edits never re-fire (including un-completing and completing again).
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}';
SELECT lives_ok($$UPDATE public.profiles SET city_region = 'Gothenburg', display_name = 'Funnel One B' WHERE id = '00000000-0000-0000-0000-000000000301'$$, 'member edits city and name');
SELECT lives_ok($$INSERT INTO public.profile_photos (user_id, storage_path, position)
  VALUES ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000301/p3.jpg', 2)$$, 'member adds a third photo');
SELECT lives_ok($$DELETE FROM public.profile_photos WHERE storage_path IN ('00000000-0000-0000-0000-000000000301/p2.jpg', '00000000-0000-0000-0000-000000000301/p3.jpg')$$,
  'member drops below two photos (profile incomplete again)');
SELECT lives_ok($$INSERT INTO public.profile_photos (user_id, storage_path, position)
  VALUES ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000301/p2.jpg', 1)$$, 'member completes the profile a second time');
RESET ROLE;
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id = '00000000-0000-0000-0000-000000000301' AND event = 'profile_completed'), 1,
  'still exactly one profile_completed after edits and re-completion');
SELECT ok((SELECT f.id = c.id AND f.occurred_at = c.occurred_at FROM public.funnel_events f, pc_first c
            WHERE f.user_id = '00000000-0000-0000-0000-000000000301' AND f.event = 'profile_completed'), 'the original event row is unchanged');
SELECT is((SELECT public.admin_sync_discoverability('00000000-0000-0000-0000-000000000301')), TRUE, 'sync of a complete profile still works');
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id = '00000000-0000-0000-0000-000000000301' AND event = 'profile_completed'), 1,
  'sync does not add a second event');

-- 4. Privileged writers: completeness is a fact about the profile, whoever wrote it.
INSERT INTO public.profiles (id, display_name, birth_date, city_region, relationship_intention, prompts)
VALUES ('00000000-0000-0000-0000-000000000303', 'Funnel Three', DATE '1992-01-01', 'Oslo', 'long_term_dating', '[]'::JSONB);
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id = '00000000-0000-0000-0000-000000000303' AND event = 'profile_completed'), 0,
  'operator-created profile with only a city: not fired');
INSERT INTO public.profiles (id, display_name, birth_date, city_region, relationship_intention, prompts)
VALUES ('00000000-0000-0000-0000-000000000302', 'Funnel Two', DATE '1992-01-01', 'Oslo', 'long_term_dating',
  '[{"key":"weekend","question":"q","answer":"a"},{"key":"values","question":"q","answer":"b"},{"key":"relationship_goal","question":"q","answer":"c"}]'::JSONB);
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id = '00000000-0000-0000-0000-000000000302' AND event = 'profile_completed'), 0,
  'complete prompts but no photos yet: not fired');
INSERT INTO public.profile_photos (user_id, storage_path, position) VALUES
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000302/p1.jpg', 0),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000302/p2.jpg', 1);
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id = '00000000-0000-0000-0000-000000000302' AND event = 'profile_completed'), 1,
  'operator completes the profile: fired once');

-- 5. Upload-order race: photo rows land before their storage objects; refresh settles the event.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000304","role":"authenticated"}';
SELECT lives_ok($$INSERT INTO public.profiles (id, display_name, birth_date, city_region, relationship_intention, prompts)
  VALUES ('00000000-0000-0000-0000-000000000304', 'Funnel Four', DATE '1992-01-01', 'Bergen', 'long_term_dating',
  '[{"key":"weekend","question":"q","answer":"a"},{"key":"values","question":"q","answer":"b"},{"key":"relationship_goal","question":"q","answer":"c"}]'::JSONB)$$,
  'race member creates a profile');
RESET ROLE;
-- Photo rows inserted by the operator with no storage object yet (invalid, so the profile is incomplete).
INSERT INTO public.profile_photos (user_id, storage_path, position) VALUES
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000304/p1.jpg', 0),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000304/p2.jpg', 1);
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id = '00000000-0000-0000-0000-000000000304' AND event = 'profile_completed'), 0,
  'photo rows without valid storage objects: not fired');
INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
SELECT 'profile_photos', '00000000-0000-0000-0000-000000000304/p' || n || '.jpg', '00000000-0000-0000-0000-000000000304',
       '{"mimetype":"image/jpeg","size":2048}'::JSONB
  FROM pg_catalog.generate_series(1, 2) AS photos(n);
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000304","role":"authenticated"}';
SELECT is((SELECT public.refresh_my_discoverability()), TRUE, 'member refresh after the uploads finish');
RESET ROLE;
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id = '00000000-0000-0000-0000-000000000304' AND event = 'profile_completed'), 1,
  'refresh_my_discoverability settles profile_completed once');

-- 6. Clients cannot write funnel_events or reach the server-side functions.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000303","role":"authenticated"}';
SELECT throws_ok($$INSERT INTO public.funnel_events (user_id, event) VALUES ('00000000-0000-0000-0000-000000000303', 'profile_completed')$$,
  '42501', NULL, 'member cannot insert funnel_events');
SELECT throws_ok($$SELECT private.record_profile_completed_if_complete('00000000-0000-0000-0000-000000000303')$$,
  '42501', NULL, 'member cannot call the completion recorder');
SET LOCAL ROLE anon;
SELECT throws_ok($$INSERT INTO public.funnel_events (user_id, event) VALUES ('00000000-0000-0000-0000-000000000303', 'profile_completed')$$,
  '42501', NULL, 'anon cannot insert funnel_events');
RESET ROLE;
SELECT is((SELECT bool_or(pg_catalog.has_function_privilege(r.rolname, f.oid, 'EXECUTE'))
             FROM pg_catalog.pg_roles r,
                  (SELECT p.oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'private'
                      AND p.proname IN ('record_profile_completed_if_complete', 'handle_profile_completed', 'handle_profile_photo_completed', 'record_funnel_event', 'sync_profile_discoverability')) f
            WHERE r.rolname IN ('anon', 'authenticated', 'service_role')), FALSE,
  'no API role can EXECUTE the private funnel / sync functions');
SELECT ok((SELECT bool_and(p.prosecdef AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
             FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'private'
              AND p.proname IN ('record_profile_completed_if_complete', 'handle_profile_completed', 'handle_profile_photo_completed')),
  'new functions are SECURITY DEFINER with a pinned search_path');

-- 7. Table privileges on funnel_events (a re-granted INSERT with RLS on must be caught, not only SQLSTATE 42501).
SELECT is((SELECT bool_or(pg_catalog.has_table_privilege('anon', 'public.funnel_events', priv))
             FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS t(priv)), FALSE,
  'anon has no privilege on funnel_events');
SELECT is((SELECT bool_or(pg_catalog.has_table_privilege('authenticated', 'public.funnel_events', priv))
             FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS t(priv)), FALSE,
  'authenticated has no privilege on funnel_events');
SELECT is(pg_catalog.has_table_privilege('anon', 'public.funnel_events', 'INSERT'), FALSE, 'anon cannot INSERT funnel_events (privilege)');
SELECT is(pg_catalog.has_table_privilege('authenticated', 'public.funnel_events', 'INSERT'), FALSE, 'authenticated cannot INSERT funnel_events (privilege)');
SELECT is(pg_catalog.has_table_privilege('service_role', 'public.funnel_events', 'INSERT'), TRUE,
  'service_role keeps INSERT on funnel_events (server-written table; narrowing is a tracked follow-up)');
SELECT is((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.funnel_events'::regclass), TRUE, 'funnel_events keeps row level security on');

-- 8. A failing funnel write never aborts the member's write (analytics is best-effort), and is retried later.
INSERT INTO public.profiles (id, display_name, birth_date, city_region, relationship_intention, prompts)
VALUES ('00000000-0000-0000-0000-000000000305', 'Funnel Five', DATE '1992-01-01', 'Malmo', 'long_term_dating',
  '[{"key":"weekend","question":"q","answer":"a"},{"key":"values","question":"q","answer":"b"},{"key":"relationship_goal","question":"q","answer":"c"}]'::JSONB);
INSERT INTO public.profile_photos (user_id, storage_path, position)
VALUES ('00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000305/p1.jpg', 0);
-- Make every profile_completed insert fail (NOT VALID still checks new rows). Removed again below.
ALTER TABLE public.funnel_events ADD CONSTRAINT zz_test_block_profile_completed CHECK (event <> 'profile_completed') NOT VALID;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000305","role":"authenticated"}';
SELECT lives_ok($$INSERT INTO public.profile_photos (user_id, storage_path, position)
  VALUES ('00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000305/p2.jpg', 1)$$,
  'member photo write survives a failing funnel insert');
RESET ROLE;
SELECT is(private.is_profile_complete('00000000-0000-0000-0000-000000000305'), TRUE, 'the profile write really landed (profile is complete)');
SELECT is((SELECT count(*)::INT FROM public.profile_photos WHERE user_id = '00000000-0000-0000-0000-000000000305'), 2, 'both photo rows persisted');
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id = '00000000-0000-0000-0000-000000000305' AND event = 'profile_completed'), 0,
  'no event was recorded while the funnel insert failed');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000305","role":"authenticated"}';
SELECT lives_ok($$UPDATE public.profiles SET city_region = 'Lund' WHERE id = '00000000-0000-0000-0000-000000000305'$$,
  'member profile write survives a failing funnel insert');
RESET ROLE;
ALTER TABLE public.funnel_events DROP CONSTRAINT zz_test_block_profile_completed;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000305","role":"authenticated"}';
SELECT is((SELECT public.refresh_my_discoverability()), TRUE, 'member refresh after the funnel recovers');
RESET ROLE;
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id = '00000000-0000-0000-0000-000000000305' AND event = 'profile_completed'), 1,
  'the event is recorded exactly once on the next write (retry)');

SELECT * FROM finish();
ROLLBACK;
