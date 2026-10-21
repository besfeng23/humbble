BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(6);

INSERT INTO auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) VALUES
('00000000-0000-0000-0000-000000000211','authenticated','authenticated','p302-owner-a@example.test','',now(),now(),now()),
('00000000-0000-0000-0000-000000000212','authenticated','authenticated','p302-owner-b@example.test','',now(),now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id,display_name,birth_date,city_region) VALUES
('00000000-0000-0000-0000-000000000211','Owner Alpha','1990-01-01','Manila'),
('00000000-0000-0000-0000-000000000212','Owner Bravo','1990-01-01','Manila')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profile_photos (user_id,storage_path,position) VALUES
('00000000-0000-0000-0000-000000000211','00000000-0000-0000-0000-000000000211/own.jpg',0),
('00000000-0000-0000-0000-000000000212','00000000-0000-0000-0000-000000000212/own.jpg',0)
ON CONFLICT (storage_path) DO NOTHING;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000211","role":"authenticated"}';
SELECT throws_ok($$INSERT INTO public.profile_photos (user_id,storage_path,position) VALUES ('00000000-0000-0000-0000-000000000212','00000000-0000-0000-0000-000000000212/forged.jpg',1)$$,'42501',NULL,'owner A cannot insert metadata for owner B');
SELECT throws_ok($$UPDATE public.profile_photos SET storage_path='00000000-0000-0000-0000-000000000212/moved.jpg' WHERE user_id=auth.uid()$$,'42501','profile_photo_path_must_be_user_scoped','owner A cannot move an owned object path into owner B folder');
SELECT lives_ok($$UPDATE public.profile_photos SET position=1 WHERE user_id='00000000-0000-0000-0000-000000000212'$$,'owner A cannot update owner B rows (RLS affects zero rows)');
SELECT lives_ok($$DELETE FROM public.profile_photos WHERE user_id='00000000-0000-0000-0000-000000000212'$$,'owner A cannot delete owner B rows (RLS affects zero rows)');
RESET ROLE;
SELECT is((SELECT storage_path FROM public.profile_photos WHERE user_id='00000000-0000-0000-0000-000000000212'),'00000000-0000-0000-0000-000000000212/own.jpg','owner B metadata remains unchanged');
SELECT ok(pg_catalog.pg_get_expr((SELECT polqual FROM pg_catalog.pg_policy WHERE polrelid='storage.objects'::regclass AND polname='p2_04_profile_photos_select_owner'), 'storage.objects'::regclass) LIKE '%profile_photos%' ,'private Storage SELECT policy is anchored to photo metadata');
SELECT * FROM finish();
ROLLBACK;
