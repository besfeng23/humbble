-- quiz-funnel alert signal: DB-side cap saturation (read-only single SELECT).
-- Run as `postgres` (SQL editor / a scheduled job owned by postgres). private.quiz_event_rate has no grants for any API role,
-- so this CANNOT be run with the anon, authenticated or service_role key.
-- A minute is "saturated" when its counter reached the global per-minute cap (counter n == cap: the cap was fully used; later
-- callers in that minute got HTTP 429 / PT429). n counts only recorded events, so n == cap does not say how many were rejected;
-- use the PT429 log signal for that. Window: the current minute plus the previous 14 (15 one-minute buckets).
-- Output (one row): saturated_minutes, cap, max_n_in_window, minutes_with_traffic.
SELECT
  count(*) FILTER (WHERE r.n >= private.quiz_event_global_rate_per_minute())::int AS saturated_minutes,
  private.quiz_event_global_rate_per_minute()                                    AS cap,
  COALESCE(max(r.n), 0)::int                                                     AS max_n_in_window,
  count(*)::int                                                                  AS minutes_with_traffic
FROM private.quiz_event_rate r
WHERE r.bucket >= date_trunc('minute', now()) - interval '14 minutes';
