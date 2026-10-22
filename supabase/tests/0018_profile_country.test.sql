BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(14);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000171','authenticated','authenticated','pc1@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000172','authenticated','authenticated','pc2@example.test',now(),now());
INSERT INTO public.profiles (id, display_name, birth_date, verification_status, is_discoverable, is_suspended) VALUES
 ('00000000-0000-0000-0000-000000000171','PC One',DATE '1990-02-01','verified',TRUE,FALSE),
 ('00000000-0000-0000-0000-000000000172','PC Two',DATE '1990-02-01','verified',TRUE,FALSE);

SELECT has_column('public','profiles','country_code','profiles.country_code exists');
SELECT throws_ok($$UPDATE public.profiles SET country_code = 'UK' WHERE id = '00000000-0000-0000-0000-000000000171'$$, '23514', NULL, 'non-ISO code rejected');
SELECT throws_ok($$UPDATE public.profiles SET country_code = 'se' WHERE id = '00000000-0000-0000-0000-000000000171'$$, '23514', NULL, 'lowercase rejected');
SELECT ok(has_column_privilege('authenticated','public.profiles','country_code','UPDATE'), 'members may edit their country');
SELECT ok(NOT has_function_privilege('authenticated','public.billing_resolve_plan_for_user(uuid,text)','EXECUTE'), 'clients cannot resolve for other users');
SELECT ok(has_function_privilege('service_role','public.billing_resolve_plan_for_user(uuid,text)','EXECUTE'), 'edge can resolve for checkout user');

-- As member 171: set own country (RLS + column grant), then resolve.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000171","role":"authenticated"}', TRUE);
SELECT lives_ok($$UPDATE public.profiles SET country_code = 'SE' WHERE id = '00000000-0000-0000-0000-000000000171'$$, 'member sets own country');
SELECT is((SELECT currency FROM public.get_billing_plan('GB')), 'SEK', 'profile country beats locale hint');
SELECT is((SELECT currency FROM public.get_billing_plan(NULL)), 'SEK', 'profile country without hint');
UPDATE public.profiles SET country_code = 'JP' WHERE id = '00000000-0000-0000-0000-000000000171';
SELECT is((SELECT currency FROM public.get_billing_plan('GB')), 'GBP', 'non-market profile country falls to hint');
SELECT is((SELECT currency FROM public.get_billing_plan('ZZ')), 'PHP', 'then PH fallback');
UPDATE public.profiles SET country_code = 'NO' WHERE id = '00000000-0000-0000-0000-000000000172';
SELECT is((SELECT country_code FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000172'), NULL, 'cannot set another member''s country');
RESET ROLE;

SELECT is((SELECT currency FROM public.billing_resolve_plan_for_user('00000000-0000-0000-0000-000000000171', 'FI')), 'EUR', 'service resolve: JP profile -> FI hint -> EUR');
UPDATE public.billing_markets SET is_enabled = FALSE WHERE country_code = 'JP';
UPDATE public.profiles SET country_code = 'CA' WHERE id = '00000000-0000-0000-0000-000000000171';
UPDATE public.billing_markets SET is_enabled = FALSE WHERE country_code = 'CA';
SELECT is((SELECT currency FROM public.billing_resolve_plan_for_user('00000000-0000-0000-0000-000000000171', 'NO')), 'NOK', 'disabled profile market falls to hint');

SELECT * FROM finish();
ROLLBACK;
