-- P3-04: behaviour of get_conversation_list() (participant scoping, ordering,
-- last-message preview, outsider isolation and block exclusion).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(12);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000971','authenticated','authenticated','p304l-a@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000972','authenticated','authenticated','p304l-b@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000973','authenticated','authenticated','p304l-c@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000974','authenticated','authenticated','p304l-outsider@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000975','authenticated','authenticated','p304l-blocked@example.test',now(),now());
INSERT INTO public.profiles (id, display_name, birth_date, city_region, verification_status, is_discoverable) VALUES
 ('00000000-0000-0000-0000-000000000971','List Actor',DATE '1990-01-01','Manila','verified',TRUE),
 ('00000000-0000-0000-0000-000000000972','List Bea',DATE '1991-01-01','Cebu','verified',TRUE),
 ('00000000-0000-0000-0000-000000000973','List Carlo',DATE '1992-01-01','Davao','verified',TRUE),
 ('00000000-0000-0000-0000-000000000974','List Outsider',DATE '1993-01-01','Iloilo','verified',TRUE),
 ('00000000-0000-0000-0000-000000000975','List Blocked',DATE '1994-01-01','Baguio','verified',TRUE);
INSERT INTO public.matches (id, user_a_id, user_b_id, status) VALUES
 ('00000000-0000-0000-0000-000000000981','00000000-0000-0000-0000-000000000971','00000000-0000-0000-0000-000000000972','active'),
 ('00000000-0000-0000-0000-000000000982','00000000-0000-0000-0000-000000000971','00000000-0000-0000-0000-000000000973','active'),
 ('00000000-0000-0000-0000-000000000985','00000000-0000-0000-0000-000000000971','00000000-0000-0000-0000-000000000975','active');
INSERT INTO public.conversations (id, match_id, created_at) VALUES
 ('00000000-0000-0000-0000-000000000991','00000000-0000-0000-0000-000000000981', now() - interval '3 days'),
 ('00000000-0000-0000-0000-000000000992','00000000-0000-0000-0000-000000000982', now() - interval '2 days'),
 ('00000000-0000-0000-0000-000000000995','00000000-0000-0000-0000-000000000985', now() - interval '1 day');
INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES
 ('00000000-0000-0000-0000-000000000991','00000000-0000-0000-0000-000000000971'),
 ('00000000-0000-0000-0000-000000000991','00000000-0000-0000-0000-000000000972'),
 ('00000000-0000-0000-0000-000000000992','00000000-0000-0000-0000-000000000971'),
 ('00000000-0000-0000-0000-000000000992','00000000-0000-0000-0000-000000000973'),
 ('00000000-0000-0000-0000-000000000995','00000000-0000-0000-0000-000000000971'),
 ('00000000-0000-0000-0000-000000000995','00000000-0000-0000-0000-000000000975');
-- Conversation with Bea is older but has the newest message; Carlo's has none.
INSERT INTO public.messages (conversation_id, sender_id, body, created_at, client_message_id) VALUES
 ('00000000-0000-0000-0000-000000000991','00000000-0000-0000-0000-000000000972','Older hello', now() - interval '2 hours', '00000000-0000-0000-0000-000000000a01'),
 ('00000000-0000-0000-0000-000000000991','00000000-0000-0000-0000-000000000971','Newest reply', now() - interval '1 hour', '00000000-0000-0000-0000-000000000a02');

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000971',TRUE);
SELECT is((SELECT count(*)::INTEGER FROM public.get_conversation_list()), 3, 'participant sees each of their own conversations');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM public.get_conversation_list() l
  WHERE NOT EXISTS (SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = l.conversation_id AND cp.user_id = '00000000-0000-0000-0000-000000000971')
), 'participant never sees conversations they are not part of');
SELECT is((SELECT conversation_id FROM public.get_conversation_list() LIMIT 1),
  '00000000-0000-0000-0000-000000000991'::UUID, 'conversation with the newest message is listed first');
SELECT is((SELECT last_message FROM public.get_conversation_list() WHERE conversation_id='00000000-0000-0000-0000-000000000991'),
  'Newest reply', 'preview shows the latest message body');
SELECT is((SELECT counterpart_name FROM public.get_conversation_list() WHERE conversation_id='00000000-0000-0000-0000-000000000991'),
  'List Bea', 'counterpart is the other participant');
SELECT is((SELECT last_message FROM public.get_conversation_list() WHERE conversation_id='00000000-0000-0000-0000-000000000992'),
  'Start a conversation', 'empty conversation shows the start prompt');
SELECT ok((SELECT last_message_at IS NULL FROM public.get_conversation_list() WHERE conversation_id='00000000-0000-0000-0000-000000000992'),
  'empty conversation has no last_message_at');
SELECT is((SELECT array_agg(conversation_id) FROM public.get_conversation_list())::TEXT,
  '{00000000-0000-0000-0000-000000000991,00000000-0000-0000-0000-000000000995,00000000-0000-0000-0000-000000000992}',
  'conversations without messages sort after messaged ones, newest conversation first');

SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000972',TRUE);
SELECT is((SELECT count(*)::INTEGER FROM public.get_conversation_list()), 1, 'counterpart sees only the shared conversation');

SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000974',TRUE);
SELECT is((SELECT count(*)::INTEGER FROM public.get_conversation_list()), 0, 'outsider sees no conversations');

RESET ROLE;
INSERT INTO public.blocks (blocker_id, blocked_id)
VALUES ('00000000-0000-0000-0000-000000000971','00000000-0000-0000-0000-000000000975');
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000971',TRUE);
SELECT ok(NOT EXISTS (SELECT 1 FROM public.get_conversation_list() WHERE conversation_id='00000000-0000-0000-0000-000000000995'),
  'blocker no longer sees the blocked conversation');
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000975',TRUE);
SELECT is((SELECT count(*)::INTEGER FROM public.get_conversation_list()), 0, 'blocked user no longer sees the conversation either');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
