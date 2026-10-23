BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(29);

-- AUTO-DISC fixtures 0801-0806 (rolled back).
-- 801 brand-new member who builds the profile as 'authenticated' (the real client path)
-- 802 incomplete member used for the direct-write attempts
-- 803 privileged-set discoverable but incomplete (explicit operator control is kept)
-- 804 complete profile created by an operator with the flag off (backfill target)
-- 805 incomplete profile (backfill must not enable it)
-- 806 another complete, discoverable viewer
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
SELECT ('00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0'))::UUID,
       'authenticated', 'authenticated', 'auto-disc-' || g || '@example.test', pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.generate_series(801, 806) AS series(g);

-- Storage objects the member's photo rows will point at (the app uploads first, then inserts the row).
INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
SELECT 'profile_photos', '00000000-0000-0000-0000-000000000' || g::TEXT || '/p' || n || '.jpg', '00000000-0000-0000-0000-000000000' || g::TEXT,
       '{"mimetype":"image/jpeg","size":2048}'::JSONB
  FROM (VALUES (801), (804), (806)) AS u(g) CROSS JOIN pg_catalog.generate_series(1, 3) AS photos(n);

-- Operator-created fixtures (privileged writer: left alone by the sync triggers).
INSERT INTO public.profiles (id, display_name, birth_date, city_region, relationship_intention, is_discoverable, prompts)
VALUES
 ('00000000-0000-0000-0000-000000000802', 'Auto Two', DATE '1992-01-01', 'Manila', 'long_term_dating', FALSE, '[]'::JSONB),
 ('00000000-0000-0000-0000-000000000803', 'Auto Three', DATE '1992-01-01', 'Manila', 'long_term_dating', TRUE, '[]'::JSONB),
 ('00000000-0000-0000-0000-000000000804', 'Auto Four', DATE '1992-01-01', 'Oslo', 'long_term_dating', FALSE,
   '[{"key":"weekend","question":"q","answer":"a"},{"key":"values","question":"q","answer":"b"},{"key":"relationship_goal","question":"q","answer":"c"}]'::JSONB),
 ('00000000-0000-0000-0000-000000000805', 'Auto Five', DATE '1992-01-01', 'Oslo', 'long_term_dating', FALSE, '[]'::JSONB),
 ('00000000-0000-0000-0000-000000000806', 'Auto Six', DATE '1992-01-01', 'Toronto', 'long_term_dating', TRUE,
   '[{"key":"weekend","question":"q","answer":"a"},{"key":"values","question":"q","answer":"b"},{"key":"relationship_goal","question":"q","answer":"c"}]'::JSONB);
INSERT INTO public.profile_photos (user_id, storage_path, position)
SELECT ('00000000-0000-0000-0000-000000000' || g::TEXT)::UUID, '00000000-0000-0000-0000-000000000' || g::TEXT || '/p' || n || '.jpg', n - 1
  FROM (VALUES (804), (806)) AS u(g) CROSS JOIN pg_catalog.generate_series(1, 2) AS photos(n);

-- 1. Brand-new member builds the profile step by step as 'authenticated'.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}';
SELECT lives_ok($$INSERT INTO public.profiles (id, display_name, birth_date, city_region, relationship_intention, prompts)
  VALUES ('00000000-0000-0000-0000-000000000801', 'Auto One', DATE '1992-01-01', 'Stockholm', 'long_term_dating', '[]'::JSONB)$$,
  'member creates own profile');
SELECT lives_ok($$INSERT INTO public.profile_photos (user_id, storage_path, position) VALUES
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000801/p1.jpg', 0),
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000801/p2.jpg', 1)$$, 'member adds two photos');
RESET ROLE;
SELECT is((SELECT is_discoverable FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000801'), FALSE,
  'two photos but no prompts: not discoverable yet');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}';
SELECT lives_ok($$UPDATE public.profiles SET prompts =
  '[{"key":"weekend","question":"q","answer":"a"},{"key":"values","question":"q","answer":"b"},{"key":"relationship_goal","question":"q","answer":"c"}]'::JSONB
  WHERE id = '00000000-0000-0000-0000-000000000801'$$, 'member saves the three prompts');
RESET ROLE;
SELECT is((SELECT is_discoverable FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000801'), TRUE,
  'profile becomes discoverable automatically when it reaches completeness (no service_role step)');

-- 2. The member cannot write the flag directly.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000802","role":"authenticated"}';
SELECT throws_ok($$UPDATE public.profiles SET is_discoverable = TRUE WHERE id = '00000000-0000-0000-0000-000000000802'$$,
  '42501', NULL, 'member cannot set is_discoverable on an incomplete profile');
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}';
SELECT throws_ok($$UPDATE public.profiles SET is_discoverable = FALSE WHERE id = '00000000-0000-0000-0000-000000000801'$$,
  '42501', NULL, 'member cannot write the flag directly in either direction');
RESET ROLE;
SELECT is((SELECT is_discoverable FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000802'), FALSE,
  'incomplete profile stays hidden after the attempted direct write');

-- 3. Pause / hide-me switch.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}';
SELECT lives_ok($$UPDATE public.profiles SET is_paused = TRUE WHERE id = '00000000-0000-0000-0000-000000000801'$$,
  'member can pause their own profile');
RESET ROLE;
SELECT is((SELECT is_discoverable FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000801'), FALSE,
  'paused profile is not discoverable');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000806","role":"authenticated"}';
SELECT is((SELECT count(*)::INT FROM public.get_discovery_feed(50) f WHERE f.profile_id = '00000000-0000-0000-0000-000000000801'), 0,
  'paused profile is absent from other feeds');
RESET ROLE;
-- A paused member cannot use discovery either.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.get_discovery_feed(5)$$, '42501', 'actor_not_eligible', 'paused member gets the friendly ineligible error');
SELECT lives_ok($$UPDATE public.profiles SET is_paused = FALSE WHERE id = '00000000-0000-0000-0000-000000000801'$$, 'member resumes');
RESET ROLE;
SELECT is((SELECT is_discoverable FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000801'), TRUE,
  'resuming a complete profile makes it discoverable again');

-- 4. Stops being complete -> hidden again; completes again -> visible.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}';
SELECT lives_ok($$DELETE FROM public.profile_photos WHERE storage_path = '00000000-0000-0000-0000-000000000801/p2.jpg'$$, 'member removes a photo');
RESET ROLE;
SELECT is((SELECT is_discoverable FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000801'), FALSE,
  'dropping below two photos hides the profile');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}';
SELECT lives_ok($$INSERT INTO public.profile_photos (user_id, storage_path, position)
  VALUES ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000801/p3.jpg', 3)$$, 'member adds a photo back');
RESET ROLE;
SELECT is((SELECT is_discoverable FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000801'), TRUE,
  'back to two photos: discoverable again');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}';
SELECT lives_ok($$UPDATE public.profiles SET city_region = NULL WHERE id = '00000000-0000-0000-0000-000000000801'$$, 'member clears the city');
RESET ROLE;
SELECT is((SELECT is_discoverable FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000801'), FALSE,
  'missing city hides the profile');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}';
SELECT is((SELECT public.refresh_my_discoverability()), FALSE, 'refresh_my_discoverability re-derives, it does not enable an incomplete profile');
SELECT lives_ok($$UPDATE public.profiles SET city_region = 'Stockholm' WHERE id = '00000000-0000-0000-0000-000000000801'$$, 'member restores the city');
RESET ROLE;

-- 5. Suspension (service_role) forces the flag off and un-suspension restores it.
SET LOCAL ROLE service_role;
UPDATE public.profiles SET is_suspended = TRUE WHERE id = '00000000-0000-0000-0000-000000000801';
RESET ROLE;
SELECT is((SELECT is_discoverable FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000801'), FALSE, 'suspension makes the profile undiscoverable');
SET LOCAL ROLE service_role;
UPDATE public.profiles SET is_suspended = FALSE WHERE id = '00000000-0000-0000-0000-000000000801';
RESET ROLE;
SELECT is((SELECT is_discoverable FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000801'), TRUE, 'lifting the suspension on a complete profile restores it');

-- 6. Grants.
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.refresh_my_discoverability()$$, '42501', NULL, 'anon cannot call refresh_my_discoverability');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}';
SELECT throws_ok($$SELECT public.admin_sync_discoverability('00000000-0000-0000-0000-000000000802')$$, '42501', NULL, 'members cannot call the admin sync');
RESET ROLE;

-- 7. Operator control is not overwritten; backfill enables complete profiles only.
UPDATE public.profiles SET display_name = 'Auto Three B' WHERE id = '00000000-0000-0000-0000-000000000803';
SELECT is((SELECT is_discoverable FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000803'), TRUE,
  'an explicit privileged is_discoverable value survives unrelated privileged updates');
UPDATE public.profiles pr SET is_discoverable = TRUE
 WHERE NOT pr.is_discoverable AND NOT pr.is_paused AND NOT pr.is_suspended AND private.is_profile_complete(pr.id);
SELECT ok((SELECT is_discoverable FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000804')
      AND NOT (SELECT is_discoverable FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000805'),
  'backfill statement enables a complete profile and leaves an incomplete one off');

-- 8. The new member is visible to another member's feed.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000806","role":"authenticated"}';
SELECT ok(EXISTS (SELECT 1 FROM public.get_discovery_feed(50) f WHERE f.profile_id = '00000000-0000-0000-0000-000000000801'),
  'the member who completed their profile appears in another member''s feed');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
