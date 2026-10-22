BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(20);
INSERT INTO public.attribution_networks (slug, display_name, click_id_params, postback_url_template)
VALUES ('testnet','Test Net',ARRAY['sub1','aff_click_id'],'https://example.test/pb?cid={click_id}&e={event}&p={payout}&t={transaction_id}');

INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
('00000000-0000-0000-0000-000000000501','authenticated','authenticated','funnel-501@example.test','',
 '{"consent":{"terms_privacy":true,"marketing":false},"attribution":{"landing_path":"/","first_seen_at":"2026-10-20T00:00:00Z","params":{"aff_click_id":"abc123","network":"TestNet","sub1":"s1","email":"x@example.test","utm_source":"fb","evil":"zzz","sub2":"a@b.c"}}}'::JSONB,
 pg_catalog.now(), pg_catalog.now()),
('00000000-0000-0000-0000-000000000502','authenticated','authenticated','funnel-502@example.test','',
 '{"consent":{"terms_privacy":true,"marketing":true}}'::JSONB, pg_catalog.now(), pg_catalog.now());

SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id='00000000-0000-0000-0000-000000000501' AND event='signup_completed'),1,'signup_completed recorded');
SELECT is((SELECT marketing_opt_in FROM public.user_consents WHERE user_id='00000000-0000-0000-0000-000000000501'),false,'marketing defaults to not opted in');
SELECT ok((SELECT terms_privacy_accepted_at IS NOT NULL FROM public.user_consents WHERE user_id='00000000-0000-0000-0000-000000000501'),'terms acceptance timestamped');
SELECT ok((SELECT marketing_opt_in AND marketing_opt_in_at IS NOT NULL FROM public.user_consents WHERE user_id='00000000-0000-0000-0000-000000000502'),'marketing opt-in timestamped');
SELECT is((SELECT click_id || '|' || network FROM public.signup_attributions WHERE user_id='00000000-0000-0000-0000-000000000501'),'s1|testnet','network-specific click id param mapping is used');
SELECT is((SELECT params ? 'email' OR params ? 'evil' OR params ? 'sub2' FROM public.signup_attributions WHERE user_id='00000000-0000-0000-0000-000000000501'),false,'non-allowlisted keys and email-like values dropped');
SELECT is((SELECT network FROM public.signup_attributions WHERE user_id='00000000-0000-0000-0000-000000000502'),'direct','no params => direct/own source');
SELECT ok((SELECT params ? 'utm_source' AND params ? 'aff_click_id' FROM public.signup_attributions WHERE user_id='00000000-0000-0000-0000-000000000501'),'raw allowed params stored generically');
INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000503','authenticated','authenticated','funnel-503@example.test','',
 '{"consent":{"terms_privacy":true},"attribution":{"params":{"rtkcid":"rt-9","network":"nope"}}}'::JSONB, pg_catalog.now(), pg_catalog.now());
SELECT is((SELECT network || '|' || click_id FROM public.signup_attributions WHERE user_id='00000000-0000-0000-0000-000000000503'),'unknown|rt-9','unknown network with tracker click id falls back to generic mapping');
SELECT is((SELECT count(*)::INT FROM public.attribution_networks WHERE postback_enabled),0,'postback sending disabled for every network');

UPDATE auth.users SET email_confirmed_at = pg_catalog.now() WHERE id='00000000-0000-0000-0000-000000000501';
UPDATE auth.users SET email_confirmed_at = pg_catalog.now() WHERE id='00000000-0000-0000-0000-000000000501';
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id='00000000-0000-0000-0000-000000000501' AND event='doi_confirmed'),1,'doi_confirmed recorded once');

INSERT INTO public.profiles (id, display_name, birth_date, city_region, relationship_intention)
VALUES ('00000000-0000-0000-0000-000000000501','Funnel','1990-01-01','Toronto','long_term_dating');
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE user_id='00000000-0000-0000-0000-000000000501' AND event='profile_completed'),1,'profile_completed recorded');
SELECT is((SELECT count(*)::INT FROM public.postback_outbox),0,'postback outbox stays empty');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}';
SELECT is((SELECT count(*)::INT FROM public.user_consents),1,'member sees only own consent row');
SELECT throws_ok($$SELECT * FROM public.signup_attributions$$,'42501',NULL,'member cannot read attributions');
SELECT throws_ok($$SELECT * FROM public.funnel_events$$,'42501',NULL,'member cannot read funnel events');
SELECT throws_ok($$SELECT * FROM public.attribution_networks$$,'42501',NULL,'member cannot read network config');
SELECT throws_ok($$SELECT * FROM public.postback_outbox$$,'42501',NULL,'member cannot read postback outbox');
SELECT throws_ok($$INSERT INTO public.signup_attributions (user_id, network) VALUES ('00000000-0000-0000-0000-000000000501','x')$$,'42501',NULL,'member cannot insert attribution for another user');
SELECT throws_ok($$INSERT INTO public.signup_attributions (user_id, network, click_id) VALUES ('00000000-0000-0000-0000-000000000502','direct','c1')$$,'23505',NULL,'attribution is bound once and cannot be re-bound');

SELECT * FROM finish();
ROLLBACK;
