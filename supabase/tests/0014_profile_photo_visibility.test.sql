BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(14);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
SELECT ('00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0'))::UUID,
       'authenticated', 'authenticated', 'photo-vis-' || g || '@example.test', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.generate_series(401, 408) AS series(g)
ON CONFLICT (id) DO NOTHING;

-- 401 verified viewer, 402 visible owner, 403 incognito owner, 404 blocked owner,
-- 405 unverified (complete) viewer, 406 incognito owner matched with 401, 407 suspended owner, 408 reported owner.
INSERT INTO public.profiles (id, display_name, birth_date, city_region, relationship_intention, verification_status, is_discoverable, is_incognito, is_suspended)
VALUES
('00000000-0000-0000-0000-000000000401','Viewer','1990-01-01','Manila','long_term_dating','verified',true,false,false),
('00000000-0000-0000-0000-000000000402','Visible','1990-01-01','Manila','long_term_dating','verified',true,false,false),
('00000000-0000-0000-0000-000000000403','Incognito','1990-01-01','Manila','long_term_dating','verified',true,true,false),
('00000000-0000-0000-0000-000000000404','Blocked','1990-01-01','Manila','long_term_dating','verified',true,false,false),
('00000000-0000-0000-0000-000000000405','Unverified','1990-01-01','Manila','long_term_dating','pending',true,false,false),
('00000000-0000-0000-0000-000000000406','Matched','1990-01-01','Manila','long_term_dating','verified',true,true,false),
('00000000-0000-0000-0000-000000000407','Suspended','1990-01-01','Manila','long_term_dating','verified',true,false,true),
('00000000-0000-0000-0000-000000000408','Reported','1990-01-01','Manila','long_term_dating','verified',true,false,false)
ON CONFLICT (id) DO UPDATE SET verification_status=EXCLUDED.verification_status, is_discoverable=EXCLUDED.is_discoverable,
  is_incognito=EXCLUDED.is_incognito, is_suspended=EXCLUDED.is_suspended;

INSERT INTO public.profile_photos (user_id, storage_path, position)
SELECT ('00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0'))::UUID,
       '00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0') || '/a.jpg', 0
  FROM pg_catalog.generate_series(401, 408) AS series(g)
ON CONFLICT (storage_path) DO NOTHING;
-- OWN-OPEN-01: discovery visibility requires a complete profile (2 photos, 3 prompts).
INSERT INTO public.profile_photos (user_id, storage_path, position)
SELECT ('00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0'))::UUID,
       '00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0') || '/b.jpg', 1
  FROM pg_catalog.generate_series(401, 408) AS series(g)
ON CONFLICT (storage_path) DO NOTHING;
UPDATE public.profiles
   SET prompts = '[{"key":"weekend","question":"q","answer":"a"},{"key":"values","question":"q","answer":"b"},{"key":"relationship_goal","question":"q","answer":"c"}]'::JSONB
 WHERE id BETWEEN '00000000-0000-0000-0000-000000000401'::UUID AND '00000000-0000-0000-0000-000000000408'::UUID;
INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
SELECT 'profile_photos', ph.storage_path, ph.user_id::TEXT, '{"mimetype":"image/jpeg","size":1024}'::JSONB
  FROM public.profile_photos ph
 WHERE ph.user_id BETWEEN '00000000-0000-0000-0000-000000000401'::UUID AND '00000000-0000-0000-0000-000000000408'::UUID
ON CONFLICT DO NOTHING;
-- An orphan object with no metadata row must never become readable.
INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES ('profile_photos','00000000-0000-0000-0000-000000000402/orphan.jpg','00000000-0000-0000-0000-000000000402','{"mimetype":"image/jpeg","size":1024}'::JSONB)
ON CONFLICT DO NOTHING;

INSERT INTO public.blocks (blocker_id, blocked_id) VALUES ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000404');
INSERT INTO public.matches (user_a_id, user_b_id) VALUES ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000406');
INSERT INTO public.reports (reporter_id, reported_user_id, category, context_summary)
VALUES ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000408','safety','photo visibility test');


SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}';
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name='00000000-0000-0000-0000-000000000402/a.jpg'),1,'verified viewer can read a discoverable member photo');
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name='00000000-0000-0000-0000-000000000403/a.jpg'),0,'incognito unmatched member photo is hidden');
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name='00000000-0000-0000-0000-000000000404/a.jpg'),0,'blocked member photo is hidden');
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name='00000000-0000-0000-0000-000000000406/a.jpg'),1,'active match photo is readable even when incognito');
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name='00000000-0000-0000-0000-000000000407/a.jpg'),0,'suspended member photo is hidden');
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name='00000000-0000-0000-0000-000000000408/a.jpg'),0,'reported member photo is hidden from the reporter');
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name='00000000-0000-0000-0000-000000000402/orphan.jpg'),0,'objects without photo metadata stay hidden');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000405","role":"authenticated"}';
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name='00000000-0000-0000-0000-000000000402/a.jpg'),1,'complete unverified viewer can read a discoverable member photo (OWN-OPEN-01)');
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name='00000000-0000-0000-0000-000000000405/a.jpg'),1,'owner still reads own photo');
RESET ROLE;

-- Completeness still gates discovery visibility for the viewer and the owner.
UPDATE public.profiles SET prompts = '[]'::JSONB WHERE id = '00000000-0000-0000-0000-000000000405';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000405","role":"authenticated"}';
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name='00000000-0000-0000-0000-000000000402/a.jpg'),0,'incomplete viewer cannot read other member photos');
RESET ROLE;
DELETE FROM public.profile_photos WHERE storage_path = '00000000-0000-0000-0000-000000000402/b.jpg';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}';
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name='00000000-0000-0000-0000-000000000402/a.jpg'),0,'incomplete owner photo is hidden from discovery viewers');
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name='00000000-0000-0000-0000-000000000406/a.jpg'),1,'active match photo stays readable');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE bucket_id='profile_photos' AND name LIKE '00000000-0000-0000-0000-0000000004%'),0,'anon cannot read any profile photo');
RESET ROLE;
SELECT ok(NOT pg_catalog.has_function_privilege('anon','private.can_read_profile_photo_object(text,text)','EXECUTE'),'anon cannot execute the photo visibility helper');

SELECT * FROM finish();
ROLLBACK;
