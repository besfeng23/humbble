BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(14);

-- Rollback-only fixture identities and fully eligible profiles.
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000931','authenticated','authenticated','p303-a@example.test',pg_catalog.now(),pg_catalog.now()),
 ('00000000-0000-0000-0000-000000000932','authenticated','authenticated','p303-b@example.test',pg_catalog.now(),pg_catalog.now()),
 ('00000000-0000-0000-0000-000000000933','authenticated','authenticated','p303-c@example.test',pg_catalog.now(),pg_catalog.now()),
 ('00000000-0000-0000-0000-000000000934','authenticated','authenticated','p303-d@example.test',pg_catalog.now(),pg_catalog.now());
INSERT INTO public.profiles (id,display_name,birth_date,city_region,relationship_intention,shared_interests,prompts,verification_status,is_discoverable,is_suspended,created_at)
VALUES
 ('00000000-0000-0000-0000-000000000931','P3 Actor',DATE '1990-01-01','Manila','serious_relationship',ARRAY['coffee'], '[{"key":"weekend","answer":"hiking"},{"key":"values","answer":"kindness"},{"key":"relationship_goal","answer":"long term"}]','verified',TRUE,FALSE,pg_catalog.now()-INTERVAL '1 day'),
 ('00000000-0000-0000-0000-000000000932','P3 Candidate B',DATE '1995-01-01','Cebu', 'serious_relationship',ARRAY['travel'], '[{"key":"weekend","answer":"reading"},{"key":"values","answer":"honesty"},{"key":"relationship_goal","answer":"long term"}]','verified',TRUE,FALSE,pg_catalog.now()-INTERVAL '3 hours'),
 ('00000000-0000-0000-0000-000000000933','P3 Candidate C',DATE '1994-01-01','Davao','long_term_dating',ARRAY['food'], '[{"key":"weekend","answer":"cooking"},{"key":"values","answer":"family"},{"key":"relationship_goal","answer":"long term"}]','verified',TRUE,FALSE,pg_catalog.now()-INTERVAL '2 hours'),
 ('00000000-0000-0000-0000-000000000934','P3 Candidate D',DATE '1993-01-01','Iloilo','serious_relationship',ARRAY['books'], '[{"key":"weekend","answer":"walking"},{"key":"values","answer":"trust"},{"key":"relationship_goal","answer":"long term"}]','verified',TRUE,FALSE,pg_catalog.now()-INTERVAL '3 hours');
INSERT INTO public.profile_photos (user_id,storage_path,position) VALUES
 ('00000000-0000-0000-0000-000000000931','00000000-0000-0000-0000-000000000931/a-0.jpg',0),
 ('00000000-0000-0000-0000-000000000931','00000000-0000-0000-0000-000000000931/a-1.jpg',1),
 ('00000000-0000-0000-0000-000000000932','00000000-0000-0000-0000-000000000932/b-0.jpg',0),
 ('00000000-0000-0000-0000-000000000932','00000000-0000-0000-0000-000000000932/b-1.jpg',1),
 ('00000000-0000-0000-0000-000000000933','00000000-0000-0000-0000-000000000933/c-0.jpg',0),
 ('00000000-0000-0000-0000-000000000933','00000000-0000-0000-0000-000000000933/c-1.jpg',1),
 ('00000000-0000-0000-0000-000000000934','00000000-0000-0000-0000-000000000934/d-0.jpg',0),
 ('00000000-0000-0000-0000-000000000934','00000000-0000-0000-0000-000000000934/d-1.jpg',1);
INSERT INTO storage.objects (bucket_id,name,owner_id,metadata)
SELECT 'profile_photos',ph.storage_path,ph.user_id::TEXT,'{"mimetype":"image/jpeg","size":1024}'::JSONB
FROM public.profile_photos ph WHERE ph.user_id IN (
 '00000000-0000-0000-0000-000000000931'::UUID,
 '00000000-0000-0000-0000-000000000932'::UUID,
 '00000000-0000-0000-0000-000000000933'::UUID,
 '00000000-0000-0000-0000-000000000934'::UUID) ON CONFLICT DO NOTHING;

INSERT INTO public.reports (reporter_id,reported_user_id,category,context_summary) VALUES ('00000000-0000-0000-0000-000000000931','00000000-0000-0000-0000-000000000933','safety','P3-03 reported-candidate exclusion');

SELECT ok(pg_catalog.to_regprocedure('public.get_discovery_feed(integer,timestamp with time zone)') IS NOT NULL,'existing discovery RPC argument signature is preserved');
SELECT ok((SELECT pg_catalog.pg_get_function_result('public.get_discovery_feed(integer,timestamp with time zone)'::REGPROCEDURE) LIKE '%cursor_created_at timestamp with time zone%'),'feed returns cursor timestamp metadata');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000931","role":"authenticated"}';
CREATE TEMP TABLE p303_first_page AS SELECT * FROM public.get_discovery_feed(1,NULL);
SELECT is((SELECT count(*)::INTEGER FROM p303_first_page),1,'first cursor page returns one candidate');
SELECT ok((SELECT cursor_created_at IS NOT NULL FROM p303_first_page),'first page returns a continuation cursor');
CREATE TEMP TABLE p303_second_page AS SELECT * FROM public.get_discovery_feed(1,(SELECT cursor_created_at FROM p303_first_page));
SELECT is((SELECT count(*)::INTEGER FROM p303_second_page),1,'second cursor page returns next candidate');
SELECT ok(NOT EXISTS (SELECT 1 FROM p303_first_page a JOIN p303_second_page b USING(profile_id)),'cursor pages contain no duplicate profile');
SELECT is((SELECT count(DISTINCT profile_id)::INTEGER FROM (SELECT profile_id FROM p303_first_page UNION ALL SELECT profile_id FROM p303_second_page) p),2,'pagination yields two stable distinct profiles');
SELECT ok((SELECT cursor_created_at FROM p303_second_page) IS DISTINCT FROM (SELECT cursor_created_at FROM p303_first_page),'each page receives a distinct opaque cursor token');
SELECT ok(NOT EXISTS (SELECT 1 FROM p303_first_page WHERE profile_id='00000000-0000-0000-0000-000000000933' UNION ALL SELECT 1 FROM p303_second_page WHERE profile_id='00000000-0000-0000-0000-000000000933'),'reported candidate is excluded from discovery');

-- Reciprocal likes create a single match; retrying the original like returns the same swipe and match.
SELECT ok((SELECT matched = FALSE FROM public.record_swipe('00000000-0000-0000-0000-000000000932','like')),'first like is accepted before reciprocal like');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000932","role":"authenticated"}';
SELECT ok((SELECT matched = TRUE AND match_id IS NOT NULL FROM public.record_swipe('00000000-0000-0000-0000-000000000931','like')),'reciprocal like creates mutual match');
SELECT is((SELECT count(*)::INTEGER FROM public.matches WHERE user_a_id=LEAST('00000000-0000-0000-0000-000000000931'::UUID,'00000000-0000-0000-0000-000000000932'::UUID) AND user_b_id=GREATEST('00000000-0000-0000-0000-000000000931'::UUID,'00000000-0000-0000-0000-000000000932'::UUID) AND status='active'::public.match_status),1,'reciprocal likes create one active match');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000931","role":"authenticated"}';
SELECT results_eq(
  $$ SELECT swipe_id::TEXT COLLATE "C" FROM public.record_swipe('00000000-0000-0000-0000-000000000932','like') $$,
  $$ SELECT id::TEXT COLLATE "C" FROM public.swipes WHERE actor_id='00000000-0000-0000-0000-000000000931' AND target_id='00000000-0000-0000-0000-000000000932' $$,
  'duplicate like retry returns the original swipe id');
SELECT is((SELECT likes_used FROM public.daily_swipe_quotas WHERE user_id='00000000-0000-0000-0000-000000000931' AND quota_date=(pg_catalog.now() AT TIME ZONE 'UTC')::DATE),1,'duplicate retry does not consume another daily like');
RESET ROLE;
ROLLBACK;
