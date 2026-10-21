BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(48);

SELECT ok(pg_catalog.to_regprocedure('public.unmatch(uuid)') IS NOT NULL, 'unmatch RPC exists');
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='public.unmatch(uuid)'::REGPROCEDURE), 'unmatch is SECURITY DEFINER');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.unnest(p.proconfig) cfg(setting) WHERE p.oid='public.unmatch(uuid)'::REGPROCEDURE AND cfg.setting::TEXT COLLATE "C"='search_path=public, pg_temp'::TEXT COLLATE "C"), 'unmatch fixes search_path');
SELECT ok(has_function_privilege('authenticated','public.unmatch(uuid)','EXECUTE'), 'authenticated can execute unmatch');
SELECT ok(NOT has_function_privilege('anon','public.unmatch(uuid)','EXECUTE'), 'anon cannot execute unmatch');
SELECT ok(NOT has_function_privilege('service_role','public.unmatch(uuid)','EXECUTE'), 'service_role cannot execute unmatch');
SELECT ok(pg_catalog.to_regprocedure('public.list_blocked_users()') IS NOT NULL, 'caller-scoped blocked-user list RPC exists');
SELECT ok(has_function_privilege('authenticated','public.list_blocked_users()','EXECUTE'), 'authenticated can list their own blocked users');
SELECT ok(NOT has_function_privilege('anon','public.list_blocked_users()','EXECUTE'), 'anon cannot list blocked users');
SELECT ok(NOT has_function_privilege('service_role','public.list_blocked_users()','EXECUTE'), 'service_role cannot invoke end-user blocked-user list');
SELECT ok(pg_catalog.to_regprocedure('public.submit_report(uuid,public.report_category,text,uuid)') IS NOT NULL, 'report RPC has client idempotency key');
SELECT ok(NOT has_table_privilege('authenticated','public.reports','INSERT') AND NOT has_column_privilege('authenticated','public.reports','reporter_id','INSERT'), 'authenticated report writes must use the report RPC');
SELECT ok(NOT has_table_privilege('authenticated','public.blocks','INSERT') AND NOT has_table_privilege('authenticated','public.blocks','DELETE'), 'authenticated block writes must use block and unblock RPCs');
SELECT ok(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reports' AND column_name='client_report_id'), 'reports store client_report_id');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname='public' AND tablename='reports' AND indexname='uq_reports_reporter_client_report_id'), 'report client id is unique per reporter');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_select_participant'), 'messages keep participant RLS policy');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='conversations' AND policyname='conversations_select_participant'), 'conversations keep participant RLS policy');
SELECT ok(NOT pg_catalog.has_function_privilege('anon','public.block_user(uuid)','EXECUTE') AND NOT pg_catalog.has_function_privilege('anon','public.unblock_user(uuid)','EXECUTE') AND NOT pg_catalog.has_function_privilege('anon','public.submit_report(uuid,public.report_category,text,uuid)','EXECUTE') AND NOT pg_catalog.has_function_privilege('anon','public.unmatch(uuid)','EXECUTE') AND NOT pg_catalog.has_function_privilege('anon','public.list_blocked_users()','EXECUTE'), 'anon cannot execute any safety RPC');
SELECT ok(NOT pg_catalog.has_function_privilege('service_role','public.block_user(uuid)','EXECUTE') AND NOT pg_catalog.has_function_privilege('service_role','public.unblock_user(uuid)','EXECUTE') AND NOT pg_catalog.has_function_privilege('service_role','public.submit_report(uuid,public.report_category,text,uuid)','EXECUTE') AND NOT pg_catalog.has_function_privilege('service_role','public.unmatch(uuid)','EXECUTE') AND NOT pg_catalog.has_function_privilege('service_role','public.list_blocked_users()','EXECUTE'), 'service_role cannot execute user-facing safety RPCs');
SELECT ok(pg_catalog.has_function_privilege('authenticated','public.block_user(uuid)','EXECUTE') AND pg_catalog.has_function_privilege('authenticated','public.unblock_user(uuid)','EXECUTE') AND pg_catalog.has_function_privilege('authenticated','public.submit_report(uuid,public.report_category,text,uuid)','EXECUTE') AND pg_catalog.has_function_privilege('authenticated','public.unmatch(uuid)','EXECUTE') AND pg_catalog.has_function_privilege('authenticated','public.list_blocked_users()','EXECUTE'), 'authenticated users can execute safety RPCs');

SELECT ok('explicit_content' = ANY(enum_range(NULL::public.report_category)::TEXT[]) AND 'fake_profile' = ANY(enum_range(NULL::public.report_category)::TEXT[]),'report_category has explicit_content and fake_profile');

INSERT INTO auth.users (id,aud,role,email,created_at,updated_at) VALUES
 ('00000000-0000-0000-0000-000000000981','authenticated','authenticated','p305-a@example.test',pg_catalog.now(),pg_catalog.now()),
 ('00000000-0000-0000-0000-000000000982','authenticated','authenticated','p305-b@example.test',pg_catalog.now(),pg_catalog.now()),
 ('00000000-0000-0000-0000-000000000983','authenticated','authenticated','p305-c@example.test',pg_catalog.now(),pg_catalog.now()),
 ('00000000-0000-0000-0000-000000000984','authenticated','authenticated','p305-d@example.test',pg_catalog.now(),pg_catalog.now());
INSERT INTO public.profiles (id,display_name,birth_date,city_region,relationship_intention,shared_interests,prompts,verification_status,is_discoverable,is_suspended,created_at)
VALUES
 ('00000000-0000-0000-0000-000000000981','P3 Safety Actor',DATE '1990-01-01','Manila','serious_relationship',ARRAY['coffee'],'[{"key":"weekend","answer":"hiking"},{"key":"values","answer":"kindness"},{"key":"relationship_goal","answer":"long term"}]','verified',TRUE,FALSE,pg_catalog.now()-INTERVAL '1 day'),
 ('00000000-0000-0000-0000-000000000982','P3 Safety Peer',DATE '1995-01-01','Cebu','serious_relationship',ARRAY['travel'],'[{"key":"weekend","answer":"reading"},{"key":"values","answer":"honesty"},{"key":"relationship_goal","answer":"long term"}]','verified',TRUE,FALSE,pg_catalog.now()-INTERVAL '3 hours'),
 ('00000000-0000-0000-0000-000000000983','P3 Other Actor',DATE '1991-01-01','Davao','serious_relationship',ARRAY['music'],'[{"key":"weekend","answer":"music"},{"key":"values","answer":"honesty"},{"key":"relationship_goal","answer":"long term"}]','verified',TRUE,FALSE,pg_catalog.now()-INTERVAL '1 day'),
 ('00000000-0000-0000-0000-000000000984','P3 Other Peer',DATE '1993-01-01','Iloilo','serious_relationship',ARRAY['books'],'[{"key":"weekend","answer":"reading"},{"key":"values","answer":"trust"},{"key":"relationship_goal","answer":"long term"}]','verified',TRUE,FALSE,pg_catalog.now()-INTERVAL '2 hours');
INSERT INTO public.profile_photos (user_id,storage_path,position) VALUES
 ('00000000-0000-0000-0000-000000000981','00000000-0000-0000-0000-000000000981/a-0.jpg',0),
 ('00000000-0000-0000-0000-000000000981','00000000-0000-0000-0000-000000000981/a-1.jpg',1),
 ('00000000-0000-0000-0000-000000000982','00000000-0000-0000-0000-000000000982/b-0.jpg',0),
 ('00000000-0000-0000-0000-000000000982','00000000-0000-0000-0000-000000000982/b-1.jpg',1);
INSERT INTO storage.objects (bucket_id,name,owner_id,metadata)
SELECT 'profile_photos',ph.storage_path,ph.user_id::TEXT,'{"mimetype":"image/jpeg","size":1024}'::JSONB
FROM public.profile_photos ph WHERE ph.user_id IN ('00000000-0000-0000-0000-000000000981'::UUID,'00000000-0000-0000-0000-000000000982'::UUID)
ON CONFLICT DO NOTHING;
INSERT INTO public.matches (user_a_id,user_b_id,status)
VALUES ('00000000-0000-0000-0000-000000000981','00000000-0000-0000-0000-000000000982','active');
INSERT INTO public.conversations (id,match_id)
SELECT '00000000-0000-0000-0000-000000000991'::UUID,id FROM public.matches
WHERE user_a_id='00000000-0000-0000-0000-000000000981' AND user_b_id='00000000-0000-0000-0000-000000000982';
INSERT INTO public.conversation_participants (conversation_id,user_id)
VALUES ('00000000-0000-0000-0000-000000000991','00000000-0000-0000-0000-000000000981'),
       ('00000000-0000-0000-0000-000000000991','00000000-0000-0000-0000-000000000982');
INSERT INTO public.messages (conversation_id,sender_id,body,client_message_id)
VALUES ('00000000-0000-0000-0000-000000000991','00000000-0000-0000-0000-000000000982','P3-05 existing message','00000000-0000-0000-0000-000000000995');
INSERT INTO public.swipes (actor_id,target_id,direction) VALUES
 ('00000000-0000-0000-0000-000000000981','00000000-0000-0000-0000-000000000982','like'),
 ('00000000-0000-0000-0000-000000000982','00000000-0000-0000-0000-000000000981','like');
INSERT INTO public.matches (user_a_id,user_b_id,status)
VALUES ('00000000-0000-0000-0000-000000000983','00000000-0000-0000-0000-000000000984','active');
INSERT INTO public.conversations (id,match_id)
SELECT '00000000-0000-0000-0000-000000000992'::UUID,id FROM public.matches
WHERE user_a_id='00000000-0000-0000-0000-000000000983' AND user_b_id='00000000-0000-0000-0000-000000000984';
INSERT INTO public.conversation_participants (conversation_id,user_id)
VALUES ('00000000-0000-0000-0000-000000000992','00000000-0000-0000-0000-000000000983'),
       ('00000000-0000-0000-0000-000000000992','00000000-0000-0000-0000-000000000984');
INSERT INTO public.messages (conversation_id,sender_id,body,client_message_id)
VALUES ('00000000-0000-0000-0000-000000000992','00000000-0000-0000-0000-000000000983','Conversation to unmatch','00000000-0000-0000-0000-000000000998');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000981","role":"authenticated"}';
SELECT is(public.block_user('00000000-0000-0000-0000-000000000982'),'00000000-0000-0000-0000-000000000982'::UUID,'blocking completes immediately');
RESET ROLE;
SELECT is((SELECT count(*)::INTEGER FROM public.swipes WHERE (actor_id='00000000-0000-0000-0000-000000000981' AND target_id='00000000-0000-0000-0000-000000000982') OR (actor_id='00000000-0000-0000-0000-000000000982' AND target_id='00000000-0000-0000-0000-000000000981')),0,'blocking removes both historical swipes so old directions cannot bypass block guard');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000981","role":"authenticated"}';
SELECT is((SELECT count(*)::INTEGER FROM public.get_discovery_feed(20,NULL) WHERE profile_id='00000000-0000-0000-0000-000000000982'),0,'blocked person is excluded from discovery');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000982','like')$$,'42501','blocked_pair','blocked pair cannot swipe or match');
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000982","role":"authenticated"}';
SELECT is((SELECT count(*)::INTEGER FROM public.get_discovery_feed(20,NULL) WHERE profile_id='00000000-0000-0000-0000-000000000981'),0,'person who was blocked cannot see blocker in discovery either');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000981','like')$$,'42501','blocked_pair','a blocked person cannot initiate a reverse like either');
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000981","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000991','blocked message','00000000-0000-0000-0000-000000000996')$$,'42501','conversation_not_sendable','blocked peer cannot receive a message');
SELECT is(public.unblock_user('00000000-0000-0000-0000-000000000982'),TRUE,'user may remove their own block');
SELECT is((SELECT count(*)::INTEGER FROM public.matches WHERE user_a_id='00000000-0000-0000-0000-000000000981' AND user_b_id='00000000-0000-0000-0000-000000000982' AND status='active'),0,'unblocking does not restore the previous match');
SELECT is((SELECT count(*)::INTEGER FROM public.list_blocked_users() WHERE blocked_id='00000000-0000-0000-0000-000000000982'),0,'unblock removes the person from the Blocked users list');
SELECT is((SELECT count(*)::INTEGER FROM public.get_discovery_feed(20,NULL) WHERE profile_id='00000000-0000-0000-0000-000000000982'),0,'after unblock the blocker still never sees the person in discovery');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000982','like')$$,'42501','blocked_pair','after unblock the blocker cannot like or re-match');
SELECT throws_ok($$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000991','after unblock','00000000-0000-0000-0000-000000000999')$$,'42501','conversation_not_sendable','after unblock the old chat stays closed');
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000982","role":"authenticated"}';
SELECT is((SELECT count(*)::INTEGER FROM public.get_discovery_feed(20,NULL) WHERE profile_id='00000000-0000-0000-0000-000000000981'),0,'after unblock the formerly blocked person never sees the blocker in discovery');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000981','like')$$,'42501','blocked_pair','after unblock the formerly blocked person cannot like or re-match');
SELECT ok(NOT has_table_privilege('authenticated','private.pair_exclusions','SELECT') AND NOT has_table_privilege('authenticated','private.pair_exclusions','DELETE'),'clients cannot read or remove the permanent pair exclusion');
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000981","role":"authenticated"}';
SELECT is((SELECT count(*)::INTEGER FROM public.matches WHERE user_a_id='00000000-0000-0000-0000-000000000981' AND user_b_id='00000000-0000-0000-0000-000000000982' AND status='active'),0,'old match remains ended after a new one-way like');
CREATE TEMP TABLE p305_report_replay AS
SELECT public.submit_report('00000000-0000-0000-0000-000000000982','scam','minimal safety report','00000000-0000-0000-0000-000000000997'::UUID) AS first_id,
       public.submit_report('00000000-0000-0000-0000-000000000982','scam','minimal safety report','00000000-0000-0000-0000-000000000997'::UUID) AS retry_id;
SELECT ok(public.submit_report('00000000-0000-0000-0000-000000000982','explicit_content',NULL,'00000000-0000-0000-0000-0000000009a1'::UUID) IS NOT NULL,'explicit_content is a real report category');
SELECT ok(public.submit_report('00000000-0000-0000-0000-000000000982','fake_profile',NULL,'00000000-0000-0000-0000-0000000009a2'::UUID) IS NOT NULL,'fake_profile is a real report category');
SELECT is((SELECT first_id FROM p305_report_replay),(SELECT retry_id FROM p305_report_replay),'report retry returns original report id');
SELECT is((SELECT count(*)::INTEGER FROM public.reports WHERE reporter_id='00000000-0000-0000-0000-000000000981' AND client_report_id='00000000-0000-0000-0000-000000000997'),1,'same client_report_id creates exactly one report');
RESET ROLE; -- audit_events is not readable by authenticated clients; verify as owner.
SELECT is((SELECT count(*)::INTEGER FROM public.audit_events WHERE actor_id='00000000-0000-0000-0000-000000000981' AND action::TEXT COLLATE "C"='report.submitted'::TEXT COLLATE "C" AND target_id=(SELECT first_id FROM p305_report_replay)),1,'report retry writes one audit event');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000983","role":"authenticated"}';
SELECT is_empty($$SELECT id FROM public.reports WHERE reporter_id='00000000-0000-0000-0000-000000000981'$$,'outsider cannot select another reporters reports');
SELECT is(public.unmatch('00000000-0000-0000-0000-000000000984'),TRUE,'unmatch ends an active match for the actor');
SELECT is((SELECT count(*)::INTEGER FROM public.get_conversation_list() WHERE conversation_id='00000000-0000-0000-0000-000000000992'),0,'unmatched actor no longer sees the conversation');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000984","role":"authenticated"}';
SELECT is((SELECT count(*)::INTEGER FROM public.get_conversation_list() WHERE conversation_id='00000000-0000-0000-0000-000000000992'),0,'other participant also loses the conversation');
SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE conversation_id='00000000-0000-0000-0000-000000000992'),0,'ended conversation messages are hidden by RLS from both participants');
RESET ROLE;

ROLLBACK;
