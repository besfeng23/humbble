BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(28);

SELECT ok(NOT has_function_privilege('anon', 'public.record_swipe(uuid, public.swipe_direction)', 'EXECUTE'), 'anon cannot execute record_swipe');
SELECT ok(NOT has_function_privilege('service_role', 'public.record_swipe(uuid, public.swipe_direction)', 'EXECUTE'), 'service_role cannot execute record_swipe');
SELECT ok(NOT has_function_privilege('anon', 'public.get_discovery_feed(integer, timestamp with time zone)', 'EXECUTE'), 'anon cannot execute get_discovery_feed');
SELECT ok(NOT has_function_privilege('service_role', 'public.get_discovery_feed(integer, timestamp with time zone)', 'EXECUTE'), 'service_role cannot execute get_discovery_feed');
SELECT ok(has_function_privilege('authenticated', 'public.record_swipe(uuid, public.swipe_direction)', 'EXECUTE'), 'authenticated can execute record_swipe');
SELECT ok(has_function_privilege('authenticated', 'public.get_discovery_feed(integer, timestamp with time zone)', 'EXECUTE'), 'authenticated can execute get_discovery_feed');
SELECT ok(NOT has_function_privilege('anon', 'public.send_message(uuid, text, uuid)', 'EXECUTE'), 'anon cannot execute send_message');
SELECT ok(NOT has_function_privilege('service_role', 'public.send_message(uuid, text, uuid)', 'EXECUTE'), 'service_role cannot execute send_message');
SELECT ok(has_function_privilege('authenticated', 'public.send_message(uuid, text, uuid)', 'EXECUTE'), 'authenticated can execute send_message');
SELECT ok(NOT has_function_privilege('anon', 'public.get_conversation_list()', 'EXECUTE'), 'anon cannot execute get_conversation_list');
SELECT ok(NOT has_function_privilege('service_role', 'public.get_conversation_list()', 'EXECUTE'), 'service_role cannot execute get_conversation_list');
SELECT ok(has_function_privilege('authenticated', 'public.get_conversation_list()', 'EXECUTE'), 'authenticated can execute get_conversation_list');
SELECT ok(NOT has_table_privilege('authenticated', 'public.messages', 'INSERT'), 'authenticated cannot bypass idempotent send_message with direct INSERT');
SELECT ok(NOT has_table_privilege('anon', 'public.messages', 'SELECT'), 'anon cannot read messages');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_select_participant'), 'message reads remain participant-RLS scoped');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_insert_active_unblocked_participant'), 'message send policy requires active unblocked participant');

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000951','authenticated','authenticated','p304-a@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000952','authenticated','authenticated','p304-b@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000953','authenticated','authenticated','p304-outsider@example.test',now(),now());
INSERT INTO public.profiles (id, display_name, birth_date, city_region, verification_status, is_discoverable)
VALUES
 ('00000000-0000-0000-0000-000000000951','Message Actor',DATE '1990-01-01','Manila','verified',TRUE),
 ('00000000-0000-0000-0000-000000000952','Message Peer',DATE '1991-01-01','Cebu','verified',TRUE),
 ('00000000-0000-0000-0000-000000000953','Message Outsider',DATE '1992-01-01','Davao','verified',TRUE);
INSERT INTO public.matches (user_a_id, user_b_id, status) VALUES
 ('00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952','active');
-- Fixed conversation id: seed.sql may already contain other conversations, so
-- every fixture and assertion below targets this conversation explicitly.
INSERT INTO public.conversations (id, match_id)
SELECT '00000000-0000-0000-0000-000000000990'::UUID, id FROM public.matches
WHERE user_a_id='00000000-0000-0000-0000-000000000951' AND user_b_id='00000000-0000-0000-0000-000000000952';
INSERT INTO public.conversation_participants (conversation_id,user_id)
SELECT '00000000-0000-0000-0000-000000000990'::UUID,u.user_id
FROM (VALUES ('00000000-0000-0000-0000-000000000951'::UUID),('00000000-0000-0000-0000-000000000952'::UUID)) u(user_id);
-- Seed a real participant message so the outsider RLS assertion is not vacuous.
INSERT INTO public.messages (conversation_id,sender_id,body,client_message_id)
VALUES ('00000000-0000-0000-0000-000000000990'::UUID,'00000000-0000-0000-0000-000000000952','Peer seed message','00000000-0000-0000-0000-000000000950'::UUID);

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000953',TRUE);
SELECT is((SELECT count(*)::INTEGER FROM public.messages), 0, 'outside user cannot read participant messages');
SELECT throws_ok(
  $$INSERT INTO public.messages (conversation_id,sender_id,body) VALUES ('00000000-0000-0000-0000-000000000990'::UUID,'00000000-0000-0000-0000-000000000953','forged')$$,
  '42501', NULL, 'outside user cannot insert messages directly');
SELECT throws_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000990'::UUID,'hello','00000000-0000-0000-0000-000000000961'::UUID)$$,
  '42501', 'conversation_not_sendable', 'unmatched outsider cannot send');
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000951',TRUE);
SELECT lives_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000990'::UUID,'Hello there','00000000-0000-0000-0000-000000000961'::UUID)$$,
  'matched participant can send');
SELECT lives_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000990'::UUID,'Hello there','00000000-0000-0000-0000-000000000961'::UUID)$$,
  'retry with the same client_message_id is accepted idempotently');
SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE sender_id='00000000-0000-0000-0000-000000000951'), 1, 'retry never creates a duplicate');
SELECT throws_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000990'::UUID,repeat('x',2001),'00000000-0000-0000-0000-000000000962'::UUID)$$,
  '22023', 'message_length_invalid', 'oversize message is rejected');
SELECT throws_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000990'::UUID,'   ','00000000-0000-0000-0000-000000000965'::UUID)$$,
  '22023', 'message_length_invalid', 'blank message is rejected');
SELECT throws_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000990'::UUID,'different body','00000000-0000-0000-0000-000000000961'::UUID)$$,
  '23505', 'client_message_id_conflict', 'idempotency key cannot be reused for different text');

SELECT lives_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000990'::UUID,'Second message','00000000-0000-0000-0000-000000000963'::UUID)$$,
  'a new client key creates a second message');
SELECT is((
  WITH ordered AS (
    SELECT id, created_at, row_number() OVER (ORDER BY created_at,id) AS rn
    FROM public.messages WHERE sender_id='00000000-0000-0000-0000-000000000951'
  ), cursor_row AS (SELECT created_at,id FROM ordered WHERE rn=1)
  SELECT count(*)::INTEGER FROM public.messages m,cursor_row c
  WHERE m.sender_id='00000000-0000-0000-0000-000000000951'
    AND (m.created_at,m.id)>(c.created_at,c.id)
), 1, 'tuple cursor catches up after a stable (created_at,id) cursor');

INSERT INTO public.blocks (blocker_id,blocked_id)
VALUES ('00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952');
SELECT throws_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000990'::UUID,'Blocked send','00000000-0000-0000-0000-000000000964'::UUID)$$,
  '42501', 'conversation_not_sendable', 'blocked participant cannot send');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
