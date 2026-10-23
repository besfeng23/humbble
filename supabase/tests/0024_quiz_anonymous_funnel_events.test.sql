BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(186);

-- Test fixtures (rolled back). Session ids are valid random-style v4 UUIDs.
INSERT INTO public.attribution_networks (slug, display_name) VALUES ('qtestnet', 'Quiz Test Net');

-- ===== Structure: new table, no personal / linkable columns =====
SELECT has_table('public', 'quiz_events', 'public.quiz_events exists (separate from funnel_events)');
SELECT columns_are('public', 'quiz_events',
  ARRAY['session_id','event','step','answer','country_code','network','utm_source','utm_medium','utm_campaign','created_at'],
  'only non-personal columns: no user_id, ip, user agent, free text, url, click id, sub ids, attribution json or row id');
SELECT is((SELECT count(*)::INT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quiz_events'
            AND (data_type IN ('jsonb','json','inet','cidr','macaddr','ARRAY') OR column_name ~ '(click|sub|param|attrib|user|ip|agent|email|name|url|path|id$)' AND column_name <> 'session_id')),
  0, 'no json/array/inet columns and nothing named like click/sub/param/attribution/user/ip/agent/email/name/url/path/id');
-- F-01: nothing in quiz_events can be joined to signup_attributions / funnel_events / postback_outbox on a person-level key.
SELECT is((SELECT pg_catalog.array_agg(q.column_name::TEXT ORDER BY q.column_name)
             FROM information_schema.columns q
             JOIN information_schema.columns s ON s.column_name = q.column_name AND s.table_schema = 'public' AND s.table_name = 'signup_attributions'
            WHERE q.table_schema = 'public' AND q.table_name = 'quiz_events'),
  ARRAY['created_at','network'], 'the only column names shared with signup_attributions are network and created_at (no click_id, no params, no user_id)');
SELECT is((SELECT count(*)::INT FROM information_schema.columns q
             JOIN information_schema.columns f ON f.column_name = q.column_name AND f.table_schema = 'public' AND f.table_name IN ('funnel_events','postback_outbox','user_consents')
            WHERE q.table_schema = 'public' AND q.table_name = 'quiz_events' AND q.column_name NOT IN ('created_at','network','event')), 0,
  'no other shared column names with funnel_events / postback_outbox / user_consents');
SELECT col_is_pk('public', 'quiz_events', ARRAY['session_id','event','step'], 'primary key (session_id, event, step) provides idempotency and bounds rows per session');
SELECT is((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.quiz_events'::regclass), TRUE, 'RLS enabled');
SELECT is((SELECT count(*)::INT FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'quiz_events'), 0, 'no RLS policies: no client role can touch rows directly');
SELECT is((SELECT count(*)::INT FROM pg_catalog.pg_class c, LATERAL pg_catalog.aclexplode(c.relacl) a
            WHERE c.oid = 'public.quiz_events'::regclass AND a.grantee = 0), 0, 'no PUBLIC ACL entry on the table');
SELECT is((SELECT count(*)::INT FROM pg_catalog.pg_class WHERE relname = 'quiz_events_id_seq'), 0, 'no identity sequence (insert order is not stored)');
SELECT ok(NOT (has_table_privilege('anon','public.quiz_events','SELECT') OR has_table_privilege('anon','public.quiz_events','INSERT')
            OR has_table_privilege('anon','public.quiz_events','UPDATE') OR has_table_privilege('anon','public.quiz_events','DELETE')
            OR has_table_privilege('anon','public.quiz_events','TRUNCATE') OR has_table_privilege('anon','public.quiz_events','REFERENCES')
            OR has_table_privilege('anon','public.quiz_events','TRIGGER')), 'anon has no table privileges');
SELECT ok(NOT (has_table_privilege('authenticated','public.quiz_events','SELECT') OR has_table_privilege('authenticated','public.quiz_events','INSERT')
            OR has_table_privilege('authenticated','public.quiz_events','UPDATE') OR has_table_privilege('authenticated','public.quiz_events','DELETE')
            OR has_table_privilege('authenticated','public.quiz_events','TRUNCATE') OR has_table_privilege('authenticated','public.quiz_events','REFERENCES')
            OR has_table_privilege('authenticated','public.quiz_events','TRIGGER')), 'authenticated has no table privileges');
SELECT ok(has_table_privilege('service_role','public.quiz_events','SELECT'), 'service_role may SELECT');
SELECT ok(NOT (has_table_privilege('service_role','public.quiz_events','INSERT') OR has_table_privilege('service_role','public.quiz_events','UPDATE')
            OR has_table_privilege('service_role','public.quiz_events','DELETE') OR has_table_privilege('service_role','public.quiz_events','TRUNCATE')
            OR has_table_privilege('service_role','public.quiz_events','REFERENCES') OR has_table_privilege('service_role','public.quiz_events','TRIGGER')),
  'service_role is read-only on the table (no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER)');
SELECT is((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.quiz_event_rate'::regclass), TRUE, 'rate counter table has RLS enabled');
SELECT ok(NOT (has_table_privilege('anon','private.quiz_event_rate','SELECT') OR has_table_privilege('anon','private.quiz_event_rate','INSERT')
            OR has_table_privilege('authenticated','private.quiz_event_rate','SELECT') OR has_table_privilege('authenticated','private.quiz_event_rate','UPDATE')
            OR has_table_privilege('service_role','private.quiz_event_rate','SELECT') OR has_table_privilege('service_role','private.quiz_event_rate','DELETE')),
  'rate counter table is not reachable by any API role');

-- ===== Function privileges + pinned search_path =====
SELECT ok(has_function_privilege('anon','public.record_quiz_event(uuid,text,integer,text,text,text,text,text,text)','EXECUTE'), 'anon can call record_quiz_event');
SELECT ok(has_function_privilege('authenticated','public.record_quiz_event(uuid,text,integer,text,text,text,text,text,text)','EXECUTE'), 'authenticated can call record_quiz_event');
SELECT ok(NOT has_function_privilege('service_role','public.record_quiz_event(uuid,text,integer,text,text,text,text,text,text)','EXECUTE'), 'service_role cannot forge events through the client function');
SELECT ok(NOT (has_function_privilege('anon','public.purge_quiz_events(integer,integer,integer,integer)','EXECUTE') OR has_function_privilege('authenticated','public.purge_quiz_events(integer,integer,integer,integer)','EXECUTE')), 'clients cannot purge');
SELECT ok(has_function_privilege('service_role','public.purge_quiz_events(integer,integer,integer,integer)','EXECUTE'), 'service_role can purge');
SELECT ok(NOT (has_function_privilege('anon','public.quiz_funnel_summary(timestamptz,timestamptz)','EXECUTE') OR has_function_privilege('authenticated','public.quiz_funnel_summary(timestamptz,timestamptz)','EXECUTE')), 'clients cannot read the funnel summary');
SELECT ok(has_function_privilege('service_role','public.quiz_funnel_summary(timestamptz,timestamptz)','EXECUTE'), 'service_role can read the funnel summary');
SELECT ok(NOT (has_function_privilege('anon','private.quiz_event_shape_valid(text,integer,text,text)','EXECUTE')
            OR has_function_privilege('anon','private.quiz_event_utm_valid(text)','EXECUTE')
            OR has_function_privilege('anon','private.quiz_event_global_rate_per_minute()','EXECUTE')), 'private helpers are not callable by anon');
SELECT is((SELECT count(*)::INT FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(p.proacl) a
            WHERE p.proname IN ('record_quiz_event','purge_quiz_events','quiz_funnel_summary','quiz_event_shape_valid','quiz_event_utm_valid','quiz_event_global_rate_per_minute')
              AND p.pronamespace IN ('public'::regnamespace, 'private'::regnamespace) AND a.grantee = 0), 0, 'no PUBLIC EXECUTE on any of the new functions');
SELECT is((SELECT count(*)::INT FROM pg_catalog.pg_proc p
            WHERE p.proname IN ('record_quiz_event','purge_quiz_events','quiz_funnel_summary','quiz_event_shape_valid','quiz_event_utm_valid','quiz_event_global_rate_per_minute')
              AND p.pronamespace IN ('public'::regnamespace, 'private'::regnamespace)
              AND NOT (p.proconfig @> ARRAY['search_path=""'])), 0, 'every new function pins search_path (to empty)');
SELECT is((SELECT count(*)::INT FROM pg_catalog.pg_proc p
            WHERE p.proname IN ('record_quiz_event','purge_quiz_events','quiz_funnel_summary') AND p.pronamespace = 'public'::regnamespace
              AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'), 3, 'the three public functions are SECURITY DEFINER owned by postgres');
SELECT is((SELECT count(*)::INT FROM pg_catalog.pg_proc WHERE proname = 'record_quiz_event' AND pronamespace = 'public'::regnamespace), 1, 'exactly one record_quiz_event signature (no leftover JSON-attribution overload)');
SELECT is((SELECT pg_catalog.cardinality(p.proacl) FROM pg_catalog.pg_proc p WHERE p.proname = 'record_quiz_event' AND p.pronamespace = 'public'::regnamespace), 3, 'record_quiz_event ACL is exactly owner + anon + authenticated (no PUBLIC, no service_role)');
SELECT is(private.quiz_event_global_rate_per_minute(), 120, 'default global rate limit is 120 events/minute (F-03)');

-- ===== Retention schedule (F-02): pg_cron job exists when pg_cron is available =====
CREATE FUNCTION pg_temp.cron_state() RETURNS TEXT LANGUAGE plpgsql AS $f$
DECLARE v TEXT;
BEGIN
  IF pg_catalog.to_regclass('cron.job') IS NULL THEN RETURN 'absent'; END IF;
  EXECUTE $q$SELECT pg_catalog.count(*)::TEXT || '|' || COALESCE(pg_catalog.min(schedule), '') || '|' || COALESCE(pg_catalog.min(command), '') || '|' || COALESCE(pg_catalog.bool_and(active)::TEXT, '')
              FROM cron.job WHERE jobname = 'purge-quiz-events'$q$ INTO v;
  RETURN v;
END
$f$;
SELECT CASE WHEN pg_temp.cron_state() = 'absent' THEN skip('pg_cron is not installed in this database: purge is not scheduled (migration raised a NOTICE)', 1)
            ELSE is(pg_temp.cron_state(), '1|17 3 * * *|SELECT public.purge_quiz_events(90)|true', 'pg_cron: one active daily job runs purge_quiz_events(90)') END;

-- ===== Constraints (as superuser, direct): the table itself rejects bad rows =====
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event) VALUES ('11111111-1111-4111-8111-111111111111', 'signup_completed')$$, '23514', NULL, 'table CHECK: event allow-list');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event) VALUES ('11111111-1111-1111-8111-111111111111', 'quiz_started')$$, '23514', NULL, 'table CHECK: session id must be a v4 UUID');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event, step, answer) VALUES ('11111111-1111-4111-8111-111111111111', 'quiz_step', 1, 'free text')$$, '23514', NULL, 'table CHECK: answer enum');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event, step, country_code) VALUES ('11111111-1111-4111-8111-111111111111', 'quiz_step', 4, 'ZZ')$$, '23514', NULL, 'table CHECK: country must be a real ISO alpha-2');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event, step, answer) VALUES ('11111111-1111-4111-8111-111111111111', 'quiz_started', 0, 'serious')$$, '23514', NULL, 'table CHECK: non-step events carry no answer');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event, utm_campaign) VALUES ('11111111-1111-4111-8111-111111111111', 'quiz_started', 'Juan Dela Cruz 09171234567')$$, '23514', NULL, 'table CHECK: utm_campaign must be a clean slug (PII-looking free text rejected)');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event, utm_source) VALUES ('11111111-1111-4111-8111-111111111111', 'quiz_started', '09171234567')$$, '23514', NULL, 'table CHECK: phone-number-like utm value rejected');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event, utm_medium) VALUES ('11111111-1111-4111-8111-111111111111', 'quiz_started', '5d41402abc4b2a76b9719d911017c592')$$, '23514', NULL, 'table CHECK: hash-like (md5/sha) utm value rejected');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event, network) VALUES ('11111111-1111-4111-8111-111111111111', 'quiz_started', 'Juan Dela Cruz')$$, '23514', NULL, 'table CHECK: network must be a slug');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event, created_at) VALUES ('11111111-1111-4111-8111-111111111111', 'quiz_started', '2026-10-23 10:15:42+00')$$, '23514', NULL, 'table CHECK: created_at must be hour-aligned (no exact timestamps)');

-- ===== As anon: valid writes =====
SET LOCAL ROLE anon;
SELECT is(public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_started', 0, NULL, NULL, 'qtestnet', 'fb', 'cpc', 'spring_26'), TRUE, 'anon: quiz_started recorded with network and utm slugs');
SELECT is(public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_step', 1, 'marriage'), TRUE, 'anon: step 1 (intent) recorded');
SELECT is(public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_step', 2, '40_49'), TRUE, 'anon: step 2 (age) recorded');
SELECT is(public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_step', 3, 'now'), TRUE, 'anon: step 3 (timing) recorded');
SELECT is(public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_step', 4, NULL, 'SE'), TRUE, 'anon: step 4 (country) recorded');
SELECT is(public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_completed'), TRUE, 'anon: quiz_completed recorded (defaults step 0)');
SELECT is(public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_cta_clicked'), TRUE, 'anon: quiz_cta_clicked recorded');
-- idempotency
SELECT is(public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_step', 1, 'marriage'), FALSE, 'anon: exact retry is an idempotent no-op (FALSE)');
SELECT is(public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_step', 1, 'serious'), FALSE, 'anon: re-answer for the same (session,event,step) does not rewrite the first answer');
SELECT is(public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_started'), FALSE, 'anon: duplicate quiz_started is a no-op even with no attribution');
-- F-13: the per-session bound is structural: every legal combination is stored (7) and an 8th distinct one cannot exist
SELECT throws_ok($$SELECT public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_step', 5, 'serious')$$, '22023', 'invalid_quiz_event', 'an 8th distinct event for a session cannot be expressed (step 5)');
SELECT throws_ok($$SELECT public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_started', 1)$$, '22023', 'invalid_quiz_event', 'an 8th distinct event for a session cannot be expressed (quiz_started at step 1)');
-- attribution mapping cases
SELECT is(public.record_quiz_event('bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbb2', 'quiz_started', 0, NULL, NULL, 'nope', 'FB', 'a@b.co', '5d41402abc4b2a76b9719d911017c592'), TRUE, 'anon: unknown network and dirty utm values do not cost us the funnel event');
SELECT is(public.record_quiz_event('cccccccc-cccc-4ccc-bccc-ccccccccccc3', 'quiz_started'), TRUE, 'anon: no attribution recorded');
SELECT is(public.record_quiz_event('cccccccc-cccc-4ccc-bccc-ccccccccccc3', 'quiz_step', 1, 'serious'), TRUE, 'anon: direct session step 1');
-- F-04: PII-looking values are nulled (optional attribution) or rejected (everything else)
SELECT is(public.record_quiz_event('c0c0c0c0-c0c0-4c0c-80c0-c0c0c0c0c0c1', 'quiz_started', 0, NULL, NULL, 'Juan Dela Cruz 09171234567', 'Juan Dela Cruz 09171234567', '09171234567', 'my passport P1234567A'), TRUE, 'anon: PII-looking network/utm values are accepted as an event but nulled');
SELECT is(public.record_quiz_event('c0c0c0c0-c0c0-4c0c-80c0-c0c0c0c0c0c2', 'quiz_started', 0, NULL, NULL, NULL, 'jdelacruz@example.com', 'lat 14.5995 long 120.9842', '20261023123456'), TRUE, 'anon: email / coordinates-like utm values are accepted as an event but nulled');

-- ===== As anon: rejections =====
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'signup_completed')$$, '22023', 'invalid_quiz_event', 'rejects an event name outside the allow-list');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'Juan Dela Cruz 09171234567')$$, '22023', 'invalid_quiz_event', 'rejects a PII-looking event name');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 1, 'Juan Dela Cruz 09171234567')$$, '22023', 'invalid_quiz_event', 'rejects a PII-looking free-text answer');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 1, 'single')$$, '22023', 'invalid_quiz_event', 'rejects an answer outside the step enum');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 2, 'serious')$$, '22023', 'invalid_quiz_event', 'rejects another step''s enum value');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 4, NULL, 'ZZ')$$, '22023', 'invalid_quiz_event', 'rejects a non-ISO country');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 4, NULL, 'ph')$$, '22023', 'invalid_quiz_event', 'rejects a lowercase country code');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 4, NULL, 'Manila')$$, 'PT400', 'payload_too_large', 'rejects a free-text country (too long)');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 9, 'serious')$$, '22023', 'invalid_quiz_event', 'rejects an out-of-range step');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', -1, 'serious')$$, '22023', 'invalid_quiz_event', 'rejects a negative step');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', NULL, 'serious')$$, '22023', 'invalid_quiz_event', 'rejects a NULL step');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started', 0, 'serious')$$, '22023', 'invalid_quiz_event', 'rejects an answer on a non-step event');
SELECT throws_ok($$SELECT public.record_quiz_event(NULL, 'quiz_started')$$, '22023', 'invalid_session_id', 'rejects a NULL session id');
SELECT throws_ok($$SELECT public.record_quiz_event('00000000-0000-0000-0000-000000000000', 'quiz_started')$$, '22023', 'invalid_session_id', 'rejects the nil UUID');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-1ddd-8ddd-ddddddddddd4', 'quiz_started')$$, '22023', 'invalid_session_id', 'rejects a non-v4 UUID');
SELECT throws_ok($$SELECT public.record_quiz_event('not-a-uuid', 'quiz_started')$$, '22P02', NULL, 'rejects a malformed session id');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started', 0, NULL, NULL, pg_catalog.repeat('a', 65))$$, 'PT400', 'payload_too_large', 'oversize: network longer than 64 chars');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started', 0, NULL, NULL, NULL, pg_catalog.repeat('a', 65))$$, 'PT400', 'payload_too_large', 'oversize: utm_source longer than 64 chars');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started', 0, NULL, NULL, NULL, NULL, pg_catalog.repeat('a', 100000))$$, 'PT400', 'payload_too_large', 'oversize: a 100 KB utm_medium is refused before any lookup');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', pg_catalog.repeat('q', 100000))$$, 'PT400', 'payload_too_large', 'oversize: a 100 KB event name is refused');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started', 0, NULL, NULL, NULL, NULL, NULL, pg_catalog.repeat('a', 65))$$, 'PT400', 'payload_too_large', 'oversize: utm_campaign longer than 64 chars');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 1, pg_catalog.repeat('a', 33))$$, 'PT400', 'payload_too_large', 'oversize: answer longer than 32 chars');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 1, pg_catalog.repeat('a', 100000))$$, 'PT400', 'payload_too_large', 'oversize: a 100 KB answer is refused');
-- Boundary: exactly at the limit passes the length guard (and is then refused by the NEXT check, with the ordinary 22023, not PT400).
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'signup_completed', 0, NULL, NULL, pg_catalog.repeat('a', 64))$$, '22023', 'invalid_quiz_event', 'boundary: a 64-char network is within the limit (guard passes, event name then refused)');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 1, pg_catalog.repeat('a', 32))$$, '22023', 'invalid_quiz_event', 'boundary: a 32-char answer is within the limit (guard passes, enum then refuses it)');
-- Error contract (Themis LOW): oversize is SQLSTATE PT400 (PostgREST: HTTP 400, not 500 as for the old 54000), message unchanged, a fixed DETAIL, an
-- empty HINT, no echo of the value. Three probes on three different arguments (utm_source 'z', event 'y', network 'x'), each with its own marker
-- so an echo of any one of them in MESSAGE / DETAIL / HINT is caught (Themis N41-01).
DO $$
DECLARE v_state TEXT; v_msg TEXT; v_detail TEXT; v_hint TEXT;
BEGIN
  PERFORM public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started', 0, NULL, NULL, NULL, pg_catalog.repeat('z', 70));
  PERFORM pg_catalog.set_config('rqe.state', 'NO ERROR', true);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
  PERFORM pg_catalog.set_config('rqe.state', v_state, true);
  PERFORM pg_catalog.set_config('rqe.msg', v_msg, true);
  PERFORM pg_catalog.set_config('rqe.detail', COALESCE(v_detail, ''), true);
  PERFORM pg_catalog.set_config('rqe.hint', COALESCE(v_hint, ''), true);
END $$;
DO $$
DECLARE v_state TEXT; v_msg TEXT; v_detail TEXT; v_hint TEXT;
BEGIN
  PERFORM public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', pg_catalog.repeat('y', 40));
  PERFORM pg_catalog.set_config('rqe.state_ev', 'NO ERROR', true);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
  PERFORM pg_catalog.set_config('rqe.state_ev', v_state, true);
  PERFORM pg_catalog.set_config('rqe.msg_ev', v_msg, true);
  PERFORM pg_catalog.set_config('rqe.detail_ev', COALESCE(v_detail, ''), true);
  PERFORM pg_catalog.set_config('rqe.hint_ev', COALESCE(v_hint, ''), true);
END $$;
DO $$
DECLARE v_state TEXT; v_msg TEXT; v_detail TEXT; v_hint TEXT;
BEGIN
  PERFORM public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started', 0, NULL, NULL, pg_catalog.repeat('x', 70));
  PERFORM pg_catalog.set_config('rqe.state_nw', 'NO ERROR', true);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
  PERFORM pg_catalog.set_config('rqe.state_nw', v_state, true);
  PERFORM pg_catalog.set_config('rqe.msg_nw', v_msg, true);
  PERFORM pg_catalog.set_config('rqe.detail_nw', COALESCE(v_detail, ''), true);
  PERFORM pg_catalog.set_config('rqe.hint_nw', COALESCE(v_hint, ''), true);
END $$;
-- Themis N42-01: the same probe for the four remaining guarded arguments (answer, country, utm_medium, utm_campaign), each with its own marker.
DO $$
DECLARE v_sfx TEXT[] := ARRAY['an', 'co', 'um', 'uc']; v_i INTEGER; v_state TEXT; v_msg TEXT; v_detail TEXT; v_hint TEXT;
BEGIN
  FOR v_i IN 1..4 LOOP
    BEGIN
      PERFORM public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4',
        CASE WHEN v_i IN (1, 2) THEN 'quiz_step' ELSE 'quiz_started' END,
        CASE v_i WHEN 1 THEN 1 WHEN 2 THEN 4 ELSE 0 END,
        CASE WHEN v_i = 1 THEN pg_catalog.repeat('v', 40) END,
        CASE WHEN v_i = 2 THEN pg_catalog.repeat('k', 5) END,
        NULL,
        NULL,
        CASE WHEN v_i = 3 THEN pg_catalog.repeat('m', 70) END,
        CASE WHEN v_i = 4 THEN pg_catalog.repeat('c', 70) END);
      PERFORM pg_catalog.set_config('rqe.state_' || v_sfx[v_i], 'NO ERROR', true);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
      PERFORM pg_catalog.set_config('rqe.state_' || v_sfx[v_i], v_state, true);
      PERFORM pg_catalog.set_config('rqe.msg_' || v_sfx[v_i], v_msg, true);
      PERFORM pg_catalog.set_config('rqe.detail_' || v_sfx[v_i], COALESCE(v_detail, ''), true);
      PERFORM pg_catalog.set_config('rqe.hint_' || v_sfx[v_i], COALESCE(v_hint, ''), true);
    END;
  END LOOP;
END $$;
SELECT is(current_setting('rqe.state'), 'PT400', 'oversize raises SQLSTATE PT400 (PostgREST maps PTxyz to HTTP xyz = 400), no longer 54000 (HTTP 500)');
SELECT is(current_setting('rqe.msg'), 'payload_too_large', 'oversize message text is unchanged');
SELECT is(current_setting('rqe.detail'), 'An argument exceeds its maximum length (event, answer 32; country 2; network, utm 64).', 'oversize DETAIL is the fixed rule text');
SELECT is(current_setting('rqe.hint'), '', 'oversize HINT is empty (utm_source probe)');
SELECT ok(current_setting('rqe.msg') || current_setting('rqe.detail') || current_setting('rqe.hint') NOT LIKE '%zzzz%', 'the oversize error does not echo the caller-supplied utm_source value (message, detail, hint)');
SELECT is(current_setting('rqe.state_ev'), 'PT400', 'oversize event name raises PT400');
SELECT is(current_setting('rqe.detail_ev'), 'An argument exceeds its maximum length (event, answer 32; country 2; network, utm 64).', 'oversize event: DETAIL is the fixed rule text');
SELECT is(current_setting('rqe.hint_ev'), '', 'oversize event: HINT is empty');
SELECT ok(current_setting('rqe.msg_ev') || current_setting('rqe.detail_ev') || current_setting('rqe.hint_ev') NOT LIKE '%yyyy%', 'the oversize error does not echo the caller-supplied event value (message, detail, hint)');
SELECT is(current_setting('rqe.state_nw'), 'PT400', 'oversize network raises PT400');
SELECT is(current_setting('rqe.detail_nw'), 'An argument exceeds its maximum length (event, answer 32; country 2; network, utm 64).', 'oversize network: DETAIL is the fixed rule text');
SELECT is(current_setting('rqe.hint_nw'), '', 'oversize network: HINT is empty');
SELECT ok(current_setting('rqe.msg_nw') || current_setting('rqe.detail_nw') || current_setting('rqe.hint_nw') NOT LIKE '%xxxx%', 'the oversize error does not echo the caller-supplied network value (message, detail, hint)');
SELECT is(current_setting('rqe.state_an'), 'PT400', 'oversize answer raises PT400');
SELECT is(current_setting('rqe.detail_an'), 'An argument exceeds its maximum length (event, answer 32; country 2; network, utm 64).', 'oversize answer: DETAIL is the fixed rule text');
SELECT is(current_setting('rqe.hint_an'), '', 'oversize answer: HINT is empty');
SELECT ok(current_setting('rqe.msg_an') || current_setting('rqe.detail_an') || current_setting('rqe.hint_an') NOT LIKE '%vvvv%', 'the oversize error does not echo the caller-supplied answer value (message, detail, hint)');
SELECT is(current_setting('rqe.state_co'), 'PT400', 'oversize country raises PT400');
SELECT is(current_setting('rqe.detail_co'), 'An argument exceeds its maximum length (event, answer 32; country 2; network, utm 64).', 'oversize country: DETAIL is the fixed rule text');
SELECT is(current_setting('rqe.hint_co'), '', 'oversize country: HINT is empty');
SELECT ok(current_setting('rqe.msg_co') || current_setting('rqe.detail_co') || current_setting('rqe.hint_co') NOT LIKE '%kkkk%', 'the oversize error does not echo the caller-supplied country value (message, detail, hint)');
SELECT is(current_setting('rqe.state_um'), 'PT400', 'oversize utm_medium raises PT400');
SELECT is(current_setting('rqe.detail_um'), 'An argument exceeds its maximum length (event, answer 32; country 2; network, utm 64).', 'oversize utm_medium: DETAIL is the fixed rule text');
SELECT is(current_setting('rqe.hint_um'), '', 'oversize utm_medium: HINT is empty');
SELECT ok(current_setting('rqe.msg_um') || current_setting('rqe.detail_um') || current_setting('rqe.hint_um') NOT LIKE '%mmmm%', 'the oversize error does not echo the caller-supplied utm_medium value (message, detail, hint)');
SELECT is(current_setting('rqe.state_uc'), 'PT400', 'oversize utm_campaign raises PT400');
SELECT is(current_setting('rqe.detail_uc'), 'An argument exceeds its maximum length (event, answer 32; country 2; network, utm 64).', 'oversize utm_campaign: DETAIL is the fixed rule text');
SELECT is(current_setting('rqe.hint_uc'), '', 'oversize utm_campaign: HINT is empty');
SELECT ok(current_setting('rqe.msg_uc') || current_setting('rqe.detail_uc') || current_setting('rqe.hint_uc') NOT LIKE '%cccc%', 'the oversize error does not echo the caller-supplied utm_campaign value (message, detail, hint)');
-- No side effect (Themis N41-02): oversize calls on every guarded argument leave quiz_events and the rate counter exactly as they were.
RESET ROLE;
SELECT pg_catalog.set_config('rqe.rows_before', (SELECT pg_catalog.count(*)::TEXT FROM public.quiz_events), true);
SELECT pg_catalog.set_config('rqe.rate_before', (SELECT COALESCE(pg_catalog.sum(n), 0)::TEXT || '/' || pg_catalog.count(*)::TEXT FROM private.quiz_event_rate), true);
SET LOCAL ROLE anon;
DO $$
DECLARE v_hits INTEGER := 0; v_i INTEGER;
BEGIN
  FOR v_i IN 1..7 LOOP
    BEGIN
      PERFORM public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4',
        CASE WHEN v_i = 1 THEN pg_catalog.repeat('a', 33) ELSE 'quiz_step' END,
        1,
        CASE WHEN v_i = 2 THEN pg_catalog.repeat('a', 33) END,
        CASE WHEN v_i = 3 THEN 'PHL' END,
        CASE WHEN v_i = 4 THEN pg_catalog.repeat('a', 65) END,
        CASE WHEN v_i = 5 THEN pg_catalog.repeat('a', 65) END,
        CASE WHEN v_i = 6 THEN pg_catalog.repeat('a', 65) END,
        CASE WHEN v_i = 7 THEN pg_catalog.repeat('a', 65) END);
    EXCEPTION WHEN SQLSTATE 'PT400' THEN
      v_hits := v_hits + 1;
    END;
  END LOOP;
  PERFORM pg_catalog.set_config('rqe.oversize_hits', v_hits::TEXT, true);
END $$;
RESET ROLE;
SELECT is(current_setting('rqe.oversize_hits'), '7', 'oversize on each of the 7 guarded arguments raises PT400');
SELECT is((SELECT pg_catalog.count(*)::TEXT FROM public.quiz_events), current_setting('rqe.rows_before'), 'oversize calls wrote no quiz_events row (row count before = after)');
SELECT is((SELECT COALESCE(pg_catalog.sum(n), 0)::TEXT || '/' || pg_catalog.count(*)::TEXT FROM private.quiz_event_rate), current_setting('rqe.rate_before'), 'oversize calls did not move the rate counter (sum of n / bucket rows before = after)');
-- Themis N42-02: the length guard precedes ANY table access. With BOTH tables renamed away an oversize call still raises PT400, while a valid call
-- needs them (42P01), and transaction-level stats show an oversize call does no scan / insert / update / delete on either table.
ALTER TABLE private.quiz_event_rate RENAME TO qer_renamed;
ALTER TABLE public.quiz_events RENAME TO qe_renamed;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started', 0, NULL, NULL, pg_catalog.repeat('a', 65))$$, 'PT400', 'payload_too_large', 'oversize raises PT400 before touching any table (both tables renamed away)');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started')$$, '42P01', NULL, 'sanity: a valid call does need the tables (42P01 while they are renamed)');
RESET ROLE;
ALTER TABLE private.qer_renamed RENAME TO quiz_event_rate;
ALTER TABLE public.qe_renamed RENAME TO quiz_events;
CREATE TEMP TABLE rqe_stat0 AS SELECT relname, seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del FROM pg_stat_xact_user_tables WHERE relname IN ('quiz_events', 'quiz_event_rate');
SET LOCAL ROLE anon;
DO $$ BEGIN BEGIN PERFORM public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started', 0, NULL, NULL, pg_catalog.repeat('a', 65)); EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END; END $$;
RESET ROLE;
SELECT is((SELECT count(*)::INT FROM (SELECT relname, seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del FROM pg_stat_xact_user_tables WHERE relname IN ('quiz_events', 'quiz_event_rate') EXCEPT SELECT * FROM rqe_stat0) d), 0, 'an oversize call performs no scan/insert/update/delete on quiz_events or quiz_event_rate (pg_stat_xact_user_tables unchanged)');
DROP TABLE rqe_stat0;
-- Themis N42-03: the second PT429 raise site (atomic-counter loser) behaviourally. A BEFORE INSERT trigger that skips the counter upsert makes the
-- upsert return no row, which is the loser path. Dropped straight after, so later tests are unaffected.
CREATE FUNCTION pg_temp.rqe_skip_ins() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NULL; END $f$;
CREATE TRIGGER rqe_t_site2 BEFORE INSERT ON private.quiz_event_rate FOR EACH ROW EXECUTE FUNCTION pg_temp.rqe_skip_ins();
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd6', 'quiz_started')$$, 'PT429', 'rate_limited', 'rate limit site 2 (atomic-counter loser) raises PT429');
RESET ROLE;
DROP TRIGGER rqe_t_site2 ON private.quiz_event_rate;
DROP FUNCTION pg_temp.rqe_skip_ins();
SELECT is((SELECT count(*)::INT FROM public.quiz_events WHERE session_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd6'), 0, 'rate limit site 2 loser stored nothing');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.record_quiz_event(p_session_id => 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4', p_event => 'quiz_started', p_click_id => 'abc')$$, '42883', NULL, 'the function no longer accepts a click id (or any attribution JSON)');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started', 0, NULL, NULL, NULL, NULL, NULL, NULL, '{"click_id":"x"}'::JSONB)$$, '42883', NULL, 'a JSON attribution argument is not accepted');

-- ===== As anon: no read / update / delete / truncate, no direct insert =====
SELECT throws_ok($$SELECT * FROM public.quiz_events$$, '42501', NULL, 'anon cannot SELECT');
SELECT throws_ok($$SELECT count(*) FROM public.quiz_events$$, '42501', NULL, 'anon cannot even count');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event) VALUES ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started')$$, '42501', NULL, 'anon cannot INSERT directly (only through the function)');
SELECT throws_ok($$UPDATE public.quiz_events SET answer = 'serious'$$, '42501', NULL, 'anon cannot UPDATE');
SELECT throws_ok($$DELETE FROM public.quiz_events$$, '42501', NULL, 'anon cannot DELETE');
SELECT throws_ok($$TRUNCATE public.quiz_events$$, '42501', NULL, 'anon cannot TRUNCATE');
SELECT throws_ok($$SELECT * FROM private.quiz_event_rate$$, '42501', NULL, 'anon cannot read the rate counter');
SELECT throws_ok($$SELECT public.purge_quiz_events(90)$$, '42501', NULL, 'anon cannot purge');
SELECT throws_ok($$SELECT * FROM public.quiz_funnel_summary()$$, '42501', NULL, 'anon cannot read the funnel summary');
SELECT throws_ok($$SELECT private.quiz_event_shape_valid('quiz_started', 0, NULL, NULL)$$, '42501', NULL, 'anon cannot call private helpers');
RESET ROLE;

-- ===== As authenticated: same contract, and the caller is NOT linked =====
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}';
SELECT is(public.record_quiz_event('eeeeeeee-eeee-4eee-aeee-eeeeeeeeeee5', 'quiz_started'), TRUE, 'authenticated: can record (still anonymous)');
SELECT throws_ok($$SELECT * FROM public.quiz_events$$, '42501', NULL, 'authenticated cannot SELECT');
SELECT throws_ok($$UPDATE public.quiz_events SET answer = 'serious'$$, '42501', NULL, 'authenticated cannot UPDATE');
SELECT throws_ok($$DELETE FROM public.quiz_events$$, '42501', NULL, 'authenticated cannot DELETE');
SELECT throws_ok($$TRUNCATE public.quiz_events$$, '42501', NULL, 'authenticated cannot TRUNCATE');
SELECT throws_ok($$SELECT public.purge_quiz_events(90)$$, '42501', NULL, 'authenticated cannot purge');
RESET ROLE;
SELECT is((SELECT count(*)::INT FROM public.quiz_events WHERE session_id = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeee5'), 1, 'the authenticated caller produced a row...');
SELECT is((SELECT count(*)::INT FROM public.quiz_events q WHERE q.session_id = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeee5' AND to_jsonb(q)::TEXT LIKE '%00000000-0000-0000-0000-000000000701%'), 0, '...that contains no trace of the caller user id');

-- ===== As service_role: read, summary, but no writes =====
SET LOCAL ROLE service_role;
SELECT is((SELECT count(*)::INT FROM public.quiz_events WHERE session_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 7, 'service_role reads the full funnel of session A (7 rows)');
SELECT is((SELECT answer FROM public.quiz_events WHERE session_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' AND step = 1), 'marriage', 'first answer is kept (idempotent, no rewrite)');
SELECT is((SELECT country_code FROM public.quiz_events WHERE session_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' AND event = 'quiz_step' AND step = 4), 'SE', 'country stored as ISO alpha-2');
SELECT is((SELECT network || '|' || utm_source || '|' || utm_medium || '|' || utm_campaign FROM public.quiz_events WHERE session_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' AND event = 'quiz_started'), 'qtestnet|fb|cpc|spring_26', 'allow-listed network and clean utm slugs are stored');
SELECT is((SELECT count(*)::INT FROM public.quiz_events WHERE created_at <> pg_catalog.date_trunc('hour', created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 0, 'every stored created_at is rounded to the hour (UTC)');
SELECT is((SELECT network IS NULL AND utm_source IS NULL AND utm_medium IS NULL AND utm_campaign IS NULL FROM public.quiz_events WHERE session_id = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbb2'), TRUE, 'unknown network and dirty utm values are stored as NULL');
SELECT is((SELECT network IS NULL AND utm_source IS NULL FROM public.quiz_events WHERE session_id = 'cccccccc-cccc-4ccc-bccc-ccccccccccc3' AND event = 'quiz_started'), TRUE, 'no attribution => NULL network/utm');
SELECT is((SELECT network IS NULL AND utm_source IS NULL AND utm_medium IS NULL AND utm_campaign IS NULL FROM public.quiz_events WHERE session_id = 'c0c0c0c0-c0c0-4c0c-80c0-c0c0c0c0c0c1'), TRUE, 'F-04: name + phone / passport-looking input stored as NULL');
SELECT is((SELECT network IS NULL AND utm_source IS NULL AND utm_medium IS NULL AND utm_campaign IS NULL FROM public.quiz_events WHERE session_id = 'c0c0c0c0-c0c0-4c0c-80c0-c0c0c0c0c0c2'), TRUE, 'F-04: email / coordinates / long digit string stored as NULL');
SELECT is((SELECT count(*)::INT FROM public.quiz_events q WHERE to_jsonb(q)::TEXT ~* '(juan|cruz|0917|passport|example\.com|14\.5995)'), 0, 'F-04: no PII-looking string landed anywhere in the table');
SELECT is((SELECT count(*)::INT FROM public.quiz_events WHERE session_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'), 0, 'rejected calls left no rows');
SELECT lives_ok($$SELECT * FROM public.quiz_funnel_summary(now() - interval '1 day', now() + interval '1 day')$$, 'service_role can run the funnel summary');
SELECT is((SELECT sessions FROM public.quiz_funnel_summary(now() - interval '1 day', now() + interval '1 day') WHERE network = 'qtestnet' AND event = 'quiz_started'), 1::BIGINT, 'summary: one qtestnet session started');
SELECT is((SELECT sessions FROM public.quiz_funnel_summary(now() - interval '1 day', now() + interval '1 day') WHERE network = 'qtestnet' AND utm_source = 'fb' AND utm_campaign = 'spring_26' AND event = 'quiz_cta_clicked'), 1::BIGINT, 'summary: a session network and utm are inherited by its later events');
SELECT is((SELECT sessions FROM public.quiz_funnel_summary(now() - interval '1 day', now() + interval '1 day') WHERE network = 'direct' AND event = 'quiz_step' AND step = 1), 1::BIGINT, 'summary: sessions without click params roll up under direct');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event) VALUES ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started')$$, '42501', NULL, 'service_role cannot INSERT directly');
SELECT throws_ok($$UPDATE public.quiz_events SET answer = NULL$$, '42501', NULL, 'service_role cannot UPDATE');
SELECT throws_ok($$DELETE FROM public.quiz_events$$, '42501', NULL, 'service_role cannot DELETE directly');
SELECT throws_ok($$TRUNCATE public.quiz_events$$, '42501', NULL, 'service_role cannot TRUNCATE');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started')$$, '42501', NULL, 'service_role cannot forge client events');
RESET ROLE;

-- ===== Global per-minute breaker (atomic counter). now() is fixed inside the transaction, so the minute bucket is stable. =====
INSERT INTO private.quiz_event_rate (bucket, n) VALUES (pg_catalog.date_trunc('minute', pg_catalog.now()), 118)
  ON CONFLICT (bucket) DO UPDATE SET n = 118;
SET LOCAL ROLE anon;
SELECT is(public.record_quiz_event('99999999-9999-4999-8999-999999999991', 'quiz_started'), TRUE, 'rate limit: event 119 of 120 accepted');
SELECT is(public.record_quiz_event('99999999-9999-4999-8999-999999999992', 'quiz_started'), TRUE, 'rate limit: event 120 of 120 accepted');
SELECT throws_ok($$SELECT public.record_quiz_event('99999999-9999-4999-8999-999999999993', 'quiz_started')$$, 'PT429', 'rate_limited', 'rate limit: event 121 is rejected with PT429 (HTTP 429; cheap peek, no insert)');
-- Error contract (Themis N41-04): PT429, message unchanged, fixed DETAIL, empty HINT, and no echo of the caller-supplied session id.
DO $$
DECLARE v_state TEXT; v_msg TEXT; v_detail TEXT; v_hint TEXT;
BEGIN
  PERFORM public.record_quiz_event('99999999-9999-4999-8999-999999999993', 'quiz_started');
  PERFORM pg_catalog.set_config('rqe.state_rl', 'NO ERROR', true);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
  PERFORM pg_catalog.set_config('rqe.state_rl', v_state, true);
  PERFORM pg_catalog.set_config('rqe.msg_rl', v_msg, true);
  PERFORM pg_catalog.set_config('rqe.detail_rl', COALESCE(v_detail, ''), true);
  PERFORM pg_catalog.set_config('rqe.hint_rl', COALESCE(v_hint, ''), true);
END $$;
SELECT is(current_setting('rqe.state_rl'), 'PT429', 'rate limit raises SQLSTATE PT429 (PostgREST: HTTP 429), no longer 53400 (HTTP 500)');
SELECT is(current_setting('rqe.msg_rl'), 'rate_limited', 'rate limit message text is unchanged');
SELECT is(current_setting('rqe.detail_rl'), 'The global per-minute event limit is reached; events are not recorded until the next minute.', 'rate limit DETAIL is the fixed text');
SELECT ok(current_setting('rqe.hint_rl') = '' AND current_setting('rqe.msg_rl') || current_setting('rqe.detail_rl') NOT LIKE '%99999999%', 'rate limit error has an empty HINT and does not echo the caller-supplied session id');
RESET ROLE;
SELECT is((SELECT n FROM private.quiz_event_rate WHERE bucket = pg_catalog.date_trunc('minute', pg_catalog.now())), 120, 'the counter stopped exactly at the cap');
SELECT is((SELECT count(*)::INT FROM public.quiz_events WHERE session_id = '99999999-9999-4999-8999-999999999993'), 0, 'a rate-limited call stored nothing');
SELECT is((SELECT (pg_catalog.length(p.prosrc) - pg_catalog.length(pg_catalog.replace(p.prosrc, 'ERRCODE = ''PT429''', ''))) / pg_catalog.length('ERRCODE = ''PT429''') FROM pg_catalog.pg_proc p WHERE p.oid = 'public.record_quiz_event(uuid,text,integer,text,text,text,text,text,text)'::pg_catalog.regprocedure), 2, 'both rate_limited raise sites (peek and atomic-counter loser) use PT429');
SELECT is((SELECT p.prosrc LIKE '%53400%' FROM pg_catalog.pg_proc p WHERE p.oid = 'public.record_quiz_event(uuid,text,integer,text,text,text,text,text,text)'::pg_catalog.regprocedure), FALSE, 'record_quiz_event no longer uses 53400 anywhere');
-- cap lowered by an operator takes effect immediately; restore afterwards
CREATE OR REPLACE FUNCTION private.quiz_event_global_rate_per_minute() RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 0; $$;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.record_quiz_event('99999999-9999-4999-8999-999999999994', 'quiz_started')$$, 'PT429', 'rate_limited', 'a cap of 0 refuses every new event (PT429)');
RESET ROLE;
CREATE OR REPLACE FUNCTION private.quiz_event_global_rate_per_minute() RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 120; $$;
SET LOCAL ROLE anon;
SELECT is(public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_started'), FALSE, 'rate limit: idempotent retries are still answered (FALSE) when the minute is full');
RESET ROLE;

-- ===== Purge / retention (bounded batch loop) =====
INSERT INTO public.quiz_events (session_id, event, created_at)
  SELECT gen_random_uuid(), 'quiz_started', pg_catalog.date_trunc('hour', pg_catalog.now()) - INTERVAL '100 days' FROM generate_series(1, 25);
INSERT INTO public.quiz_events (session_id, event, created_at) VALUES
  ('abababab-abab-4bab-8bab-abababababa2', 'quiz_started', pg_catalog.date_trunc('hour', pg_catalog.now()) - INTERVAL '89 days');
INSERT INTO private.quiz_event_rate (bucket, n) VALUES (pg_catalog.date_trunc('minute', pg_catalog.now()) - INTERVAL '3 days', 5);
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.purge_quiz_events(1)$$, '22023', 'retention_too_short', 'purge refuses a retention shorter than 7 days');
SELECT throws_ok($$SELECT public.purge_quiz_events(NULL)$$, '22023', 'retention_too_short', 'purge refuses NULL retention');
SELECT is(public.purge_quiz_events(90, 10, 15), 15, 'purge is bounded per call by p_max_rows (batches of 10 then 5)');
SELECT is((SELECT count(*)::INT FROM public.quiz_events WHERE created_at < pg_catalog.now() - INTERVAL '90 days'), 10, 'the remaining expired rows wait for the next call');
SELECT is(public.purge_quiz_events(90, 4), 10, 'the next call drains the rest in a loop of batches (4+4+2)');
SELECT is((SELECT count(*)::INT FROM public.quiz_events WHERE created_at < pg_catalog.now() - INTERVAL '90 days'), 0, 'nothing older than 90 days remains');
SELECT is((SELECT count(*)::INT FROM public.quiz_events WHERE session_id = 'abababab-abab-4bab-8bab-abababababa2'), 1, 'a row inside the retention window survives');
RESET ROLE;
SELECT is((SELECT count(*)::INT FROM private.quiz_event_rate WHERE bucket < pg_catalog.now() - INTERVAL '2 days'), 0, 'old rate-counter buckets are purged with the events');
SET LOCAL ROLE service_role;
SELECT is(public.purge_quiz_events(30), 1, 'a shorter retention purges the 89-day-old row');
SELECT is(public.purge_quiz_events(), 0, 'default retention with nothing old purges nothing');
SELECT is(public.purge_quiz_events(90, 0, 0, 0), 0, 'degenerate bounds are clamped (no infinite loop, no error)');
RESET ROLE;

-- ===== Funnel tables untouched: funnel_events still only allows the three account events =====
SELECT throws_ok($$INSERT INTO public.funnel_events (user_id, event) VALUES ('00000000-0000-0000-0000-000000000701', 'quiz_started')$$, '23514', NULL, 'funnel_events allow-list is NOT loosened');
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE event LIKE 'quiz%'), 0, 'quiz events never create funnel_events rows');

SELECT * FROM finish();
ROLLBACK;
