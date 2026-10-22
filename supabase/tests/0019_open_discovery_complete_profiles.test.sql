BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(16);

-- OWN-OPEN-01 fixtures 0701-0708 (rolled back).
-- 701 unverified complete actor, 702 unverified complete target,
-- 703 verified with a real verification record, 704 verified status WITHOUT a record,
-- 705 unverified incomplete (1 photo), 706 unverified incognito, 707 unverified suspended,
-- 708 unverified complete, blocked by 701.
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
SELECT ('00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0'))::UUID,
       'authenticated', 'authenticated', 'open-disc-' || g || '@example.test', pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.generate_series(701, 708) AS series(g);

INSERT INTO public.profiles (id, display_name, birth_date, city_region, relationship_intention, verification_status,
  is_discoverable, is_incognito, is_suspended, prompts)
SELECT ('00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0'))::UUID,
       'Open ' || g, DATE '1992-01-01', 'Manila', 'long_term_dating',
       CASE WHEN g IN (703, 704) THEN 'verified'::public.verification_state ELSE 'not_started'::public.verification_state END,
       TRUE, g = 706, g = 707,
       '[{"key":"weekend","question":"q","answer":"a"},{"key":"values","question":"q","answer":"b"},{"key":"relationship_goal","question":"q","answer":"c"}]'::JSONB
  FROM pg_catalog.generate_series(701, 708) AS series(g)
ON CONFLICT (id) DO UPDATE SET verification_status = EXCLUDED.verification_status, is_discoverable = EXCLUDED.is_discoverable,
  is_incognito = EXCLUDED.is_incognito, is_suspended = EXCLUDED.is_suspended, prompts = EXCLUDED.prompts,
  display_name = EXCLUDED.display_name, city_region = EXCLUDED.city_region, relationship_intention = EXCLUDED.relationship_intention,
  birth_date = EXCLUDED.birth_date;

INSERT INTO public.profile_photos (user_id, storage_path, position)
SELECT ('00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0'))::UUID,
       '00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0') || '/od-' || n || '.jpg', n - 1
  FROM pg_catalog.generate_series(701, 708) AS series(g)
 CROSS JOIN pg_catalog.generate_series(1, 2) AS photos(n)
 WHERE NOT (g = 705 AND n = 2);
INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
SELECT 'profile_photos', ph.storage_path, ph.user_id::TEXT, '{"mimetype":"image/jpeg","size":1024}'::JSONB
  FROM public.profile_photos ph
 WHERE ph.user_id BETWEEN '00000000-0000-0000-0000-000000000701'::UUID AND '00000000-0000-0000-0000-000000000708'::UUID
ON CONFLICT DO NOTHING;

INSERT INTO public.verification_requests (user_id, provider, status, decided_at)
VALUES ('00000000-0000-0000-0000-000000000703', 'test-provider', 'verified', pg_catalog.now());
INSERT INTO public.blocks (blocker_id, blocked_id)
VALUES ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000708');

CREATE TEMP TABLE od_feed ON COMMIT DROP AS SELECT * FROM public.get_discovery_feed(1) WHERE FALSE;
GRANT ALL ON od_feed TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}';
SELECT lives_ok($$INSERT INTO od_feed SELECT * FROM public.get_discovery_feed(50)$$, 'complete unverified member can load discovery');
SELECT ok(EXISTS (SELECT 1 FROM od_feed WHERE profile_id = '00000000-0000-0000-0000-000000000702'), 'complete unverified target is in the feed');
SELECT ok(NOT EXISTS (SELECT 1 FROM od_feed WHERE profile_id = '00000000-0000-0000-0000-000000000705'), 'incomplete profile stays out of the feed');
SELECT ok(NOT EXISTS (SELECT 1 FROM od_feed WHERE profile_id = '00000000-0000-0000-0000-000000000706'), 'incognito profile stays out of the feed');
SELECT ok(NOT EXISTS (SELECT 1 FROM od_feed WHERE profile_id = '00000000-0000-0000-0000-000000000707'), 'suspended profile stays out of the feed');
SELECT ok(NOT EXISTS (SELECT 1 FROM od_feed WHERE profile_id = '00000000-0000-0000-0000-000000000708'), 'blocked profile stays out of the feed');
SELECT is((SELECT is_verified FROM od_feed WHERE profile_id = '00000000-0000-0000-0000-000000000703'), TRUE, 'badge flag is true only with a real verification record');
SELECT is((SELECT is_verified FROM od_feed WHERE profile_id = '00000000-0000-0000-0000-000000000704'), FALSE, 'verified status without a verification record shows no badge');
SELECT is((SELECT is_verified FROM od_feed WHERE profile_id = '00000000-0000-0000-0000-000000000702'), FALSE, 'unverified member shows no badge');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000707', 'like')$$, '42501', 'target_not_eligible', 'suspended target cannot be swiped');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000706', 'like')$$, '42501', 'target_not_eligible', 'incognito target cannot be swiped');
SELECT lives_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000702', 'like')$$, 'unverified complete member can like another');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000702","role":"authenticated"}';
SELECT is((SELECT matched FROM public.record_swipe('00000000-0000-0000-0000-000000000701', 'like')), TRUE, 'mutual like between unverified complete members creates a match');
SELECT lives_ok($$SELECT * FROM public.send_message(
  (SELECT c.id FROM public.conversations c JOIN public.matches m ON m.id = c.match_id
    WHERE m.user_a_id = '00000000-0000-0000-0000-000000000701' AND m.user_b_id = '00000000-0000-0000-0000-000000000702'),
  'Hello there', '00000000-0000-0000-0000-000000000799'::UUID)$$, 'matched unverified members can chat');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000705","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.get_discovery_feed(10)$$, '42501', 'actor_not_eligible', 'incomplete member cannot load discovery');
RESET ROLE;
UPDATE public.profiles SET is_discoverable = FALSE WHERE id = '00000000-0000-0000-0000-000000000705';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000705","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000702', 'pass')$$, '42501', 'actor_not_eligible', 'non-discoverable member cannot swipe');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
