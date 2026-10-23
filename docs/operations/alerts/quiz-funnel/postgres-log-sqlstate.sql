-- quiz-funnel alert signal: PostgREST-visible errors raised by record_quiz_event, counted from the Postgres log.
-- Run in the Supabase SQL Editor with query source = Logs (ClickHouse engine), window = last 15 minutes.
-- PT429 (rate_limited, global per-minute cap) is raised only by public.record_quiz_event (migration 20261023000120);
-- PT400 (payload_too_large) only by the same function (migration 20261023000110). Both are custom PostgREST status codes,
-- so the database log is a source that does not depend on the gateway exposing the PostgREST error code.
-- Output (one row): pt429_log_count (cap hits), pt400_log_count (oversize probes).
-- pt400_log_count is also the pipeline self-test: after sending ONE oversize request to dev (runbook section "Verify the pipeline")
-- it must be >= 1, otherwise this query matches nothing on this project and the PT429 alert is blind.
SELECT
  countIf(log_attributes['parsed.sql_state_code'] = 'PT429') AS pt429_log_count,
  countIf(log_attributes['parsed.sql_state_code'] = 'PT400') AS pt400_log_count
FROM logs
WHERE source = 'postgres_logs'
  AND timestamp >= now() - INTERVAL 15 MINUTE
  AND log_attributes['parsed.sql_state_code'] IN ('PT429', 'PT400');
