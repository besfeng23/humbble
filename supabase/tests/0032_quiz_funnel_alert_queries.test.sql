BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(12);

-- The monitoring query lives in docs/operations/alerts/quiz-funnel/cap-saturation.sql. The exact text is embedded below so this
-- test runs it for real; scripts/ops/__tests__/quiz-funnel-alerts.test.js fails when the two copies differ (whitespace and
-- comments ignored). Change both together.
CREATE TEMP TABLE alert_sql (txt TEXT NOT NULL);
INSERT INTO alert_sql (txt) VALUES ($alertsql$
SELECT
  count(*) FILTER (WHERE r.n >= private.quiz_event_global_rate_per_minute())::int AS saturated_minutes,
  private.quiz_event_global_rate_per_minute()                                    AS cap,
  COALESCE(max(r.n), 0)::int                                                     AS max_n_in_window,
  count(*)::int                                                                  AS minutes_with_traffic
FROM private.quiz_event_rate r
WHERE r.bucket >= date_trunc('minute', now()) - interval '14 minutes'
$alertsql$);

CREATE OR REPLACE FUNCTION pg_temp.run_alert_query() RETURNS TABLE (saturated_minutes int, cap int, max_n_in_window int, minutes_with_traffic int)
LANGUAGE plpgsql AS $f$
BEGIN
  RETURN QUERY EXECUTE (SELECT txt FROM alert_sql);
END $f$;

-- ===== empty window: no row is a zero, not an error =====
DELETE FROM private.quiz_event_rate;
SELECT results_eq($$SELECT saturated_minutes, cap, max_n_in_window, minutes_with_traffic FROM pg_temp.run_alert_query()$$,
  $$SELECT 0, private.quiz_event_global_rate_per_minute(), 0, 0$$, 'empty counter table: 0 saturated minutes, cap from the function, no traffic');
SELECT is((SELECT cap FROM pg_temp.run_alert_query()), private.quiz_event_global_rate_per_minute(),
  'the reported cap is read from private.quiz_event_global_rate_per_minute(), not hard-coded');

-- ===== window edges: current minute and 14 earlier minutes are inside, the 15th earlier minute is outside =====
INSERT INTO private.quiz_event_rate (bucket, n) VALUES
  (date_trunc('minute', now()),                       private.quiz_event_global_rate_per_minute()),      -- saturated, inside
  (date_trunc('minute', now()) - interval '1 minute',  private.quiz_event_global_rate_per_minute() - 1),   -- one below the cap, inside
  (date_trunc('minute', now()) - interval '14 minutes', private.quiz_event_global_rate_per_minute()),     -- saturated, oldest minute inside
  (date_trunc('minute', now()) - interval '15 minutes', private.quiz_event_global_rate_per_minute()),     -- saturated but OUTSIDE the window
  (date_trunc('minute', now()) - interval '2 hours',    private.quiz_event_global_rate_per_minute());     -- outside
SELECT results_eq($$SELECT saturated_minutes, cap, max_n_in_window, minutes_with_traffic FROM pg_temp.run_alert_query()$$,
  $$SELECT 2, private.quiz_event_global_rate_per_minute(), private.quiz_event_global_rate_per_minute(), 3$$, 'counts only saturated minutes inside the 15-bucket window (2 of 3); cap-1 is not saturated');
SELECT is((SELECT minutes_with_traffic FROM pg_temp.run_alert_query()), 3, 'buckets outside the window are ignored');

-- ===== a counter above the cap (cannot happen through the RPC, but a direct write must still count as saturated) =====
UPDATE private.quiz_event_rate SET n = private.quiz_event_global_rate_per_minute() + 5
 WHERE bucket = date_trunc('minute', now()) - interval '1 minute';
SELECT is((SELECT saturated_minutes FROM pg_temp.run_alert_query()), 3, 'n above the cap counts as saturated (>=, not =)');
SELECT is((SELECT max_n_in_window FROM pg_temp.run_alert_query()), private.quiz_event_global_rate_per_minute() + 5, 'max_n_in_window reports the largest counter');

-- ===== end to end through the real RPC: saturating the minute makes the query see it and the RPC answers PT429 =====
DELETE FROM private.quiz_event_rate;
INSERT INTO private.quiz_event_rate (bucket, n) VALUES (date_trunc('minute', now()), private.quiz_event_global_rate_per_minute() - 1);
SET LOCAL ROLE anon;
SELECT is(public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, 'quiz_started', 0, NULL, NULL, NULL, NULL, NULL, NULL), TRUE,
  'the last event under the cap is recorded');
RESET ROLE;
SELECT is((SELECT saturated_minutes FROM pg_temp.run_alert_query()), 1, 'the minute that just reached the cap is reported as saturated');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.record_quiz_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid, 'quiz_started', 0, NULL, NULL, NULL, NULL, NULL, NULL)$$,
  'PT429', 'rate_limited', 'the next event is rejected with PT429, the SQLSTATE the log alerts match on');
RESET ROLE;
SELECT is((SELECT n FROM private.quiz_event_rate WHERE bucket = date_trunc('minute', now())), private.quiz_event_global_rate_per_minute(),
  'a rejected event does not move the counter past the cap');

-- ===== access: the query needs the owner role; no API role can run it =====
SELECT ok(NOT (has_table_privilege('anon', 'private.quiz_event_rate', 'SELECT') OR has_table_privilege('authenticated', 'private.quiz_event_rate', 'SELECT')
            OR has_table_privilege('service_role', 'private.quiz_event_rate', 'SELECT')), 'no API role can read private.quiz_event_rate (run the alert query as postgres)');
SELECT is((SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'private.quiz_event_rate'::regclass), 'postgres', 'the counter table is owned by postgres');

SELECT * FROM finish();
ROLLBACK;
