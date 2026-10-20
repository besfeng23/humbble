-- pgTAP tests for P2-02: discovery state, canonical matches, conversations,
-- messaging authorization, block severance, and concurrent reciprocal likes.
-- The concurrency test uses two independent dblink sessions against the local
-- database. This file owns and removes its reserved synthetic users at the end.
CREATE EXTENSION IF NOT EXISTS pgtap;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SET search_path = public, extensions, pg_temp;
SELECT plan(68);

-- Reserved synthetic identities. Remove leftovers first so reruns after a
-- failed local test can recover without requiring a database reset.
DELETE FROM auth.users
 WHERE id IN (
   '00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000012',
   '00000000-0000-0000-0000-000000000013',
   '00000000-0000-0000-0000-000000000014'
 );

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'p202-user-alpha@example.test', pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'p202-user-bravo@example.test', pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000013', 'authenticated', 'authenticated', 'p202-user-charlie@example.test', pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000014', 'authenticated', 'authenticated', 'p202-user-delta@example.test', pg_catalog.now(), pg_catalog.now());

-- This fixture is inserted as the trusted migration/test owner, so all four
-- synthetic profiles are eligible for the discovery and reciprocal-like tests.
INSERT INTO public.profiles
  (id, display_name, birth_date, verification_status, is_discoverable, is_suspended)
VALUES
  ('00000000-0000-0000-0000-000000000011', 'P2 Alpha', DATE '1990-01-01', 'verified', TRUE, FALSE),
  ('00000000-0000-0000-0000-000000000012', 'P2 Bravo', DATE '1990-01-02', 'verified', TRUE, FALSE),
  ('00000000-0000-0000-0000-000000000013', 'P2 Charlie', DATE '1990-01-03', 'verified', TRUE, FALSE),
  ('00000000-0000-0000-0000-000000000014', 'P2 Delta', DATE '1990-01-04', 'verified', TRUE, FALSE);

INSERT INTO public.daily_swipe_quotas (user_id, quota_date, likes_used)
VALUES ('00000000-0000-0000-0000-000000000012', CURRENT_DATE, 3);

-- Schema contract (11 assertions).
SELECT has_table('public', 'swipes', 'swipes table exists');
SELECT has_table('public', 'daily_swipe_quotas', 'daily_swipe_quotas table exists');
SELECT has_table('public', 'matches', 'matches table exists');
SELECT has_table('public', 'conversations', 'conversations table exists');
SELECT has_table('public', 'conversation_participants', 'conversation_participants table exists');
SELECT has_table('public', 'messages', 'messages table exists');
SELECT has_table('public', 'blocks', 'blocks table exists');
SELECT has_enum('public', 'swipe_direction', 'swipe_direction enum exists');
SELECT enum_has_labels(
  'public', 'swipe_direction', ARRAY['like'::TEXT COLLATE "C", 'pass'::TEXT COLLATE "C"],
  'swipe_direction has only like and pass values'
);
SELECT has_enum('public', 'match_status', 'match_status enum exists');
SELECT enum_has_labels(
  'public', 'match_status', ARRAY['active'::TEXT COLLATE "C", 'ended'::TEXT COLLATE "C"],
  'match_status has only active and ended values'
);

-- RLS is required on every P2-02 table (7 assertions, 12-18).
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname::TEXT COLLATE "C" = 'public'::TEXT COLLATE "C" AND c.relname::TEXT COLLATE "C" = 'swipes'::TEXT COLLATE "C"), 'RLS enabled on swipes');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname::TEXT COLLATE "C" = 'public'::TEXT COLLATE "C" AND c.relname::TEXT COLLATE "C" = 'daily_swipe_quotas'::TEXT COLLATE "C"), 'RLS enabled on daily_swipe_quotas');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname::TEXT COLLATE "C" = 'public'::TEXT COLLATE "C" AND c.relname::TEXT COLLATE "C" = 'matches'::TEXT COLLATE "C"), 'RLS enabled on matches');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname::TEXT COLLATE "C" = 'public'::TEXT COLLATE "C" AND c.relname::TEXT COLLATE "C" = 'conversations'::TEXT COLLATE "C"), 'RLS enabled on conversations');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname::TEXT COLLATE "C" = 'public'::TEXT COLLATE "C" AND c.relname::TEXT COLLATE "C" = 'conversation_participants'::TEXT COLLATE "C"), 'RLS enabled on conversation_participants');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname::TEXT COLLATE "C" = 'public'::TEXT COLLATE "C" AND c.relname::TEXT COLLATE "C" = 'messages'::TEXT COLLATE "C"), 'RLS enabled on messages');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname::TEXT COLLATE "C" = 'public'::TEXT COLLATE "C" AND c.relname::TEXT COLLATE "C" = 'blocks'::TEXT COLLATE "C"), 'RLS enabled on blocks');

-- Query-path indexes and uniqueness constraints (10 assertions, 19-28).
SELECT has_index('public', 'swipes', 'uq_swipes_actor_target', 'one swipe per actor-target pair');
SELECT has_index('public', 'swipes', 'idx_swipes_actor_created_at', 'swipe actor history index exists');
SELECT has_index('public', 'swipes', 'idx_swipes_target_direction_created_at', 'incoming-like lookup index exists');
SELECT has_index('public', 'matches', 'uq_matches_user_pair', 'canonical match pair is unique');
SELECT has_index('public', 'matches', 'idx_matches_user_b_status_created_at', 'matches searchable from user_b');
SELECT has_index('public', 'conversations', 'uq_conversations_match_id', 'one conversation per match');
SELECT has_index('public', 'conversation_participants', 'idx_conversation_participants_user_conversation', 'participant lookup index exists');
SELECT has_index('public', 'messages', 'idx_messages_conversation_cursor', 'message cursor index exists');
SELECT has_index('public', 'daily_swipe_quotas', 'pk_daily_swipe_quotas', 'per-user date quota lookup index exists');
SELECT has_index('public', 'blocks', 'idx_blocks_blocked_blocker', 'reverse block lookup index exists');

-- Application privilege boundaries (6 assertions, 29-34).
SELECT ok(
  NOT pg_catalog.has_table_privilege('authenticated', 'public.swipes', 'INSERT')
  AND NOT pg_catalog.has_table_privilege('authenticated', 'public.swipes', 'UPDATE')
  AND NOT pg_catalog.has_table_privilege('anon', 'public.swipes', 'INSERT'),
  'swipes are not directly writable by anon or authenticated clients'
);
SELECT ok(
  NOT pg_catalog.has_table_privilege('authenticated', 'public.daily_swipe_quotas', 'INSERT')
  AND NOT pg_catalog.has_table_privilege('authenticated', 'public.daily_swipe_quotas', 'UPDATE'),
  'daily swipe quotas are server-write only'
);
SELECT ok(
  NOT pg_catalog.has_table_privilege('authenticated', 'public.matches', 'INSERT')
  AND NOT pg_catalog.has_table_privilege('authenticated', 'public.matches', 'UPDATE'),
  'matches are server-write only'
);
SELECT ok(
  NOT pg_catalog.has_table_privilege('authenticated', 'public.conversations', 'INSERT')
  AND NOT pg_catalog.has_table_privilege('authenticated', 'public.conversation_participants', 'INSERT'),
  'conversation and participant rows are server-write only'
);
SELECT ok(
  NOT pg_catalog.has_table_privilege('authenticated', 'public.messages', 'UPDATE')
  AND NOT pg_catalog.has_table_privilege('authenticated', 'public.messages', 'DELETE'),
  'messages cannot be edited or deleted directly by clients'
);
SELECT ok(
  pg_catalog.has_table_privilege('authenticated', 'public.blocks', 'SELECT')
  AND pg_catalog.has_table_privilege('authenticated', 'public.blocks', 'DELETE')
  AND pg_catalog.has_column_privilege('authenticated', 'public.blocks', 'blocker_id', 'INSERT')
  AND pg_catalog.has_column_privilege('authenticated', 'public.blocks', 'blocked_id', 'INSERT')
  AND NOT pg_catalog.has_table_privilege('authenticated', 'public.blocks', 'UPDATE'),
  'clients may create/remove only their own blocks and cannot update block rows'
);

-- True two-session concurrency test. Session A holds the pair lock with an
-- uncommitted A->B like. Session B sends B->A asynchronously and must wait on
-- the same pair lock; when A commits, B sees the committed reverse like and
-- creates the unique match/conversation/participants once.
CREATE TEMP TABLE p2_02_concurrency_observation (pair_lock_waited BOOLEAN NOT NULL);
DO $concurrency$
DECLARE
  v_attempt INTEGER;
  v_lock_waited BOOLEAN := FALSE;
BEGIN
  PERFORM dblink_connect('p2_02_swipe_a', 'dbname=postgres user=postgres application_name=p2_02_swipe_a');
  PERFORM dblink_connect('p2_02_swipe_b', 'dbname=postgres user=postgres application_name=p2_02_swipe_b');
  PERFORM dblink_exec('p2_02_swipe_a', 'BEGIN');
  PERFORM 1
    FROM dblink(
      'p2_02_swipe_a',
      $$INSERT INTO public.swipes (actor_id, target_id, direction)
        VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'like')
        RETURNING id$$
    ) AS t(id UUID);

  PERFORM dblink_send_query(
    'p2_02_swipe_b',
    $$INSERT INTO public.swipes (actor_id, target_id, direction)
      VALUES ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000011', 'like')
      RETURNING id$$
  );

  FOR v_attempt IN 1..250 LOOP
    PERFORM pg_catalog.pg_stat_clear_snapshot();
    SELECT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_stat_activity AS a
       WHERE a.application_name::TEXT COLLATE "C" = 'p2_02_swipe_b'::TEXT COLLATE "C"
         AND a.wait_event_type::TEXT COLLATE "C" = 'Lock'::TEXT COLLATE "C"
    )
      INTO v_lock_waited;
    EXIT WHEN v_lock_waited;
    PERFORM pg_catalog.pg_sleep(0.02);
  END LOOP;

  INSERT INTO pg_temp.p2_02_concurrency_observation (pair_lock_waited)
  VALUES (v_lock_waited);

  PERFORM dblink_exec('p2_02_swipe_a', 'COMMIT');
  PERFORM 1 FROM dblink_get_result('p2_02_swipe_b') AS t(id UUID);
  -- Consume the terminal empty result so the connection is no longer busy.
  PERFORM 1 FROM dblink_get_result('p2_02_swipe_b') AS t(id UUID);
  PERFORM dblink_disconnect('p2_02_swipe_a');
  PERFORM dblink_disconnect('p2_02_swipe_b');
END;
$concurrency$;

-- A second pair makes the block/messaging policy checks independent of the
-- concurrent pair above. The inserts execute as the trusted test owner.
INSERT INTO public.swipes (actor_id, target_id, direction)
VALUES ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000014', 'like');
INSERT INTO public.swipes (actor_id, target_id, direction)
VALUES ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000013', 'like');

-- A test-only lookup table lets a caller attempt an insert against an unrelated
-- conversation ID without relying on a cross-user SELECT of protected tables.
CREATE TEMP TABLE p2_02_test_conversations (
  pair_name TEXT COLLATE "C" PRIMARY KEY,
  conversation_id UUID NOT NULL
);
INSERT INTO pg_temp.p2_02_test_conversations (pair_name, conversation_id)
SELECT 'alpha-bravo'::TEXT COLLATE "C", c.id
  FROM public.conversations AS c
  JOIN public.matches AS m ON m.id = c.match_id
 WHERE m.user_a_id = '00000000-0000-0000-0000-000000000011'
   AND m.user_b_id = '00000000-0000-0000-0000-000000000012';
INSERT INTO pg_temp.p2_02_test_conversations (pair_name, conversation_id)
SELECT 'charlie-delta'::TEXT COLLATE "C", c.id
  FROM public.conversations AS c
  JOIN public.matches AS m ON m.id = c.match_id
 WHERE m.user_a_id = '00000000-0000-0000-0000-000000000013'
   AND m.user_b_id = '00000000-0000-0000-0000-000000000014';
GRANT SELECT ON p2_02_test_conversations TO authenticated;

-- Match/conversation concurrency and canonical pair results (9 assertions, 35-43).
SELECT ok((SELECT pair_lock_waited FROM pg_temp.p2_02_concurrency_observation), 'concurrent reciprocal swipe waited on the canonical pair lock');
SELECT is((SELECT count(*)::INTEGER FROM public.matches WHERE user_a_id = '00000000-0000-0000-0000-000000000011' AND user_b_id = '00000000-0000-0000-0000-000000000012'), 1, 'concurrent reciprocal likes create exactly one match');
SELECT is((SELECT count(*)::INTEGER FROM public.conversations c JOIN public.matches m ON m.id = c.match_id WHERE m.user_a_id = '00000000-0000-0000-0000-000000000011' AND m.user_b_id = '00000000-0000-0000-0000-000000000012'), 1, 'concurrent reciprocal likes create exactly one conversation');
SELECT is((SELECT count(*)::INTEGER FROM public.conversation_participants cp JOIN public.conversations c ON c.id = cp.conversation_id JOIN public.matches m ON m.id = c.match_id WHERE m.user_a_id = '00000000-0000-0000-0000-000000000011' AND m.user_b_id = '00000000-0000-0000-0000-000000000012'), 2, 'a match creates exactly two conversation participants');
SELECT ok((SELECT user_a_id < user_b_id FROM public.matches WHERE user_a_id = '00000000-0000-0000-0000-000000000011' AND user_b_id = '00000000-0000-0000-0000-000000000012'), 'match user IDs are stored in canonical order');
SELECT results_eq(
  $$SELECT status::TEXT COLLATE "C" FROM public.matches WHERE user_a_id = '00000000-0000-0000-0000-000000000011' AND user_b_id = '00000000-0000-0000-0000-000000000012'$$,
  $$VALUES ('active'::TEXT COLLATE "C")$$,
  'new reciprocal match is active'
);
SELECT throws_ok(
  $$INSERT INTO public.swipes (actor_id, target_id, direction) VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'like')$$,
  '23505', NULL, 'duplicate actor-target swipe is rejected'
);
SELECT throws_ok(
  $$INSERT INTO public.matches (user_a_id, user_b_id) VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012')$$,
  '23505', NULL, 'duplicate canonical match pair is rejected'
);
SELECT throws_ok(
  $$INSERT INTO public.swipes (actor_id, target_id, direction) VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011', 'like')$$,
  '23514', 'Self-swipes are not allowed', 'self-swipe is rejected'
);

-- Row-owner privacy and client-supplied actor protection (7 assertions, 44-50).
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}';
SELECT is((SELECT count(*)::INTEGER FROM public.swipes WHERE actor_id = '00000000-0000-0000-0000-000000000011'), 1, 'user A can read own outgoing swipe');
SELECT is_empty($$SELECT id FROM public.swipes WHERE actor_id = '00000000-0000-0000-0000-000000000012'$$, 'user A cannot read user B outgoing swipe');
SELECT throws_ok(
  $$INSERT INTO public.swipes (actor_id, target_id, direction) VALUES ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000013', 'like')$$,
  '42501', NULL, 'authenticated client cannot spoof actor_id by inserting a swipe'
);
SELECT throws_ok(
  $$DELETE FROM public.swipes WHERE actor_id = '00000000-0000-0000-0000-000000000011'$$,
  '42501', NULL, 'authenticated client cannot delete server-owned swipe history'
);
SELECT is_empty($$SELECT user_id FROM public.daily_swipe_quotas WHERE user_id = '00000000-0000-0000-0000-000000000012'$$, 'user A cannot read user B quota');
SELECT is_empty($$SELECT id FROM public.matches WHERE user_a_id = '00000000-0000-0000-0000-000000000013' AND user_b_id = '00000000-0000-0000-0000-000000000014'$$, 'user A cannot read user C and user D match');
SELECT throws_ok(
  $$INSERT INTO public.daily_swipe_quotas (user_id, quota_date, likes_used) VALUES ('00000000-0000-0000-0000-000000000011', CURRENT_DATE, 0)$$,
  '42501', NULL, 'authenticated client cannot insert or alter quota rows'
);
RESET ROLE;
RESET "request.jwt.claims";

-- A non-participant cannot send to a real but unrelated conversation; active
-- participants can message, and RLS gives both participants read access (7 assertions, 51-57).
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.messages (conversation_id, sender_id, body) SELECT conversation_id, '00000000-0000-0000-0000-000000000011', 'not a participant' FROM pg_temp.p2_02_test_conversations WHERE pair_name::TEXT COLLATE "C" = 'charlie-delta'::TEXT COLLATE "C"$$,
  '42501', NULL, 'unrelated user cannot message another match conversation'
);
SELECT lives_ok(
  $$INSERT INTO public.messages (conversation_id, sender_id, body) SELECT c.id, '00000000-0000-0000-0000-000000000011', 'Hello from alpha' FROM public.conversations c JOIN public.matches m ON m.id = c.match_id WHERE m.user_a_id = '00000000-0000-0000-0000-000000000011' AND m.user_b_id = '00000000-0000-0000-0000-000000000012'$$,
  'active, unblocked match participant can send a message'
);
SELECT throws_ok(
  $$INSERT INTO public.messages (conversation_id, sender_id, body) SELECT c.id, '00000000-0000-0000-0000-000000000012', 'forged sender' FROM public.conversations c JOIN public.matches m ON m.id = c.match_id WHERE m.user_a_id = '00000000-0000-0000-0000-000000000011' AND m.user_b_id = '00000000-0000-0000-0000-000000000012'$$,
  '42501', NULL, 'sender_id cannot be forged as the other participant'
);
SELECT is((SELECT count(*)::INTEGER FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id JOIN public.matches mt ON mt.id = c.match_id WHERE mt.user_a_id = '00000000-0000-0000-0000-000000000011' AND mt.user_b_id = '00000000-0000-0000-0000-000000000012'), 1, 'sender can read message in own conversation');
RESET ROLE;
RESET "request.jwt.claims";

SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000012","role":"authenticated"}';
SELECT is((SELECT count(*)::INTEGER FROM public.messages), 1, 'conversation recipient can read the same message');
SELECT is_empty($$SELECT id FROM public.messages WHERE conversation_id = (SELECT conversation_id FROM pg_temp.p2_02_test_conversations WHERE pair_name::TEXT COLLATE "C" = 'charlie-delta'::TEXT COLLATE "C")$$, 'user B cannot read user C and user D messages');
SELECT throws_ok(
  $$UPDATE public.messages SET body = 'edited'$$,
  '42501', NULL, 'authenticated client cannot update immutable message rows'
);
RESET ROLE;
RESET "request.jwt.claims";
SELECT ok((SELECT last_message_at IS NOT NULL FROM public.conversations c JOIN public.matches m ON m.id = c.match_id WHERE m.user_a_id = '00000000-0000-0000-0000-000000000011' AND m.user_b_id = '00000000-0000-0000-0000-000000000012'), 'message insert updates conversation activity time');

-- Blocking ends the active relationship and immediately revokes send permission.
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000014","role":"authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.blocks (blocker_id, blocked_id) VALUES ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000013')$$,
  'user D can block user C'
);
SELECT is((SELECT count(*)::INTEGER FROM public.blocks WHERE blocker_id = '00000000-0000-0000-0000-000000000014'), 1, 'blocker can read their own block row');
SELECT throws_ok(
  $$INSERT INTO public.blocks (blocker_id, blocked_id) VALUES ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000014')$$,
  '42501', NULL, 'user cannot create a block using another user as blocker'
);
SELECT throws_ok(
  $$INSERT INTO public.blocks (blocker_id, blocked_id) VALUES ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000014')$$,
  '23514', 'Self-blocks are not allowed', 'self-block is rejected'
);
SELECT throws_ok(
  $$INSERT INTO public.blocks (blocker_id, blocked_id) VALUES ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000013')$$,
  '23505', NULL, 'duplicate block pair is rejected'
);
RESET ROLE;
RESET "request.jwt.claims";

SELECT results_eq(
  $$SELECT status::TEXT COLLATE "C" FROM public.matches WHERE user_a_id = '00000000-0000-0000-0000-000000000013' AND user_b_id = '00000000-0000-0000-0000-000000000014'$$,
  $$VALUES ('ended'::TEXT COLLATE "C")$$,
  'blocking ends the matched relationship'
);
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000013","role":"authenticated"}';
SELECT is_empty($$SELECT blocker_id FROM public.blocks WHERE blocker_id = '00000000-0000-0000-0000-000000000014'$$, 'blocked user cannot read the other user block record');
SELECT throws_ok(
  $$INSERT INTO public.messages (conversation_id, sender_id, body) SELECT conversation_id, '00000000-0000-0000-0000-000000000013', 'after block' FROM pg_temp.p2_02_test_conversations WHERE pair_name::TEXT COLLATE "C" = 'charlie-delta'::TEXT COLLATE "C"$$,
  '42501', NULL, 'blocked participants cannot send further messages'
);
SELECT throws_ok(
  $$INSERT INTO public.swipes (actor_id, target_id, direction) VALUES ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000014', 'like')$$,
  '42501', NULL, 'authenticated client cannot write a new swipe after block'
);
RESET ROLE;
RESET "request.jwt.claims";

-- Direct trusted-path guard test: a blocked pair is rejected before the unique
-- swipe constraint is reached. This is separate from the client grant denial.
SELECT throws_ok(
  $$INSERT INTO public.swipes (actor_id, target_id, direction) VALUES ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000014', 'like')$$,
  '23514', 'Swipes are prohibited when either user has blocked the other', 'trusted swipe insertion also rejects blocked pairs'
);

-- Cleanup committed fixtures so local test runs are repeatable.
DELETE FROM auth.users
 WHERE id IN (
   '00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000012',
   '00000000-0000-0000-0000-000000000013',
   '00000000-0000-0000-0000-000000000014'
 );
SELECT * FROM finish();
