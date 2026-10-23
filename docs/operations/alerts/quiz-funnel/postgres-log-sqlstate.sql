-- quiz-funnel alert signal: PostgREST-visible errors raised by record_quiz_event, counted from the Postgres log, plus liveness counters.
-- Run in the Supabase SQL Editor with query source = Logs (ClickHouse engine), window = last 15 minutes.
-- PT429 (rate_limited, global per-minute cap) is raised only by public.record_quiz_event (migration 20261023000120);
-- PT400 (payload_too_large) only by the same function (migration 20261023000110). Both are custom PostgREST status codes,
-- so the database log is a source that does not depend on the gateway exposing the PostgREST error code.
-- Output (one row):
--   pg_rows_total          LIVENESS: every postgres_logs row in the window. 0 = ingestion gap.
--   pg_rows_with_sqlstate  LIVENESS: rows with a non-empty parsed.sql_state_code. 0 while pg_rows_total > 0 = the key is wrong, so
--                          pt429_log_count / pt400_log_count are meaningless zeros (Themis N44-01).
--   pg_rows_with_severity  LIVENESS: rows with a non-empty parsed.error_severity (same reason; the counts below need it).
--   pt429_log_count        ALERT METRIC: PT429 rows with severity ERROR = one row per raised error. The severity filter is the
--                          de-duplication (Themis N44-05): a DETAIL / STATEMENT line of the same error repeats the SQLSTATE but
--                          carries another severity, and must not multiply the count. Whether Supabase really emits such extra
--                          rows is UNVERIFIED; the runbook calibration records the multiplier.
--   pt429_log_rows_any     PT429 rows of any severity (cross-check: > 0 while pt429_log_count = 0 means the severity key or value
--                          differs on this project, so the alert is blind; also shows the row multiplier = rows_any / count)
--   pt400_log_count        PT400 rows with severity ERROR (informational, and the synthetic probe target: one per probe)
--   pt400_log_rows_any     PT400 rows of any severity (same cross-check and multiplier)
SELECT
  count()                                           AS pg_rows_total,
  countIf(sqlstate != '')                           AS pg_rows_with_sqlstate,
  countIf(severity != '')                           AS pg_rows_with_severity,
  countIf(sqlstate = 'PT429' AND severity = 'ERROR') AS pt429_log_count,
  countIf(sqlstate = 'PT429')                       AS pt429_log_rows_any,
  countIf(sqlstate = 'PT400' AND severity = 'ERROR') AS pt400_log_count,
  countIf(sqlstate = 'PT400')                       AS pt400_log_rows_any
FROM (
  SELECT
    log_attributes['parsed.sql_state_code'] AS sqlstate,
    log_attributes['parsed.error_severity'] AS severity
  FROM logs
  WHERE source = 'postgres_logs'
    AND timestamp >= now() - INTERVAL 15 MINUTE
);
