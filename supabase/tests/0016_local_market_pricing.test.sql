BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(24);

DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000161';
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000161','authenticated','authenticated','p4lp@example.test',now(),now());
INSERT INTO public.profiles (id, display_name, birth_date, verification_status, is_discoverable, is_suspended) VALUES
 ('00000000-0000-0000-0000-000000000161','P4 Local',DATE '1990-02-01','verified',TRUE,FALSE);

-- Price table (exact server catalogue)
SELECT is((SELECT count(*)::INT FROM public.billing_plans WHERE is_enabled), 9, 'nine enabled monthly plans');
SELECT is((SELECT amount FROM public.billing_plans WHERE currency='USD' AND is_enabled), 29.99::NUMERIC, 'USD 29.99 enabled');
SELECT is((SELECT amount FROM public.billing_plans WHERE currency='PHP'), 599.00::NUMERIC, 'PHP 599 kept');
SELECT is((SELECT amount FROM public.billing_plans WHERE currency='EUR'), 27.99::NUMERIC, 'EUR 27.99');
SELECT is((SELECT amount FROM public.billing_plans WHERE currency='GBP'), 23.99::NUMERIC, 'GBP 23.99');
SELECT is((SELECT amount FROM public.billing_plans WHERE currency='SEK'), 299.00::NUMERIC, 'SEK 299');
SELECT is((SELECT amount FROM public.billing_plans WHERE currency='NOK'), 329.00::NUMERIC, 'NOK 329');
SELECT is((SELECT amount FROM public.billing_plans WHERE currency='CAD'), 39.99::NUMERIC, 'CAD 39.99');
SELECT is((SELECT amount FROM public.billing_plans WHERE currency='AUD'), 44.99::NUMERIC, 'AUD 44.99');
SELECT is((SELECT amount FROM public.billing_plans WHERE currency='NZD'), 49.99::NUMERIC, 'NZD 49.99');
SELECT throws_ok($$INSERT INTO public.billing_plans (plan_key, market, currency, amount) VALUES ('x','XX','JPY',1)$$, '23514', NULL, 'currency outside allowlist rejected');

-- Grants
SELECT ok(NOT has_table_privilege('authenticated','public.billing_markets','SELECT,INSERT,UPDATE,DELETE'), 'clients cannot read or change market routing');
SELECT ok(NOT has_function_privilege('anon','public.get_billing_plan(text)','EXECUTE'), 'anon cannot resolve plans');
SELECT ok(NOT has_function_privilege('authenticated','private.resolve_billing_plan(text)','EXECUTE'), 'private resolver not client-callable');

-- Resolution (as a signed-in client)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000161","role":"authenticated"}', TRUE);
SELECT is((SELECT currency FROM public.get_billing_plan('SE')), 'SEK', 'Sweden -> SEK');
SELECT is((SELECT currency FROM public.get_billing_plan('no')), 'NOK', 'Norway (lowercase hint) -> NOK');
SELECT is((SELECT currency FROM public.get_billing_plan('FI')), 'EUR', 'Finland -> EUR');
SELECT is((SELECT currency FROM public.get_billing_plan('IT')), 'EUR', 'Italy -> EUR');
SELECT is((SELECT currency FROM public.get_billing_plan('GB')), 'GBP', 'UK -> GBP');
SELECT is((SELECT currency FROM public.get_billing_plan('CA')), 'CAD', 'Canada -> CAD');
SELECT is((SELECT currency FROM public.get_billing_plan('ZZ')), 'PHP', 'unknown hint falls back to PH');
SELECT is((SELECT currency FROM public.get_billing_plan(NULL)), 'PHP', 'no hint falls back to PH');
RESET ROLE;

-- DB flag switches a market off; register_pending honours plan flags
UPDATE public.billing_markets SET is_enabled = FALSE WHERE country_code = 'SE';
SELECT is((SELECT currency FROM private.resolve_billing_plan('SE')), 'PHP', 'disabled market falls back to PH');
SELECT lives_ok($$SELECT public.billing_register_pending_subscription('00000000-0000-0000-0000-000000000161','premium_monthly_sek','I-LP-1','P-SEK','sandbox')$$, 'SEK subscription can be registered');

SELECT * FROM finish();
ROLLBACK;
