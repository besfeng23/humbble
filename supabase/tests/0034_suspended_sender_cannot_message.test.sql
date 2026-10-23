-- Themis N46-01 (PR #46 review): a suspended sender must be denied by public.send_message / private.can_send_message exactly like
-- any other blocked sender, create no messages row, and enqueue no notification_jobs row. Non-suspended senders are unaffected, and
-- lifting the suspension restores sending. Also pins the function's posture (owner, SECURITY DEFINER, search_path, ACL) so the
-- CREATE OR REPLACE in 20261024000140 cannot silently widen it.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(29);

-- Fixed ids in a range no other test uses: seed.sql may already contain conversations/messages, so every query is scoped to them.
--   4601 S  sender who will be suspended        4602 R  active match partner of S      (conversation ...c01)
--   4603 B  sender who gets BLOCKED             4604 K  blocker of B                   (conversation ...c02)
--   4605 X  never suspended, never blocked      4606 Y  X's partner                    (conversation ...c03)
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
SELECT ('00000000-0000-0000-0000-00000000' || n)::UUID, 'authenticated', 'authenticated', 'n4601-' || n || '@example.test', now(), now()
  FROM (VALUES ('4601'),('4602'),('4603'),('4604'),('4605'),('4606')) v(n);
INSERT INTO public.profiles (id, display_name, birth_date, city_region, verification_status, is_discoverable)
SELECT ('00000000-0000-0000-0000-00000000' || n)::UUID, 'N4601 ' || n, DATE '1990-01-01', 'Manila', 'verified', TRUE
  FROM (VALUES ('4601'),('4602'),('4603'),('4604'),('4605'),('4606')) v(n);
INSERT INTO public.matches (user_a_id, user_b_id, status) VALUES
 ('00000000-0000-0000-0000-000000004601','00000000-0000-0000-0000-000000004602','active'),
 ('00000000-0000-0000-0000-000000004603','00000000-0000-0000-0000-000000004604','active'),
 ('00000000-0000-0000-0000-000000004605','00000000-0000-0000-0000-000000004606','active');
INSERT INTO public.conversations (id, match_id)
SELECT ('00000000-0000-0000-0000-000000000' || c)::UUID, m.id
  FROM (VALUES ('c01','4601','4602'),('c02','4603','4604'),('c03','4605','4606')) v(c, a, b)
  JOIN public.matches m ON m.user_a_id = ('00000000-0000-0000-0000-00000000' || v.a)::UUID
                       AND m.user_b_id = ('00000000-0000-0000-0000-00000000' || v.b)::UUID;
INSERT INTO public.conversation_participants (conversation_id, user_id)
SELECT ('00000000-0000-0000-0000-000000000' || c)::UUID, ('00000000-0000-0000-0000-00000000' || u)::UUID
  FROM (VALUES ('c01','4601'),('c01','4602'),('c02','4603'),('c02','4604'),('c03','4605'),('c03','4606')) v(c, u);

-- Returns "<sqlstate>|<message>" of the failure, or 'OK'. Runs as the caller (SECURITY INVOKER).
CREATE FUNCTION pg_temp.try_send(p_conv UUID, p_key UUID) RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.send_message(p_conv, 'n46-01 probe', p_key);
  RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || '|' || SQLERRM;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.try_send(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Function posture is unchanged (LB-3): owner, SECURITY DEFINER, pinned search_path, exact ACL.
-- ---------------------------------------------------------------------------------------------------------------------
SELECT ok((SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'private.can_send_message(uuid,uuid)'::regprocedure), 'can_send_message is SECURITY DEFINER');
SELECT is((SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = 'private.can_send_message(uuid,uuid)'::regprocedure), 'postgres', 'can_send_message is owned by postgres');
SELECT is((SELECT p.proconfig FROM pg_proc p WHERE p.oid = 'private.can_send_message(uuid,uuid)'::regprocedure), ARRAY['search_path=public, pg_temp']::TEXT[], 'can_send_message pins search_path = public, pg_temp');
SELECT is(
  (SELECT array_agg(pg_get_userbyid(a.grantee)::TEXT ORDER BY pg_get_userbyid(a.grantee)::TEXT)
     FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = 'private.can_send_message(uuid,uuid)'::regprocedure AND a.privilege_type = 'EXECUTE'),
  ARRAY['authenticated','postgres','service_role']::TEXT[],
  'can_send_message ACL is exactly owner + authenticated + service_role (nothing for PUBLIC/anon)');
SELECT ok(NOT has_function_privilege('anon', 'private.can_send_message(uuid,uuid)', 'EXECUTE'), 'anon cannot execute can_send_message');

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. A non-suspended sender still works, and the message enqueues exactly one push job for the recipient.
-- ---------------------------------------------------------------------------------------------------------------------
SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE conversation_id = '00000000-0000-0000-0000-000000000c01'), 0, 'baseline: no messages in the suspended-sender conversation');
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004601', TRUE);
SELECT ok(private.can_send_message('00000000-0000-0000-0000-000000000c01'::UUID, '00000000-0000-0000-0000-000000004601'::UUID), 'not suspended: can_send_message is true');
SELECT lives_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000c01'::UUID, 'before suspension', '00000000-0000-0000-0000-0000000a4601'::UUID)$$,
  'not suspended: sender can send');
RESET ROLE;
SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE conversation_id = '00000000-0000-0000-0000-000000000c01'), 1, 'not suspended: one message stored');
SELECT is((SELECT count(*)::INTEGER FROM public.notification_jobs WHERE conversation_id = '00000000-0000-0000-0000-000000000c01' AND notification_type = 'message' AND recipient_id = '00000000-0000-0000-0000-000000004602'), 1, 'not suspended: one push job for the recipient');

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Reference denial: a BLOCKED sender (B, blocked by K).
-- ---------------------------------------------------------------------------------------------------------------------
INSERT INTO public.blocks (blocker_id, blocked_id) VALUES ('00000000-0000-0000-0000-000000004604', '00000000-0000-0000-0000-000000004603');
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004603', TRUE);
SELECT throws_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000c02'::UUID, 'blocked', '00000000-0000-0000-0000-0000000a4603'::UUID)$$,
  '42501', 'conversation_not_sendable', 'blocked sender is denied with conversation_not_sendable');
CREATE TEMP TABLE n4601_blocked_denial AS SELECT pg_temp.try_send('00000000-0000-0000-0000-000000000c02'::UUID, '00000000-0000-0000-0000-0000000a4613'::UUID) AS denial;
GRANT SELECT ON n4601_blocked_denial TO PUBLIC;
RESET ROLE;
SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE conversation_id = '00000000-0000-0000-0000-000000000c02'), 0, 'blocked sender: no message row');
SELECT is((SELECT count(*)::INTEGER FROM public.notification_jobs WHERE conversation_id = '00000000-0000-0000-0000-000000000c02' AND notification_type = 'message'), 0, 'blocked sender: no notification job');

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Suspend S (as the moderation console does): the denial is IDENTICAL, nothing is created.
-- ---------------------------------------------------------------------------------------------------------------------
UPDATE public.profiles SET is_suspended = TRUE WHERE id = '00000000-0000-0000-0000-000000004601';
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004601', TRUE);
SELECT ok(NOT private.can_send_message('00000000-0000-0000-0000-000000000c01'::UUID, '00000000-0000-0000-0000-000000004601'::UUID), 'suspended: can_send_message is false');
SELECT throws_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000c01'::UUID, 'while suspended', '00000000-0000-0000-0000-0000000a4602'::UUID)$$,
  '42501', 'conversation_not_sendable', 'suspended sender is denied with conversation_not_sendable');
SELECT is(pg_temp.try_send('00000000-0000-0000-0000-000000000c01'::UUID, '00000000-0000-0000-0000-0000000a4612'::UUID),
          (SELECT denial FROM n4601_blocked_denial),
          'suspended sender gets the SAME SQLSTATE and message as a blocked sender');
RESET ROLE;
SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE conversation_id = '00000000-0000-0000-0000-000000000c01'), 1, 'suspended sender: no new message row (only the pre-suspension one)');
SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE sender_id = '00000000-0000-0000-0000-000000004601' AND client_message_id IN ('00000000-0000-0000-0000-0000000a4602', '00000000-0000-0000-0000-0000000a4612')), 0, 'suspended sender: the attempted idempotency keys stored nothing');
SELECT is((SELECT count(*)::INTEGER FROM public.notification_jobs WHERE conversation_id = '00000000-0000-0000-0000-000000000c01' AND notification_type = 'message'), 1, 'suspended sender: no new notification job (still only the pre-suspension one)');
SELECT is((SELECT count(*)::INTEGER FROM public.notification_jobs WHERE recipient_id = '00000000-0000-0000-0000-000000004602' AND dedupe_key LIKE 'message:%'), 1, 'suspended sender: recipient has no additional message push job anywhere');

-- Replaying an ALREADY stored message (same client_message_id and body) is idempotent and creates nothing new.
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004601', TRUE);
SELECT lives_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000c01'::UUID, 'before suspension', '00000000-0000-0000-0000-0000000a4601'::UUID)$$,
  'suspended sender: replay of the already-stored message returns the stored row (no new message)');
RESET ROLE;
SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE conversation_id = '00000000-0000-0000-0000-000000000c01'), 1, 'suspended sender: replay did not add a row');

-- Other, non-suspended members are unaffected: an unrelated pair, and the suspended member's own partner.
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004605', TRUE);
SELECT lives_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000c03'::UUID, 'unrelated pair', '00000000-0000-0000-0000-0000000a4605'::UUID)$$,
  'a non-suspended sender in an unrelated match can still send while another member is suspended');
SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004602', TRUE);
SELECT lives_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000c01'::UUID, 'partner reply', '00000000-0000-0000-0000-0000000a4606'::UUID)$$,
  'scope: the partner of a suspended member (not suspended) is not blocked by this change');
RESET ROLE;
SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE conversation_id = '00000000-0000-0000-0000-000000000c03'), 1, 'unrelated pair: message stored');

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Lifting the suspension restores sending immediately (flag is read on every call).
-- ---------------------------------------------------------------------------------------------------------------------
UPDATE public.profiles SET is_suspended = FALSE WHERE id = '00000000-0000-0000-0000-000000004601';
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004601', TRUE);
SELECT ok(private.can_send_message('00000000-0000-0000-0000-000000000c01'::UUID, '00000000-0000-0000-0000-000000004601'::UUID), 'suspension lifted: can_send_message is true again');
SELECT lives_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000c01'::UUID, 'after lift', '00000000-0000-0000-0000-0000000a4607'::UUID)$$,
  'suspension lifted: sender can send again');
RESET ROLE;
SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE sender_id = '00000000-0000-0000-0000-000000004601' AND conversation_id = '00000000-0000-0000-0000-000000000c01'), 2, 'suspension lifted: the new message is stored (2 from this sender in total)');
SELECT is((SELECT count(*)::INTEGER FROM public.notification_jobs WHERE conversation_id = '00000000-0000-0000-0000-000000000c01' AND notification_type = 'message' AND recipient_id = '00000000-0000-0000-0000-000000004602'), 2, 'suspension lifted: push job enqueued again for the recipient');

SELECT * FROM finish();
ROLLBACK;
