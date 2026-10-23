# Quiz funnel alerts (HTTP 429 cap hit and 4xx share) - alerts as code and runbook

Closes the open condition from Themis's review of PR #42 (`THEMIS_PR42_REVIEW_2026-10-23.md`, finding N42-07 and condition 3):
since migration `20261023000120`, hitting the global 120/min cap on `record_quiz_event` is **HTTP 429 / `PT429`**, so a 5xx
alert no longer sees it, and oversize requests are **HTTP 400 / `PT400`**, which the cap never counts. Two alerts are needed:
a **429 cap-hit** alert and a **4xx-share** alert (`docs/operations/quiz-funnel-events.md`, "Edge / WAF rate limiting").

## What is in the repo (and what is not)
| Item | Where |
| --- | --- |
| Alert definitions (ids, metrics, thresholds, window) | `docs/operations/alerts/quiz-funnel/alerts.json` |
| Signal queries (read-only) | `docs/operations/alerts/quiz-funnel/*.sql` |
| Offline evaluator and CLI (no network, no DB, no secret) | `scripts/ops/quiz-funnel-alerts.js` (`npm run ops:quiz-alerts -- stats.json`) |
| Tests | `scripts/ops/__tests__/quiz-funnel-alerts.test.js` (jest), `supabase/tests/0032_quiz_funnel_alert_queries.test.sql` (pgTAP, runs the DB query for real in CI) |

**Not done by this change (remote systems, owner/ops action):** nothing here schedules the queries, pages anyone or sends a
notification, and nothing was run against the dev or production project. The hosted log field names below come from the
Supabase documentation and are **unverified on this project** until the pipeline check below passes. No migration, no grant, no
function and no Edge Function was added; the database query is a plain `SELECT` run as `postgres`.

## The alerts
Window for every alert: **15 minutes**, evaluated at least every 5 minutes. Thresholds are starting values derived from the
documented cap (120 events/min) and per-visit volume (at most 7 events), not measured baselines. The web client stops sending
for the rest of the session after its first failure, so one real visitor produces at most one 429 or 4xx. Re-tune after the first
week of real traffic.

| Alert id | Signal (source) | Warn | Critical | Notes |
| --- | --- | --- | --- | --- |
| `QZ-429-PT429-LOG` | `pt429_log_count`: Postgres log rows with SQLSTATE `PT429` (`postgres-log-sqlstate.sql`) | 10 | 100 | Does not depend on the gateway exposing the PostgREST error code. Only `record_quiz_event` raises `PT429` (a jest test checks the migrations). |
| `QZ-429-EDGE-POSTGREST` | `edge_429_postgrest`: gateway log 429s on the RPC path with an empty gateway error code (`edge-status-mix.sql`) | 10 | 100 | Same events as above, seen from the gateway. Gateway-originated 429s (platform throttling) are counted separately as `edge_429_gateway` and do **not** fire this alert. |
| `QZ-CAP-SATURATED-MINUTES` | `saturated_minutes`: minutes in the window where `private.quiz_event_rate.n >= cap` (`cap-saturation.sql`) | 1 | 5 | No log pipeline needed, but it needs a `postgres`-role runner (no API role can read the table). `n` counts recorded events, so it proves the cap was used up, not how many were rejected. |
| `QZ-4XX-SHARE` | `edge_4xx_other / requests_total`: 4xx other than 429 on the RPC path, POST only (`edge-status-mix.sql`) | 5% (0.05) | 20% (0.2) | Needs at least 50 requests in the window, otherwise state `insufficient_volume` (reported, not alerting). Catches oversize/invalid payloads (400), a wrong or rotated public key (401/403) and client regressions. |

The three 429 alerts are deliberate redundancy: any one of them firing is a cap hit. If only one source works on a project,
the others report `no_data`, which is **not** treated as "ok".

## Running it
1. Run the three queries (SQL Editor with query source **Logs** for the two ClickHouse ones, query source **Database**, as
   `postgres`, for `cap-saturation.sql`) or the equivalent in any log pipeline.
2. Put the numbers in a JSON file (names are in `alerts.json` under `stats_inputs`):
   ```json
   { "requests_total": 400, "edge_429_total": 0, "edge_429_postgrest": 0, "edge_429_gateway": 0, "edge_4xx_other": 3,
     "pt429_log_count": 0, "pt400_log_count": 0, "saturated_minutes": 0 }
   ```
3. `npm run ops:quiz-alerts -- stats.json` (or `--json`, or `-` to read stdin). Exit code: `0` ok, `1` warn, `2` critical,
   `3` no data or invalid input (precedence critical > warn > no_data > ok). The input is validated: negative, non-integer or
   inconsistent counts (for example 4xx above total requests) are rejected instead of guessed.

Wiring step 1 and the paging to a scheduler and a notification channel is an infrastructure change for the owner (see
"Needs the owner").

## Verify the pipeline once on dev (read-only except one deliberate bad request)
A silent alert is worse than none, so prove the signals exist before relying on them:
1. Field discovery (SQL Editor, source Logs):
   `select arrayJoin(mapKeys(log_attributes)) as key, count() as n from logs where source = 'edge_logs' group by key order by n desc limit 100;`
   and the same for `postgres_logs`. Confirm `request.method`, `request.path`, `response.status_code`,
   `response.headers.sb_error_code`, `parsed.sql_state_code` exist. If a key differs, change the query and `alerts.json` together.
2. Send **one** oversize request to `/rest/v1/rpc/record_quiz_event` on **dev** (for example a 65-character `p_network`). Within a
   few minutes `postgres-log-sqlstate.sql` must show `pt400_log_count >= 1` and `edge-status-mix.sql` must show
   `edge_4xx_other >= 1`. If not, the PT429 log alert is blind on this project: use the gateway and database signals only.
3. Check the assumption behind `edge_429_postgrest`: Supabase documents `sb_error_code` as empty when the request reached
   PostgREST. A real cap hit cannot be produced safely on dev (it needs 120 events in a minute), so confirm with the database
   signal during the first real cap hit that `edge_429_postgrest` and `saturated_minutes` move together.
4. Projects created before June 2026 may still use the BigQuery log engine (`cross join unnest(metadata)`); the ClickHouse
   queries here do not run there and must be translated. `cap-saturation.sql` is unaffected.

## When an alert fires
- **Cap hit (`QZ-429-*`, `QZ-CAP-SATURATED-MINUTES`)**: real visitors' quiz events are being dropped for that minute (the quiz
  itself keeps working). Check whether it is an ad burst (compare with ad spend and `public.quiz_funnel_summary` over a short
  window) or a flood (one source, no matching quiz completions). Burst: raise the cap with a new migration
  (`quiz-funnel-events.md`, "Rate limit"). Flood: add the documented per-IP edge rule (30 requests/min/IP, challenge or block)
  in front of the path; the database cannot see IPs. Do not try to identify or join anonymous sessions to accounts.
- **4xx share (`QZ-4XX-SHARE`)**: look at the status split first. 400s: oversize or invalid payloads, a client regression or
  probing (`pt400_log_count` confirms `payload_too_large`). 401/403: the public key was rotated or the request lost its `apikey`;
  check the client build's `EXPO_PUBLIC_SUPABASE_*` values. These requests never reach the cap, so an oversize flood is visible
  only here.
- **`no_data`**: treat as a broken alert, not as a quiet system; re-run the pipeline check.

## Needs the owner (not done here)
1. Decide where the evaluator runs (a scheduler with a `postgres`-role connection for the database signal and log access for the
   other two) and which channel receives warn and critical. Any hosted alert rule, scheduled job or notification is a remote
   change and was deliberately not created.
2. Run the "Verify the pipeline" steps on dev after migration `20261023000120` is applied there.
3. Keep the per-IP edge rule on the list: alerts detect, they do not limit.
