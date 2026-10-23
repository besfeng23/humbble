BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(112);

-- Test fixtures (rolled back). Session ids are valid random-style v4 UUIDs.
INSERT INTO public.attribution_networks (slug, display_name, click_id_params)
VALUES ('qtestnet', 'Quiz Test Net', ARRAY['sub1','aff_click_id']);

-- ===== Structure: new table, no personal columns =====
SELECT has_table('public', 'quiz_events', 'public.quiz_events exists (separate from funnel_events)');
SELECT columns_are('public', 'quiz_events',
  ARRAY['id','session_id','event','step','answer','country_code','network','click_id','attribution','created_at'],
  'only non-personal columns: no user_id, ip, user agent, free text or url');
SELECT is((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.quiz_events'::regclass), TRUE, 'RLS enabled');
SELECT is((SELECT count(*)::INT FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'quiz_events'), 0, 'no RLS policies: no client role can touch rows directly');
SELECT is((SELECT count(*)::INT FROM pg_catalog.pg_class c, LATERAL pg_catalog.aclexplode(c.relacl) a
            WHERE c.oid = 'public.quiz_events'::regclass AND a.grantee = 0), 0, 'no PUBLIC ACL entry on the table');
SELECT is((SELECT count(*)::INT FROM pg_catalog.pg_class c, LATERAL pg_catalog.aclexplode(c.relacl) a
            WHERE c.oid = 'public.quiz_events_id_seq'::regclass AND a.grantee <> c.relowner), 0, 'identity sequence has no grants for API roles or PUBLIC');
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

-- ===== Function privileges + pinned search_path =====
SELECT ok(has_function_privilege('anon','public.record_quiz_event(uuid,text,integer,text,text,jsonb)','EXECUTE'), 'anon can call record_quiz_event');
SELECT ok(has_function_privilege('authenticated','public.record_quiz_event(uuid,text,integer,text,text,jsonb)','EXECUTE'), 'authenticated can call record_quiz_event');
SELECT ok(NOT has_function_privilege('service_role','public.record_quiz_event(uuid,text,integer,text,text,jsonb)','EXECUTE'), 'service_role cannot forge events through the client function');
SELECT ok(NOT (has_function_privilege('anon','public.purge_quiz_events(integer,integer)','EXECUTE') OR has_function_privilege('authenticated','public.purge_quiz_events(integer,integer)','EXECUTE')), 'clients cannot purge');
SELECT ok(has_function_privilege('service_role','public.purge_quiz_events(integer,integer)','EXECUTE'), 'service_role can purge');
SELECT ok(NOT (has_function_privilege('anon','public.quiz_funnel_summary(timestamptz,timestamptz)','EXECUTE') OR has_function_privilege('authenticated','public.quiz_funnel_summary(timestamptz,timestamptz)','EXECUTE')), 'clients cannot read the funnel summary');
SELECT ok(has_function_privilege('service_role','public.quiz_funnel_summary(timestamptz,timestamptz)','EXECUTE'), 'service_role can read the funnel summary');
SELECT ok(NOT (has_function_privilege('anon','private.quiz_event_shape_valid(text,integer,text,text)','EXECUTE')
            OR has_function_privilege('anon','private.quiz_event_session_cap()','EXECUTE')
            OR has_function_privilege('anon','private.quiz_event_global_rate_per_minute()','EXECUTE')), 'private helpers are not callable by anon');
SELECT is((SELECT count(*)::INT FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(p.proacl) a
            WHERE p.proname IN ('record_quiz_event','purge_quiz_events','quiz_funnel_summary','quiz_event_shape_valid','quiz_event_session_cap','quiz_event_global_rate_per_minute')
              AND p.pronamespace IN ('public'::regnamespace, 'private'::regnamespace) AND a.grantee = 0), 0, 'no PUBLIC EXECUTE on any of the new functions');
SELECT is((SELECT count(*)::INT FROM pg_catalog.pg_proc p
            WHERE p.proname IN ('record_quiz_event','purge_quiz_events','quiz_funnel_summary','quiz_event_shape_valid','quiz_event_session_cap','quiz_event_global_rate_per_minute')
              AND p.pronamespace IN ('public'::regnamespace, 'private'::regnamespace)
              AND NOT (p.proconfig @> ARRAY['search_path=""'])), 0, 'every new function pins search_path (to empty)');
SELECT is((SELECT count(*)::INT FROM pg_catalog.pg_proc p
            WHERE p.proname IN ('record_quiz_event','purge_quiz_events','quiz_funnel_summary') AND p.pronamespace = 'public'::regnamespace
              AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'), 3, 'the three public functions are SECURITY DEFINER owned by postgres');

-- ===== Constraints (as superuser, direct): the table itself rejects bad rows =====
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event) VALUES ('11111111-1111-4111-8111-111111111111', 'signup_completed')$$, '23514', NULL, 'table CHECK: event allow-list');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event) VALUES ('11111111-1111-1111-8111-111111111111', 'quiz_started')$$, '23514', NULL, 'table CHECK: session id must be a v4 UUID');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event, step, answer) VALUES ('11111111-1111-4111-8111-111111111111', 'quiz_step', 1, 'free text')$$, '23514', NULL, 'table CHECK: answer enum');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event, step, country_code) VALUES ('11111111-1111-4111-8111-111111111111', 'quiz_step', 4, 'ZZ')$$, '23514', NULL, 'table CHECK: country must be a real ISO alpha-2');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event, step, answer) VALUES ('11111111-1111-4111-8111-111111111111', 'quiz_started', 0, 'serious')$$, '23514', NULL, 'table CHECK: non-step events carry no answer');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event, attribution) VALUES ('11111111-1111-4111-8111-111111111111', 'quiz_started', pg_catalog.jsonb_build_object('k', pg_catalog.repeat('a', 1100)))$$, '23514', NULL, 'table CHECK: attribution size');

-- ===== As anon: valid writes =====
SET LOCAL ROLE anon;
SELECT is(public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_started', 0, NULL, NULL,
  '{"aff_click_id":"abc123","network":"QTestNet","sub1":"s1","email":"x@example.test","utm_source":"fb","evil":"zzz","sub2":"a@b.c"}'::JSONB), TRUE, 'anon: quiz_started recorded');
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
-- second + third sessions for attribution mapping cases
SELECT is(public.record_quiz_event('bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbb2', 'quiz_started', 0, NULL, NULL, '{"rtkcid":"rt-9","network":"nope"}'::JSONB), TRUE, 'anon: unknown network with tracker click id recorded');
SELECT is(public.record_quiz_event('cccccccc-cccc-4ccc-bccc-ccccccccccc3', 'quiz_started'), TRUE, 'anon: no attribution recorded');
SELECT is(public.record_quiz_event('cccccccc-cccc-4ccc-bccc-ccccccccccc3', 'quiz_step', 1, 'serious', NULL, '{}'::JSONB), TRUE, 'anon: empty attribution object accepted');

-- ===== As anon: rejections =====
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'signup_completed')$$, '22023', 'invalid_quiz_event', 'rejects an event outside the allow-list');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', NULL)$$, '22023', 'invalid_quiz_event', 'rejects NULL event');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 1, 'not_an_option')$$, '22023', 'invalid_quiz_event', 'rejects an unknown answer enum');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 1, 'I am Juan, call me 0917')$$, '22023', 'invalid_quiz_event', 'rejects free text');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 2, 'marriage')$$, '22023', 'invalid_quiz_event', 'rejects an answer that belongs to another step');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 5, 'serious')$$, '22023', 'invalid_quiz_event', 'rejects step 5');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 0, 'serious')$$, '22023', 'invalid_quiz_event', 'rejects quiz_step at step 0');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', -1, 'serious')$$, '22023', 'invalid_quiz_event', 'rejects a negative step');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 4, NULL, 'ZZ')$$, '22023', 'invalid_quiz_event', 'rejects a non-ISO country');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 4, NULL, 'se')$$, '22023', 'invalid_quiz_event', 'rejects a lowercase country (strict alpha-2)');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 4, NULL, 'Sweden')$$, '22023', 'invalid_quiz_event', 'rejects a country name');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_step', 3, 'now', 'SE')$$, '22023', 'invalid_quiz_event', 'rejects a country on a non-country step');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started', 0, 'serious')$$, '22023', 'invalid_quiz_event', 'rejects an answer on quiz_started');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_completed', 4)$$, '22023', 'invalid_quiz_event', 'rejects a non-zero step on quiz_completed');
SELECT throws_ok($$SELECT public.record_quiz_event(NULL, 'quiz_started')$$, '22023', 'invalid_session_id', 'rejects a NULL session id');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-1ddd-8ddd-ddddddddddd4', 'quiz_started')$$, '22023', 'invalid_session_id', 'rejects a non-v4 session id (e.g. time-based UUID)');
SELECT throws_ok($$SELECT public.record_quiz_event('00000000-0000-0000-0000-000000000000', 'quiz_started')$$, '22023', 'invalid_session_id', 'rejects the nil UUID');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started', 0, NULL, NULL, '[1,2]'::JSONB)$$, '22023', 'invalid_attribution', 'rejects a non-object attribution');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started', 0, NULL, NULL, pg_catalog.jsonb_build_object('click_id', pg_catalog.repeat('a', 1100)))$$, '54000', 'payload_too_large', 'rejects an oversize attribution payload (> 1 KB)');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started', 0, NULL, NULL, (SELECT pg_catalog.jsonb_object_agg('sub' || g, 'v') FROM pg_catalog.generate_series(1, 300) g))$$, '54000', 'payload_too_large', 'rejects an attribution payload with too many keys');

-- ===== As anon: no read / update / delete / truncate, no direct insert =====
SELECT throws_ok($$SELECT * FROM public.quiz_events$$, '42501', NULL, 'anon cannot SELECT');
SELECT throws_ok($$SELECT count(*) FROM public.quiz_events$$, '42501', NULL, 'anon cannot even count');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event) VALUES ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started')$$, '42501', NULL, 'anon cannot INSERT directly (only through the function)');
SELECT throws_ok($$UPDATE public.quiz_events SET answer = 'serious'$$, '42501', NULL, 'anon cannot UPDATE');
SELECT throws_ok($$DELETE FROM public.quiz_events$$, '42501', NULL, 'anon cannot DELETE');
SELECT throws_ok($$TRUNCATE public.quiz_events$$, '42501', NULL, 'anon cannot TRUNCATE');
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
SELECT is((SELECT network || '|' || click_id FROM public.quiz_events WHERE session_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' AND event = 'quiz_started'), 'qtestnet|s1', 'network-specific click id mapping (same as signup_attributions)');
SELECT is((SELECT attribution ? 'email' OR attribution ? 'evil' OR attribution ? 'sub2' FROM public.quiz_events WHERE session_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' AND event = 'quiz_started'), FALSE, 'non-allow-listed keys and email-like values are dropped');
SELECT ok((SELECT attribution ? 'utm_source' AND attribution ? 'aff_click_id' FROM public.quiz_events WHERE session_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' AND event = 'quiz_started'), 'allow-listed click params kept');
SELECT is((SELECT network || '|' || click_id FROM public.quiz_events WHERE session_id = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbb2'), 'unknown|rt-9', 'unknown network falls back to the generic click-id mapping');
SELECT is((SELECT network IS NULL AND click_id IS NULL FROM public.quiz_events WHERE session_id = 'cccccccc-cccc-4ccc-bccc-ccccccccccc3' AND event = 'quiz_started'), TRUE, 'no attribution => NULL network/click id');
SELECT is((SELECT count(*)::INT FROM public.quiz_events WHERE session_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'), 0, 'rejected calls left no rows');
SELECT lives_ok($$SELECT * FROM public.quiz_funnel_summary(now() - interval '1 day', now() + interval '1 day')$$, 'service_role can run the funnel summary');
SELECT is((SELECT sessions FROM public.quiz_funnel_summary(now() - interval '1 day', now() + interval '1 day') WHERE network = 'qtestnet' AND event = 'quiz_started'), 1::BIGINT, 'summary: one qtestnet session started');
SELECT is((SELECT sessions FROM public.quiz_funnel_summary(now() - interval '1 day', now() + interval '1 day') WHERE network = 'qtestnet' AND event = 'quiz_cta_clicked'), 1::BIGINT, 'summary: a session network is inherited by its later events');
SELECT is((SELECT sessions FROM public.quiz_funnel_summary(now() - interval '1 day', now() + interval '1 day') WHERE network = 'direct' AND event = 'quiz_step' AND step = 1), 1::BIGINT, 'summary: sessions without click params roll up under direct');
SELECT throws_ok($$INSERT INTO public.quiz_events (session_id, event) VALUES ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started')$$, '42501', NULL, 'service_role cannot INSERT directly');
SELECT throws_ok($$UPDATE public.quiz_events SET answer = NULL$$, '42501', NULL, 'service_role cannot UPDATE');
SELECT throws_ok($$DELETE FROM public.quiz_events$$, '42501', NULL, 'service_role cannot DELETE directly');
SELECT throws_ok($$TRUNCATE public.quiz_events$$, '42501', NULL, 'service_role cannot TRUNCATE');
SELECT throws_ok($$SELECT public.record_quiz_event('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'quiz_started')$$, '42501', NULL, 'service_role cannot forge client events');
RESET ROLE;

-- ===== Per-session cap (limit overridden for the test; the real value is 7 = 1 + 4 + 1 + 1) =====
SELECT is(private.quiz_event_session_cap(), 7, 'default per-session cap equals the number of legal distinct events');
CREATE OR REPLACE FUNCTION private.quiz_event_session_cap() RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 2; $$;
SET LOCAL ROLE anon;
SELECT is(public.record_quiz_event('ffffffff-ffff-4fff-8fff-fffffffffff6', 'quiz_started'), TRUE, 'cap: first event accepted');
SELECT is(public.record_quiz_event('ffffffff-ffff-4fff-8fff-fffffffffff6', 'quiz_step', 1, 'serious'), TRUE, 'cap: second event accepted');
SELECT throws_ok($$SELECT public.record_quiz_event('ffffffff-ffff-4fff-8fff-fffffffffff6', 'quiz_step', 2, '30_39')$$, '53400', 'session_event_cap_exceeded', 'cap: a new event beyond the per-session cap is rejected');
SELECT is(public.record_quiz_event('ffffffff-ffff-4fff-8fff-fffffffffff6', 'quiz_step', 1, 'serious'), FALSE, 'cap: a duplicate of a stored event is still an idempotent no-op once at the cap');
RESET ROLE;
CREATE OR REPLACE FUNCTION private.quiz_event_session_cap() RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 7; $$;

-- ===== Global per-minute circuit breaker (limit overridden to the current row count) =====
SELECT is(private.quiz_event_global_rate_per_minute(), 1200, 'default global rate limit is 1200 events/minute');
DO $override$
BEGIN
  EXECUTE pg_catalog.format('CREATE OR REPLACE FUNCTION private.quiz_event_global_rate_per_minute() RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = %L AS $f$ SELECT %s; $f$',
    '', (SELECT pg_catalog.count(*) FROM public.quiz_events WHERE created_at >= pg_catalog.now() - INTERVAL '1 minute'));
END
$override$;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.record_quiz_event('99999999-9999-4999-8999-999999999997', 'quiz_started')$$, '53400', 'rate_limited', 'rate limit: new sessions are rejected once the per-minute ceiling is reached');
SELECT is(public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'quiz_started'), FALSE, 'rate limit: idempotent retries are still answered');
RESET ROLE;
CREATE OR REPLACE FUNCTION private.quiz_event_global_rate_per_minute() RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 1200; $$;

-- ===== Purge / retention =====
INSERT INTO public.quiz_events (session_id, event, created_at) VALUES
  ('abababab-abab-4bab-8bab-abababababa1', 'quiz_started', now() - interval '100 days'),
  ('abababab-abab-4bab-8bab-abababababa2', 'quiz_started', now() - interval '89 days');
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.purge_quiz_events(1)$$, '22023', 'retention_too_short', 'purge refuses a retention shorter than 7 days');
SELECT throws_ok($$SELECT public.purge_quiz_events(NULL)$$, '22023', 'retention_too_short', 'purge refuses NULL retention');
SELECT is(public.purge_quiz_events(90), 1, 'purge deletes only rows older than 90 days');
SELECT is((SELECT count(*)::INT FROM public.quiz_events WHERE session_id = 'abababab-abab-4bab-8bab-abababababa2'), 1, 'a row inside the retention window survives');
SELECT is((SELECT count(*)::INT FROM public.quiz_events WHERE session_id = 'abababab-abab-4bab-8bab-abababababa1'), 0, 'the 100-day-old row is gone');
SELECT is(public.purge_quiz_events(30), 1, 'a shorter retention purges the 89-day-old row');
SELECT is(public.purge_quiz_events(), 0, 'default retention (90 days) with nothing old purges nothing');
RESET ROLE;

-- ===== Funnel tables untouched: funnel_events still only allows the three account events =====
SELECT throws_ok($$INSERT INTO public.funnel_events (user_id, event) VALUES ('00000000-0000-0000-0000-000000000701', 'quiz_started')$$, '23514', NULL, 'funnel_events allow-list is NOT loosened');
SELECT is((SELECT count(*)::INT FROM public.funnel_events WHERE event LIKE 'quiz%'), 0, 'quiz events never create funnel_events rows');

SELECT * FROM finish();
ROLLBACK;
