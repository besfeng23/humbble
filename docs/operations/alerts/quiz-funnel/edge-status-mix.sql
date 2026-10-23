-- quiz-funnel alert signals from the API gateway log: HTTP 429 volume and the 4xx share on record_quiz_event, plus liveness counters.
-- Run in the Supabase SQL Editor with query source = Logs (ClickHouse engine), window = last 15 minutes.
-- Projects created before June 2026 may still be on the BigQuery engine (cross join unnest syntax); see the runbook.
-- Output (one row):
--   edge_logs_total        LIVENESS: every edge_logs row in the window (any method, any path). 0 = ingestion gap or an idle project.
--   edge_logs_schema_rows  LIVENESS: edge_logs rows that carry request.method, request.path AND response.status_code. 0 while
--                          edge_logs_total > 0 means the field keys below are wrong for this project: every other column is then a
--                          meaningless zero, NOT a quiet system (Themis N44-01). The evaluator reports no_data in that case.
--   requests_total         POSTs to the RPC path in the window
--   edge_429_total         every HTTP 429 (PostgREST PT429 plus any gateway-originated 429)
--   edge_429_postgrest     429s with an EMPTY gateway error code = the request reached PostgREST = the PT429 cap hit
--                          (Supabase documents sb_error_code as empty when the request reached PostgREST; UNVERIFIED for 429 and
--                          for the header being captured at all, see runbook; if the key is absent every 429 lands here, the safe direction)
--   edge_429_gateway       429s with a gateway error code (platform throttling, NOT our cap); UNVERIFIED, informational
--   edge_4xx_other         4xx other than 429 (oversize 400, invalid input 400, bad key 401/403, ...)
SELECT
  count()                                                          AS edge_logs_total,
  countIf(method != '' AND path != '' AND status_raw != '')        AS edge_logs_schema_rows,
  countIf(is_rpc)                                                  AS requests_total,
  countIf(is_rpc AND status = 429)                                 AS edge_429_total,
  countIf(is_rpc AND status = 429 AND gateway_error_code = '')     AS edge_429_postgrest,
  countIf(is_rpc AND status = 429 AND gateway_error_code != '')    AS edge_429_gateway,
  countIf(is_rpc AND status BETWEEN 400 AND 499 AND status != 429) AS edge_4xx_other
FROM (
  SELECT
    log_attributes['request.method']                            AS method,
    log_attributes['request.path']                              AS path,
    log_attributes['response.status_code']                      AS status_raw,
    toInt32OrZero(log_attributes['response.status_code'])       AS status,
    log_attributes['response.headers.sb_error_code']            AS gateway_error_code,
    (method = 'POST' AND match(path, '^/rest/v1/rpc/record_quiz_event/?$')) AS is_rpc
  FROM logs
  WHERE source = 'edge_logs'
    AND timestamp >= now() - INTERVAL 15 MINUTE
);
