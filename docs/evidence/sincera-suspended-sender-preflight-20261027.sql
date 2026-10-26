BEGIN; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '30s';

DO $precheck$ BEGIN
 IF md5(pg_get_functiondef('private.can_send_message(uuid,uuid)'::regprocedure)) <> 'fab88d3d78f14c7d692ba0baeeac2694' THEN
  RAISE EXCEPTION 'hosted function changed; preflight must be reviewed again';
 END IF;
 IF EXISTS (SELECT 1 FROM auth.users WHERE id BETWEEN '00000000-0000-0000-0000-000000004601'::uuid AND '00000000-0000-0000-0000-000000004606'::uuid) THEN
  RAISE EXCEPTION 'synthetic fixture IDs already exist';
 END IF;
END $precheck$;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION private.can_send_message(
  p_conversation_id UUID,
  p_sender_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_a UUID;
  v_user_b UUID;
BEGIN
  IF p_sender_id IS NULL OR p_sender_id IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;

  SELECT m.user_a_id, m.user_b_id
    INTO v_user_a, v_user_b
    FROM public.conversations AS c
    JOIN public.matches AS m ON m.id = c.match_id
    JOIN public.conversation_participants AS cp
      ON cp.conversation_id = c.id AND cp.user_id = p_sender_id
   WHERE c.id = p_conversation_id
     AND (m.user_a_id = p_sender_id OR m.user_b_id = p_sender_id);

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM private.lock_user_pair(v_user_a, v_user_b);

  RETURN EXISTS (
    SELECT 1
      FROM public.conversations AS c
      JOIN public.matches AS m ON m.id = c.match_id
      JOIN public.conversation_participants AS cp
        ON cp.conversation_id = c.id AND cp.user_id = p_sender_id
     WHERE c.id = p_conversation_id
       AND (m.user_a_id = p_sender_id OR m.user_b_id = p_sender_id)
       AND m.status = 'active'::public.match_status
       AND NOT EXISTS (
         SELECT 1
           FROM public.blocks AS b
          WHERE (b.blocker_id = m.user_a_id AND b.blocked_id = m.user_b_id)
             OR (b.blocker_id = m.user_b_id AND b.blocked_id = m.user_a_id)
       )
       -- N46-01: a suspended sender is denied exactly like a blocked sender.
       AND NOT EXISTS (
         SELECT 1
           FROM public.profiles AS sender
          WHERE sender.id = p_sender_id
            AND sender.is_suspended
       )
  );
END;
$function$;

ALTER FUNCTION private.can_send_message(UUID, UUID) OWNER TO postgres;

REVOKE ALL ON FUNCTION private.can_send_message(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.can_send_message(UUID, UUID) TO authenticated, service_role;

DO $assert$
DECLARE
  v_fn  REGPROCEDURE := 'private.can_send_message(uuid,uuid)'::regprocedure;
  v_src TEXT;
  r     RECORD;
BEGIN
  SELECT p.prosecdef, p.provolatile, p.proisstrict, p.proconfig, pg_catalog.pg_get_userbyid(p.proowner) AS owner, p.prosrc
    INTO r
    FROM pg_catalog.pg_proc AS p
   WHERE p.oid = v_fn;

  IF NOT r.prosecdef THEN
    RAISE EXCEPTION 'private.can_send_message must be SECURITY DEFINER';
  END IF;
  IF r.owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'private.can_send_message must be owned by postgres (found %)', r.owner;
  END IF;
  IF r.provolatile <> 'v' OR r.proisstrict THEN
    RAISE EXCEPTION 'private.can_send_message must stay VOLATILE and not STRICT';
  END IF;
  IF r.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::TEXT[] THEN
    RAISE EXCEPTION 'private.can_send_message must pin search_path = public, pg_temp (found %)', r.proconfig;
  END IF;

  -- ACL must be exactly owner + authenticated + service_role, each EXECUTE with no grant option; nothing for PUBLIC/anon/others.
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc AS p
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
     WHERE p.oid = v_fn
       AND NOT (
         a.privilege_type = 'EXECUTE' AND NOT a.is_grantable
         AND a.grantee IN ('postgres'::REGROLE, 'authenticated'::REGROLE, 'service_role'::REGROLE)
       )
  ) THEN
    RAISE EXCEPTION 'private.can_send_message ACL must be exactly owner + authenticated + service_role EXECUTE (no PUBLIC/anon/other grantee)';
  END IF;
  IF (SELECT pg_catalog.count(DISTINCT a.grantee)
        FROM pg_catalog.pg_proc AS p
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
       WHERE p.oid = v_fn) <> 3 THEN
    RAISE EXCEPTION 'private.can_send_message must be executable by exactly postgres, authenticated and service_role';
  END IF;

  -- The new predicate must be present and the rest of the guard intact (catalog posture alone cannot prove the body).
  v_src := r.prosrc;
  IF v_src NOT LIKE '%sender.is_suspended%' OR v_src NOT LIKE '%public.blocks%' OR v_src NOT LIKE '%lock_user_pair%' THEN
    RAISE EXCEPTION 'private.can_send_message body lost the suspended-sender or block predicate';
  END IF;
END;
$assert$;

CREATE TEMP TABLE sincera_preflight_results (result text NOT NULL);

GRANT INSERT ON sincera_preflight_results TO authenticated;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SET search_path = public, extensions, pg_temp;

SELECT plan(29);

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

CREATE FUNCTION pg_temp.try_send(p_conv UUID, p_key UUID) RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.send_message(p_conv, 'n46-01 probe', p_key);
  RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || '|' || SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.try_send(UUID, UUID) TO authenticated;

INSERT INTO sincera_preflight_results (result) SELECT ok((SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'private.can_send_message(uuid,uuid)'::regprocedure), 'can_send_message is SECURITY DEFINER');

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = 'private.can_send_message(uuid,uuid)'::regprocedure), 'postgres', 'can_send_message is owned by postgres');

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT p.proconfig FROM pg_proc p WHERE p.oid = 'private.can_send_message(uuid,uuid)'::regprocedure), ARRAY['search_path=public, pg_temp']::TEXT[], 'can_send_message pins search_path = public, pg_temp');

INSERT INTO sincera_preflight_results (result) SELECT is(
  (SELECT array_agg(pg_get_userbyid(a.grantee)::TEXT ORDER BY pg_get_userbyid(a.grantee)::TEXT)
     FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = 'private.can_send_message(uuid,uuid)'::regprocedure AND a.privilege_type = 'EXECUTE'),
  ARRAY['authenticated','postgres','service_role']::TEXT[],
  'can_send_message ACL is exactly owner + authenticated + service_role (nothing for PUBLIC/anon)');

INSERT INTO sincera_preflight_results (result) SELECT ok(NOT has_function_privilege('anon', 'private.can_send_message(uuid,uuid)', 'EXECUTE'), 'anon cannot execute can_send_message');

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE conversation_id = '00000000-0000-0000-0000-000000000c01'), 0, 'baseline: no messages in the suspended-sender conversation');

SET LOCAL ROLE authenticated;

SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004601', TRUE);

INSERT INTO sincera_preflight_results (result) SELECT ok(private.can_send_message('00000000-0000-0000-0000-000000000c01'::UUID, '00000000-0000-0000-0000-000000004601'::UUID), 'not suspended: can_send_message is true');

INSERT INTO sincera_preflight_results (result) SELECT lives_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000c01'::UUID, 'before suspension', '00000000-0000-0000-0000-0000000a4601'::UUID)$$,
  'not suspended: sender can send');

RESET ROLE;

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE conversation_id = '00000000-0000-0000-0000-000000000c01'), 1, 'not suspended: one message stored');

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT count(*)::INTEGER FROM public.notification_jobs WHERE conversation_id = '00000000-0000-0000-0000-000000000c01' AND notification_type = 'message' AND recipient_id = '00000000-0000-0000-0000-000000004602'), 1, 'not suspended: one push job for the recipient');

INSERT INTO public.blocks (blocker_id, blocked_id) VALUES ('00000000-0000-0000-0000-000000004604', '00000000-0000-0000-0000-000000004603');

SET LOCAL ROLE authenticated;

SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004603', TRUE);

INSERT INTO sincera_preflight_results (result) SELECT throws_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000c02'::UUID, 'blocked', '00000000-0000-0000-0000-0000000a4603'::UUID)$$,
  '42501', 'conversation_not_sendable', 'blocked sender is denied with conversation_not_sendable');

CREATE TEMP TABLE n4601_blocked_denial AS SELECT pg_temp.try_send('00000000-0000-0000-0000-000000000c02'::UUID, '00000000-0000-0000-0000-0000000a4613'::UUID) AS denial;

GRANT SELECT ON n4601_blocked_denial TO PUBLIC;

RESET ROLE;

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE conversation_id = '00000000-0000-0000-0000-000000000c02'), 0, 'blocked sender: no message row');

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT count(*)::INTEGER FROM public.notification_jobs WHERE conversation_id = '00000000-0000-0000-0000-000000000c02' AND notification_type = 'message'), 0, 'blocked sender: no notification job');

UPDATE public.profiles SET is_suspended = TRUE WHERE id = '00000000-0000-0000-0000-000000004601';

SET LOCAL ROLE authenticated;

SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004601', TRUE);

INSERT INTO sincera_preflight_results (result) SELECT ok(NOT private.can_send_message('00000000-0000-0000-0000-000000000c01'::UUID, '00000000-0000-0000-0000-000000004601'::UUID), 'suspended: can_send_message is false');

INSERT INTO sincera_preflight_results (result) SELECT throws_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000c01'::UUID, 'while suspended', '00000000-0000-0000-0000-0000000a4602'::UUID)$$,
  '42501', 'conversation_not_sendable', 'suspended sender is denied with conversation_not_sendable');

INSERT INTO sincera_preflight_results (result) SELECT is(pg_temp.try_send('00000000-0000-0000-0000-000000000c01'::UUID, '00000000-0000-0000-0000-0000000a4612'::UUID),
          (SELECT denial FROM n4601_blocked_denial),
          'suspended sender gets the SAME SQLSTATE and message as a blocked sender');

RESET ROLE;

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE conversation_id = '00000000-0000-0000-0000-000000000c01'), 1, 'suspended sender: no new message row (only the pre-suspension one)');

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE sender_id = '00000000-0000-0000-0000-000000004601' AND client_message_id IN ('00000000-0000-0000-0000-0000000a4602', '00000000-0000-0000-0000-0000000a4612')), 0, 'suspended sender: the attempted idempotency keys stored nothing');

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT count(*)::INTEGER FROM public.notification_jobs WHERE conversation_id = '00000000-0000-0000-0000-000000000c01' AND notification_type = 'message'), 1, 'suspended sender: no new notification job (still only the pre-suspension one)');

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT count(*)::INTEGER FROM public.notification_jobs WHERE recipient_id = '00000000-0000-0000-0000-000000004602' AND dedupe_key LIKE 'message:%'), 1, 'suspended sender: recipient has no additional message push job anywhere');

SET LOCAL ROLE authenticated;

SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004601', TRUE);

INSERT INTO sincera_preflight_results (result) SELECT lives_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000c01'::UUID, 'before suspension', '00000000-0000-0000-0000-0000000a4601'::UUID)$$,
  'suspended sender: replay of the already-stored message returns the stored row (no new message)');

RESET ROLE;

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE conversation_id = '00000000-0000-0000-0000-000000000c01'), 1, 'suspended sender: replay did not add a row');

SET LOCAL ROLE authenticated;

SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004605', TRUE);

INSERT INTO sincera_preflight_results (result) SELECT lives_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000c03'::UUID, 'unrelated pair', '00000000-0000-0000-0000-0000000a4605'::UUID)$$,
  'a non-suspended sender in an unrelated match can still send while another member is suspended');

SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004602', TRUE);

INSERT INTO sincera_preflight_results (result) SELECT lives_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000c01'::UUID, 'partner reply', '00000000-0000-0000-0000-0000000a4606'::UUID)$$,
  'scope: the partner of a suspended member (not suspended) is not blocked by this change');

RESET ROLE;

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE conversation_id = '00000000-0000-0000-0000-000000000c03'), 1, 'unrelated pair: message stored');

UPDATE public.profiles SET is_suspended = FALSE WHERE id = '00000000-0000-0000-0000-000000004601';

SET LOCAL ROLE authenticated;

SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004601', TRUE);

INSERT INTO sincera_preflight_results (result) SELECT ok(private.can_send_message('00000000-0000-0000-0000-000000000c01'::UUID, '00000000-0000-0000-0000-000000004601'::UUID), 'suspension lifted: can_send_message is true again');

INSERT INTO sincera_preflight_results (result) SELECT lives_ok(
  $$SELECT * FROM public.send_message('00000000-0000-0000-0000-000000000c01'::UUID, 'after lift', '00000000-0000-0000-0000-0000000a4607'::UUID)$$,
  'suspension lifted: sender can send again');

RESET ROLE;

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT count(*)::INTEGER FROM public.messages WHERE sender_id = '00000000-0000-0000-0000-000000004601' AND conversation_id = '00000000-0000-0000-0000-000000000c01'), 2, 'suspension lifted: the new message is stored (2 from this sender in total)');

INSERT INTO sincera_preflight_results (result) SELECT is((SELECT count(*)::INTEGER FROM public.notification_jobs WHERE conversation_id = '00000000-0000-0000-0000-000000000c01' AND notification_type = 'message' AND recipient_id = '00000000-0000-0000-0000-000000004602'), 2, 'suspension lifted: push job enqueued again for the recipient');

DO $assert_results$ DECLARE failures text; n integer; BEGIN
 SELECT count(*), string_agg(result, E'
') FILTER (WHERE result NOT LIKE 'ok %') INTO n, failures FROM sincera_preflight_results;
 IF n <> 29 OR failures IS NOT NULL THEN
  RAISE EXCEPTION 'suspended-sender preflight failed: count %, failures %', n, failures;
 END IF;
END $assert_results$;

ROLLBACK;

DO $cleanup$ BEGIN
 IF md5(pg_get_functiondef('private.can_send_message(uuid,uuid)'::regprocedure)) <> 'fab88d3d78f14c7d692ba0baeeac2694' THEN
  RAISE EXCEPTION 'original function was not restored';
 END IF;
 IF EXISTS (SELECT 1 FROM auth.users WHERE id BETWEEN '00000000-0000-0000-0000-000000004601'::uuid AND '00000000-0000-0000-0000-000000004606'::uuid)
 OR EXISTS (SELECT 1 FROM pg_extension WHERE extname='pgtap') THEN
  RAISE EXCEPTION 'preflight cleanup did not restore original state';
 END IF;
END $cleanup$;
SELECT jsonb_build_object('assertions_passed',29,'rolled_back',true,'original_function_fingerprint','fab88d3d78f14c7d692ba0baeeac2694','fixture_users_remaining',0,'pgtap_installation_remaining',false) AS preflight;
