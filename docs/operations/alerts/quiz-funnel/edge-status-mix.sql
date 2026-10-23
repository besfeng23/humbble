-- quiz-funnel alert signals from the API gateway log: HTTP 429 volume and the 4xx share on record_quiz_event.
-- Run in the Supabase SQL Editor with query source = Logs (ClickHouse engine), window = last 15 minutes.
-- Projects created before June 2026 may still be on the BigQuery engine (cross join unnest syntax); see the runbook.
-- Output (one row):
--   requests_total        POSTs to the RPC path in the window
--   edge_429_total        every HTTP 429 (PostgREST PT429 plus any gateway-originated 429)
--   edge_429_postgrest    429s with an EMPTY gateway error code = the request reached PostgREST = the PT429 cap hit
--                         (Supabase documents sb_error_code as empty when the request reached PostgREST; unverified for 429, see runbook)
--   edge_429_gateway      429s with a gateway error code (platform throttling, NOT our cap)
--   edge_4xx_other        4xx other than 429 (oversize 400, invalid input 400, bad key 401/403, ...)
SELECT
  count()                                                          AS requests_total,
  countIf(status = 429)                                            AS edge_429_total,
  countIf(status = 429 AND gateway_error_code = '')                AS edge_429_postgrest,
  countIf(status = 429 AND gateway_error_code != '')               AS edge_429_gateway,
  countIf(status BETWEEN 400 AND 499 AND status != 429)            AS edge_4xx_other
FROM (
  SELECT
    toInt32OrZero(log_attributes['response.status_code'])       AS status,
    log_attributes['response.headers.sb_error_code']            AS gateway_error_code
  FROM logs
  WHERE source = 'edge_logs'
    AND timestamp >= now() - INTERVAL 15 MINUTE
    AND log_attributes['request.method'] = 'POST'
    AND match(log_attributes['request.path'], '^/rest/v1/rpc/record_quiz_event/?$')
);
