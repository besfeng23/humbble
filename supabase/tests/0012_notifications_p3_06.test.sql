BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(47);

DELETE FROM auth.users WHERE id BETWEEN '00000000-0000-0000-0000-000000000061' AND '00000000-0000-0000-0000-000000000068';
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000061','authenticated','authenticated','push61@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000062','authenticated','authenticated','push62@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000063','authenticated','authenticated','push63@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000064','authenticated','authenticated','push64@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000065','authenticated','authenticated','push65@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000066','authenticated','authenticated','push66@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000067','authenticated','authenticated','push67@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000068','authenticated','authenticated','push68@example.test',now(),now());
INSERT INTO public.profiles(id, display_name, birth_date, verification_status, is_discoverable, is_suspended)
SELECT id, 'Push User ' || right(id::text,2), DATE '1990-01-01', 'verified', TRUE, FALSE
FROM auth.users WHERE id BETWEEN '00000000-0000-0000-0000-000000000061' AND '00000000-0000-0000-0000-000000000068';

SELECT has_table('public','push_tokens','push token registry exists');
SELECT has_table('public','notification_preferences','notification preferences exist');
SELECT has_table('public','notification_jobs','notification outbox exists');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.push_tokens'::regclass),'push tokens have RLS enabled');
INSERT INTO public.push_tokens(user_id,token,platform) VALUES
 ('00000000-0000-0000-0000-000000000061','ExponentPushToken[owner-61-token]','ios'),
 ('00000000-0000-0000-0000-000000000062','ExponentPushToken[owner-62-token]','android');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000061","role":"authenticated"}';
SELECT is((SELECT count(*)::integer FROM public.push_tokens),1,'authenticated user can see only their own push token');
SELECT is((SELECT count(*)::integer FROM public.push_tokens WHERE token='ExponentPushToken[owner-62-token]'),0,'another users token is hidden by RLS');
RESET ROLE;
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='push_tokens' AND policyname='push_tokens_select_own' AND qual LIKE '%auth.uid()%'),'token select policy is owner-scoped');
SELECT ok(has_function_privilege('authenticated','public.register_push_token(text,text)','EXECUTE') AND NOT has_function_privilege('anon','public.register_push_token(text,text)','EXECUTE') AND NOT has_function_privilege('service_role','public.register_push_token(text,text)','EXECUTE'),'register token RPC is authenticated-only');
SELECT ok(has_function_privilege('authenticated','public.unregister_push_token(text)','EXECUTE') AND NOT has_function_privilege('anon','public.unregister_push_token(text)','EXECUTE') AND NOT has_function_privilege('service_role','public.unregister_push_token(text)','EXECUTE'),'unregister token RPC is authenticated-only');
SELECT ok(has_function_privilege('service_role','public.claim_notification_jobs(integer)','EXECUTE') AND NOT has_function_privilege('authenticated','public.claim_notification_jobs(integer)','EXECUTE') AND NOT has_function_privilege('anon','public.claim_notification_jobs(integer)','EXECUTE'),'only service role can claim jobs');
SELECT ok((SELECT matches_enabled AND messages_enabled FROM public.notification_preferences WHERE user_id='00000000-0000-0000-0000-000000000061'),'new users default to both notification types on');

-- Preference off prevents both match and message jobs.
INSERT INTO public.notification_preferences(user_id,matches_enabled,messages_enabled) VALUES ('00000000-0000-0000-0000-000000000062',FALSE,FALSE) ON CONFLICT(user_id) DO UPDATE SET matches_enabled=FALSE,messages_enabled=FALSE;
INSERT INTO public.matches(id,user_a_id,user_b_id) VALUES ('10000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000062');
SELECT is((SELECT count(*)::integer FROM public.notification_jobs WHERE match_id='10000000-0000-0000-0000-000000000061'),1,'match job is created for the side whose preferences remain on');
SELECT is((SELECT count(*)::integer FROM public.notification_jobs WHERE match_id='10000000-0000-0000-0000-000000000061' AND recipient_id='00000000-0000-0000-0000-000000000062'),0,'preference-off recipient receives no match job');
INSERT INTO public.conversations(id,match_id) VALUES ('20000000-0000-0000-0000-000000000061','10000000-0000-0000-0000-000000000061');
INSERT INTO public.messages(id,conversation_id,sender_id,body) VALUES ('30000000-0000-0000-0000-000000000061','20000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000061','message to opted-out user');
SELECT is((SELECT count(*)::integer FROM public.notification_jobs WHERE message_id='30000000-0000-0000-0000-000000000061'),0,'preference-off recipient receives no message job');

INSERT INTO public.blocks(blocker_id,blocked_id) VALUES ('00000000-0000-0000-0000-000000000063','00000000-0000-0000-0000-000000000064');
INSERT INTO public.matches(id,user_a_id,user_b_id) VALUES ('10000000-0000-0000-0000-000000000063','00000000-0000-0000-0000-000000000063','00000000-0000-0000-0000-000000000064');
SELECT is((SELECT count(*)::integer FROM public.notification_jobs WHERE match_id='10000000-0000-0000-0000-000000000063'),0,'blocked pair creates no match notification jobs');
INSERT INTO public.conversations(id,match_id) VALUES ('20000000-0000-0000-0000-000000000063','10000000-0000-0000-0000-000000000063');
INSERT INTO public.messages(id,conversation_id,sender_id,body) VALUES ('30000000-0000-0000-0000-000000000063','20000000-0000-0000-0000-000000000063','00000000-0000-0000-0000-000000000063','message blocked pair');
SELECT is((SELECT count(*)::integer FROM public.notification_jobs WHERE message_id='30000000-0000-0000-0000-000000000063'),0,'blocked pair creates no message notification job');
INSERT INTO private.pair_exclusions(user_a_id,user_b_id,reason) VALUES ('00000000-0000-0000-0000-000000000065','00000000-0000-0000-0000-000000000066','test') ON CONFLICT DO NOTHING;
INSERT INTO public.matches(id,user_a_id,user_b_id) VALUES ('10000000-0000-0000-0000-000000000065','00000000-0000-0000-0000-000000000065','00000000-0000-0000-0000-000000000066');
SELECT is((SELECT count(*)::integer FROM public.notification_jobs WHERE match_id='10000000-0000-0000-0000-000000000065'),0,'pair exclusion creates no match notification jobs');
INSERT INTO public.conversations(id,match_id) VALUES ('20000000-0000-0000-0000-000000000065','10000000-0000-0000-0000-000000000065');
INSERT INTO public.messages(id,conversation_id,sender_id,body) VALUES ('30000000-0000-0000-0000-000000000065','20000000-0000-0000-0000-000000000065','00000000-0000-0000-0000-000000000065','message excluded pair');
SELECT is((SELECT count(*)::integer FROM public.notification_jobs WHERE message_id='30000000-0000-0000-0000-000000000065'),0,'pair exclusion creates no message notification job');

INSERT INTO public.matches(id,user_a_id,user_b_id) VALUES ('10000000-0000-0000-0000-000000000067','00000000-0000-0000-0000-000000000067','00000000-0000-0000-0000-000000000068');
INSERT INTO public.conversations(id,match_id) VALUES ('20000000-0000-0000-0000-000000000067','10000000-0000-0000-0000-000000000067');
INSERT INTO public.messages(id,conversation_id,sender_id,body) VALUES ('30000000-0000-0000-0000-000000000067','20000000-0000-0000-0000-000000000067','00000000-0000-0000-0000-000000000067','private message body for trigger test');
SELECT is((SELECT count(*)::integer FROM public.notification_jobs WHERE dedupe_key='message:30000000-0000-0000-0000-000000000067'),1,'message insert enqueues one recipient job');
INSERT INTO public.notification_jobs(recipient_id,notification_type,message_id,conversation_id,dedupe_key)
VALUES ('00000000-0000-0000-0000-000000000068','message','30000000-0000-0000-0000-000000000067','20000000-0000-0000-0000-000000000067','message:30000000-0000-0000-0000-000000000067') ON CONFLICT(dedupe_key) DO NOTHING;
SELECT is((SELECT count(*)::integer FROM public.notification_jobs WHERE dedupe_key='message:30000000-0000-0000-0000-000000000067'),1,'unique dedupe key prevents duplicate jobs');
SELECT ok(NOT has_table_privilege('authenticated','public.notification_jobs','SELECT') AND NOT has_table_privilege('anon','public.notification_jobs','SELECT'),'outbox is not readable by clients');
SELECT ok(NOT has_table_privilege('authenticated','public.push_tokens','INSERT') AND NOT has_table_privilege('authenticated','public.push_tokens','DELETE'),'clients mutate tokens only through RPCs');
SELECT ok((SELECT count(*) = 2 FROM public.notification_jobs WHERE match_id='10000000-0000-0000-0000-000000000067'),'new match creates one job per participant');
SELECT ok((SELECT NOT (to_jsonb(j) ? 'body') FROM public.notification_jobs j WHERE dedupe_key='message:30000000-0000-0000-0000-000000000067'),'outbox rows never store message text');

-- Additional coverage added during review.
SELECT ok(NOT has_sequence_privilege('anon','public.notification_jobs_id_seq','USAGE') AND NOT has_sequence_privilege('authenticated','public.notification_jobs_id_seq','USAGE')
  AND NOT has_sequence_privilege('anon','public.notification_jobs_id_seq','UPDATE'),'client roles have no access to the outbox id sequence');
SELECT ok(NOT has_table_privilege('anon','public.push_tokens','SELECT') AND NOT has_table_privilege('anon','public.notification_preferences','SELECT')
  AND NOT has_table_privilege('anon','public.notification_preferences','UPDATE') AND NOT has_table_privilege('anon','public.notification_jobs','INSERT'),'anon has no access to notification tables');
SELECT ok(NOT has_table_privilege('authenticated','public.notification_jobs','INSERT') AND NOT has_table_privilege('authenticated','public.notification_jobs','UPDATE'),'clients cannot write the outbox');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.role_routine_grants WHERE routine_schema='public'
  AND routine_name IN ('register_push_token','unregister_push_token','claim_notification_jobs') AND grantee IN ('PUBLIC','anon')),'no notification RPC is granted to PUBLIC or anon');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notification_jobs'
  AND column_name IN ('body','text','content','message','title','token')),'outbox has no column that could hold message text or tokens');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='private' AND p.proname IN ('enqueue_message_push','enqueue_match_push') AND p.prosrc ILIKE '%NEW.body%'),'enqueue triggers never read message body');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000063","role":"authenticated"}';
SELECT lives_ok($$SELECT public.register_push_token('ExponentPushToken[owner-63-token]','android')$$,'authenticated user can register their own device token');
SELECT lives_ok($$SELECT public.register_push_token('ExponentPushToken[owner-63-token]','android')$$,'re-registering the same token is idempotent for its owner');
-- Shared phone: the newest sign-in takes over a token previously owned by 61.
SELECT lives_ok($$SELECT public.register_push_token('ExponentPushToken[owner-61-token]','android')$$,'newest login takes over a device token owned by another user');
RESET ROLE;
SELECT is((SELECT user_id::text FROM public.push_tokens WHERE token='ExponentPushToken[owner-61-token]'),'00000000-0000-0000-0000-000000000063','taken-over token now belongs to the newest login');
SELECT is((SELECT count(*)::integer FROM public.push_tokens WHERE user_id='00000000-0000-0000-0000-000000000061'),0,'previous owner no longer has the device token');
SELECT is((SELECT count(*)::integer FROM public.push_tokens WHERE token='ExponentPushToken[owner-61-token]'),1,'takeover reassigns the row instead of duplicating it');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000063","role":"authenticated"}';
SELECT throws_ok($$SELECT public.register_push_token('short','ios')$$,'22023','invalid_push_token','malformed tokens are rejected');
SELECT throws_ok($$SELECT public.register_push_token('ExponentPushToken[owner-63-web]','web')$$,'22023','invalid_push_token','unsupported platforms are rejected');
SELECT is(public.unregister_push_token('ExponentPushToken[owner-62-token]'),FALSE,'a user cannot unregister another users token');
SELECT is(public.unregister_push_token('ExponentPushToken[owner-63-token]'),TRUE,'a user can unregister their own token');
UPDATE public.notification_preferences SET matches_enabled=FALSE WHERE user_id='00000000-0000-0000-0000-000000000061';
RESET ROLE;
SELECT ok((SELECT matches_enabled FROM public.notification_preferences WHERE user_id='00000000-0000-0000-0000-000000000061'),'RLS prevents changing another users preferences');

SELECT is((SELECT count(*)::integer FROM public.notification_jobs WHERE recipient_id='00000000-0000-0000-0000-000000000068' AND notification_type='message' AND status='pending'),1,'pending message job exists before opt-out');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000068","role":"authenticated"}';
UPDATE public.notification_preferences SET messages_enabled=FALSE WHERE user_id='00000000-0000-0000-0000-000000000068';
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.notification_jobs WHERE recipient_id='00000000-0000-0000-0000-000000000068' AND notification_type='message' AND status IN ('pending','failed')),0,'opting out cancels pending message jobs');

SELECT ok(NOT has_table_privilege('authenticated','public.notification_deliveries','SELECT') AND NOT has_table_privilege('anon','public.notification_deliveries','SELECT')
  AND has_table_privilege('service_role','public.notification_deliveries','INSERT'),'per-device delivery ledger is service-role only');
SELECT has_pk('public','notification_deliveries','delivery ledger is keyed per (job, token)');
SET LOCAL ROLE service_role;
SELECT ok((SELECT count(*) FROM public.claim_notification_jobs(100)) > 0,'service role claims pending jobs');
SELECT is((SELECT count(*)::integer FROM public.claim_notification_jobs(100)),0,'claimed jobs are not handed out twice');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
