BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(11);

-- Actor and candidate fixture IDs are reserved for this rollback-only test.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
SELECT ('00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0'))::UUID,
       'authenticated', 'authenticated', 'p302-user-' || g || '@example.test', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.generate_series(201, 209) AS series(g)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, display_name, birth_date, city_region, relationship_intention, prompts, verification_status, is_discoverable, is_incognito, is_suspended)
VALUES
('00000000-0000-0000-0000-000000000201','Actor','1990-01-01','Manila','long_term_dating','[{"key":"weekend","answer":"weekend"},{"key":"values","answer":"values"},{"key":"relationship_goal","answer":"goal"}]','verified',true,false,false),
('00000000-0000-0000-0000-000000000202','Missing prompt','1992-01-01','Manila','long_term_dating','[{"key":"weekend","answer":"weekend"},{"key":"values","answer":" "},{"key":"relationship_goal","answer":"goal"}]','verified',true,false,false),
('00000000-0000-0000-0000-000000000203','Complete','1991-01-01','Manila','long_term_dating','[{"key":"weekend","answer":"weekend"},{"key":"values","answer":"values"},{"key":"relationship_goal","answer":"goal"}]','verified',true,false,false),
('00000000-0000-0000-0000-000000000204','One photo','1993-01-01','Manila','long_term_dating','[{"key":"weekend","answer":"weekend"},{"key":"values","answer":"values"},{"key":"relationship_goal","answer":"goal"}]','verified',true,false,false),
('00000000-0000-0000-0000-000000000205','Zero photos','1994-01-01','Manila','long_term_dating','[{"key":"weekend","answer":"weekend"},{"key":"values","answer":"values"},{"key":"relationship_goal","answer":"goal"}]','verified',true,false,false),
('00000000-0000-0000-0000-000000000206','No objects','1995-01-01','Manila','long_term_dating','[{"key":"weekend","answer":"weekend"},{"key":"values","answer":"values"},{"key":"relationship_goal","answer":"goal"}]','verified',true,false,false),
('00000000-0000-0000-0000-000000000207','Actor one photo','1990-01-01','Manila','long_term_dating','[{"key":"weekend","answer":"weekend"},{"key":"values","answer":"values"},{"key":"relationship_goal","answer":"goal"}]','verified',true,false,false),
('00000000-0000-0000-0000-000000000208','Actor two prompts','1990-01-01','Manila','long_term_dating','[{"key":"weekend","answer":"weekend"},{"key":"values","answer":"values"}]','verified',true,false,false),
('00000000-0000-0000-0000-000000000209','Actor metadata only','1990-01-01','Manila','long_term_dating','[{"key":"weekend","answer":"weekend"},{"key":"values","answer":"values"},{"key":"relationship_goal","answer":"goal"}]','verified',true,false,false)
ON CONFLICT (id) DO UPDATE SET city_region=EXCLUDED.city_region, relationship_intention=EXCLUDED.relationship_intention, prompts=EXCLUDED.prompts, verification_status='verified', is_discoverable=true, is_incognito=false, is_suspended=false;

INSERT INTO public.profile_photos (user_id, storage_path, position)
SELECT x.user_id::UUID, x.user_id || '/' || x.photo_name, x.position
FROM (VALUES
('00000000-0000-0000-0000-000000000201','a.jpg',0),('00000000-0000-0000-0000-000000000201','b.jpg',1),
('00000000-0000-0000-0000-000000000202','a.jpg',0),('00000000-0000-0000-0000-000000000202','b.jpg',1),
('00000000-0000-0000-0000-000000000203','a.jpg',0),('00000000-0000-0000-0000-000000000203','b.jpg',1),
('00000000-0000-0000-0000-000000000204','a.jpg',0),
('00000000-0000-0000-0000-000000000206','a.jpg',0),('00000000-0000-0000-0000-000000000206','b.jpg',1),
('00000000-0000-0000-0000-000000000207','a.jpg',0),
('00000000-0000-0000-0000-000000000208','a.jpg',0),('00000000-0000-0000-0000-000000000208','b.jpg',1),
('00000000-0000-0000-0000-000000000209','a.jpg',0),('00000000-0000-0000-0000-000000000209','b.jpg',1)
) AS x(user_id, photo_name, position)
ON CONFLICT (storage_path) DO NOTHING;

-- Real bucket objects (not just metadata) are required for a photo to count.
INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
SELECT 'profile_photos', ph.storage_path, ph.user_id::TEXT, '{"mimetype":"image/jpeg","size":1024}'::JSONB
FROM public.profile_photos ph
WHERE ph.user_id BETWEEN '00000000-0000-0000-0000-000000000201'::UUID AND '00000000-0000-0000-0000-000000000208'::UUID
  AND ph.user_id <> '00000000-0000-0000-0000-000000000206'::UUID
ON CONFLICT DO NOTHING;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}';
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id='00000000-0000-0000-0000-000000000202'$$,'candidate with a missing prompt is excluded');
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id='00000000-0000-0000-0000-000000000204'$$,'candidate with one photo is excluded');
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id='00000000-0000-0000-0000-000000000205'$$,'candidate with zero photos is excluded');
SELECT is((SELECT count(*)::integer FROM public.get_discovery_feed() WHERE profile_id='00000000-0000-0000-0000-000000000203'),1,'complete candidate with two valid stored photos may appear');
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id='00000000-0000-0000-0000-000000000206'$$,'metadata without matching private Storage objects is not eligible');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000207","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.get_discovery_feed()$$,'42501','actor_not_eligible','actor with fewer than two stored photos cannot enter discovery');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000208","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.get_discovery_feed()$$,'42501','actor_not_eligible','actor missing one structured prompt cannot enter discovery');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000209","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.get_discovery_feed()$$,'42501','actor_not_eligible','actor whose metadata has no matching Storage objects cannot enter discovery');
RESET ROLE;
SELECT is((SELECT file_size_limit::integer FROM storage.buckets WHERE id='profile_photos'),5242880,'private photo bucket limit remains 5 MiB');
SELECT ok((SELECT allowed_mime_types @> ARRAY['image/heic']::text[] FROM storage.buckets WHERE id='profile_photos'),'HEIC is accepted by server bucket configuration');
SELECT ok((SELECT NOT public FROM storage.buckets WHERE id='profile_photos'),'profile photos remain private');
SELECT * FROM finish();
ROLLBACK;
