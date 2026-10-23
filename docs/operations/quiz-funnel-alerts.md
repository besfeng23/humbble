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
| Tests | `scripts/ops/__tests__/quiz-funnel-alerts.test.js` (jest: definitions, evaluator, liveness, runbook wording), `scripts/ops/__tests__/quiz-funnel-clickhouse-queries.test.js` (jest: runs both ClickHouse queries on fixtures with a local chdb engine and kills SQL mutants; the engine part is skipped where chdb is not installed, a verbatim text guard always runs), `supabase/tests/0032_quiz_funnel_alert_queries.test.sql` (pgTAP: runs the database query for real in CI) |

**Not done by this change (remote systems, owner/ops action):** nothing here schedules the queries, pages anyone or sends a
notification, and nothing was run against the dev or production project. **The alerts are DEFINED, NOT ACTIVE.** The hosted log
field names below come from the Supabase documentation and are **unverified on this project** until the pipeline check below
passes. No migration, no grant, no function and no Edge Function was added; the database query is a plain `SELECT` that a
person runs manually as `postgres` (see "Least privilege for whatever runs the signals").

## The alerts
Window for every alert: **15 minutes**, evaluated at least every 5 minutes. Thresholds are starting values derived from the
documented cap (120 events/min) and per-visit volume (at most 7 events), not measured baselines. The web client stops sending
for the rest of the session after its first failure, so one real visitor produces at most one 429 or 4xx. Re-tune after the first
week of real traffic.

| Alert id | Signal (source) | Warn | Critical | Notes |
| --- | --- | --- | --- | --- |
| `QZ-429-PT429-LOG` | `pt429_log_count`: Postgres log rows with SQLSTATE `PT429` (`postgres-log-sqlstate.sql`) | 10 | 100 | Counts Postgres log rows with SQLSTATE `PT429` **and severity `ERROR`** only, so one raised error is one row even if the log also carries DETAIL or STATEMENT rows of the same error (whether it does is unverified; the calibration step records the multiplier). Does not depend on the gateway exposing the PostgREST error code. Only `record_quiz_event` raises `PT429` (a jest test checks the migrations). |
| `QZ-429-EDGE-POSTGREST` | `edge_429_postgrest`: gateway log 429s on the RPC path with an empty gateway error code (`edge-status-mix.sql`) | 10 | 100 | Same events as above, seen from the gateway. Gateway-originated 429s (platform throttling) are counted separately as `edge_429_gateway` and do **not** fire this alert, but that split rests on `response.headers.sb_error_code`, which is **UNVERIFIED on real logs** (see step 3 of the pipeline check): if the header is not captured, every 429 counts here, so a platform 429 would fire this alert (the safe direction). |
| `QZ-CAP-SATURATED-MINUTES` | `saturated_minutes`: minutes in the window where `private.quiz_event_rate.n >= cap` (`cap-saturation.sql`) | 1 | 5 | No log pipeline needed, but no API role can read the table, so it is a **manual** `postgres` query unless a dedicated read-only role exists (see "Least privilege"). `n` counts recorded events, so it proves the cap was used up, not how many were rejected. |
| `QZ-4XX-SHARE` | `edge_4xx_other / requests_total`: 4xx other than 429 on the RPC path, POST only (`edge-status-mix.sql`) | 5% (0.05) | 20% (0.2) | Needs at least 50 requests in the window, otherwise state `insufficient_volume` (reported, not alerting). Catches oversize/invalid payloads (400), a wrong or rotated public key (401/403) and client regressions. Synthetic probes (below) are subtracted from numerator and denominator. |

The three 429 alerts are deliberate redundancy: any one of them firing is a cap hit. If only one source works on a project,
the others report `no_data`, which is **not** treated as "ok". A log alert whose liveness checks fail is also `no_data`, even though its own number is 0 (next section).

## A zero from a log query is not proof of quiet (liveness, Themis N44-01)
A ClickHouse aggregate without `GROUP BY` returns **one row of zeros** when its field keys match nothing. A wrong key
(`request.method`, `parsed.sql_state_code`, ...), an ingestion gap or a retention problem therefore looks exactly like a quiet
system. So the two log queries also return **liveness counters**, and `alerts.json` (`liveness`) turns them into checks. A log
alert listed under `requires_liveness` is reported `no_data` (never `ok`) while one of its checks fails; a real warn or critical
reading is never downgraded.

| Liveness check id | Fails when | Protects |
| --- | --- | --- |
| `QZ-LIVE-EDGE-ROWS` | `edge_logs_total` is 0 (no gateway rows in 15 minutes: ingestion gap, retention, or an idle project with no probe) | gateway alerts |
| `QZ-LIVE-EDGE-FIELDS` | `edge_logs_total` > 0 but `edge_logs_schema_rows` is 0 (no row carries `request.method`, `request.path` and `response.status_code`) | gateway alerts |
| `QZ-LIVE-PG-ROWS` | `pg_rows_total` is 0 | `QZ-429-PT429-LOG` |
| `QZ-LIVE-PG-SQLSTATE` | rows exist but none has `parsed.sql_state_code` | `QZ-429-PT429-LOG` |
| `QZ-LIVE-PG-SEVERITY` | rows exist but none has `parsed.error_severity` | `QZ-429-PT429-LOG` |
| `QZ-LIVE-PG-XCHECK-429` / `QZ-LIVE-PG-XCHECK-400` | `PT429` (`PT400`) rows of any severity exist but none has severity `ERROR` (the severity value differs on this project) | `QZ-429-PT429-LOG` |
| `QZ-LIVE-PROBE-PG` | `pt400_log_count` < `probe_sent` (a probe left no PT400 log row) | `QZ-429-PT429-LOG` |
| `QZ-LIVE-PROBE-EDGE` | `edge_4xx_other` < `probe_sent` (a probe left no gateway 4xx row on the RPC path) | gateway alerts |

An input that is absent (an old stats file without the new fields) fails its check too: **a missing liveness number is `no_data`,
never healthy.** `QZ-CAP-SATURATED-MINUTES` reads a table, not a log, and needs no liveness check.

### Synthetic probe (DEFINED, NOT ACTIVE)
The checks above prove the keys exist somewhere in the logs. The probe proves the whole path end to end, including the RPC path
regex and an idle project: a **synthetic probe** is one `POST /rest/v1/rpc/record_quiz_event` with the project's public anon key
and one oversize argument (for example a 65-character `p_network`). The function raises `PT400` before any table access
(pgTAP `0024`), so nothing is written and the cap counter is not touched. Each probe must leave exactly one `PT400` `ERROR` row in
`postgres_logs` and one 4xx row in `edge_logs`. Definition: `alerts.json` (`probe`). **Nothing in this repository sends the probe,
schedules it, or holds a key for it.** It is a remote action and needs Mark's approval before anyone creates it.

If and when a scheduler sends it (suggested every 10 minutes), the scheduler passes `probe_sent` = the probes it sent inside the
15-minute window **excluding the newest 3 minutes** (log ingestion lag; the lag is an assumption to measure on dev). Pass `0`
when no probe runs. Recurring checks use `>=` (real oversize traffic can add rows); the one-time calibration below requires
**exactly 1** row per probe on an otherwise quiet project.

## Running it
1. Run the three queries (SQL Editor with query source **Logs** for the two ClickHouse ones; **Database**, manually as `postgres`,
   for `cap-saturation.sql`) or the equivalent in any log pipeline.
2. Put the numbers in a JSON file (names are in `alerts.json` under `stats_inputs`; `probe_sent` is `0` when no probe runs):
   ```json
   { "edge_logs_total": 1000, "edge_logs_schema_rows": 1000, "requests_total": 400, "edge_429_total": 0, "edge_429_postgrest": 0,
     "edge_429_gateway": 0, "edge_4xx_other": 3, "pg_rows_total": 5000, "pg_rows_with_sqlstate": 5000, "pg_rows_with_severity": 5000,
     "pt429_log_count": 0, "pt429_log_rows_any": 0, "pt400_log_count": 0, "pt400_log_rows_any": 0, "saturated_minutes": 0,
     "probe_sent": 0 }
   ```
3. `npm run ops:quiz-alerts -- stats.json` (or `--json`, or `-` to read stdin). Exit code: `0` ok, `1` warn, `2` critical,
   `3` no data or invalid input (precedence critical > warn > no_data > ok). The input is validated: negative, non-integer or
   inconsistent counts (for example 4xx above total requests, or a subset larger than its set) are rejected instead of guessed.
4. **Failed or empty query = no data.** A scheduler must treat a query that errored, timed out or returned no row as "metric not
   provided" (the key absent or `null`), never as `0`. Page on `overall`; for `no_data` page after two consecutive evaluations
   (a single gap can be ingestion lag).

Wiring step 1 and the paging to a scheduler and a notification channel is an infrastructure change for the owner (see
"Needs the owner").

## Least privilege for whatever runs the signals (Themis N44-02)
- The database signal (`cap-saturation.sql`) reads `private.quiz_event_rate`, which only the owner can read. **The scheduler uses
  either (a) a manual database signal, or (b) a dedicated read-only role added by a separately reviewed migration**, with one
  aggregate row and no other privilege, credentials in the provider secret store, rotated, usable only by the scheduler.
  **Never the `postgres` role or `service_role`**, and no other owner-level credential, in a scheduler.
- Option (a) is the default and needs nothing: someone runs `cap-saturation.sql` by hand in the SQL editor after a log alert
  fires. Option (b) is **not** part of this change: it would be a new migration and needs Themis review and Mark's approval.
- The log signals need Supabase log access, but **no broad Supabase log token**: do not hand an account-wide or organisation-wide
  management token to a scheduler to read two counters. Use only a credential scoped to log reads on this one project; if the
  provider offers none, run the two log queries manually or through a reviewed export.
- Whatever runs the evaluator needs the numbers, not any credential: it is offline (no network, no database, no secret).

## Verify the pipeline once on dev (read-only except one deliberate bad request)
A silent alert is worse than none, so prove the signals exist before relying on them:
1. Field discovery (SQL Editor, source Logs):
   `select arrayJoin(mapKeys(log_attributes)) as key, count() as n from logs where source = 'edge_logs' group by key order by n desc limit 100;`
   and the same for `postgres_logs`. Confirm `request.method`, `request.path`, `response.status_code`,
   `response.headers.sb_error_code`, `parsed.sql_state_code`, `parsed.error_severity` exist and that the severity value of a
   raised error is `ERROR`. If a key differs, change the query and `alerts.json` together. The liveness counters must then be
   non-zero (`edge_logs_schema_rows`, `pg_rows_with_sqlstate`, `pg_rows_with_severity`).
2. Calibrate with **one** oversize request to `/rest/v1/rpc/record_quiz_event` on **dev** (for example a 65-character
   `p_network`), on an otherwise quiet project. Within a few minutes `postgres-log-sqlstate.sql` must show
   `pt400_log_count` **exactly 1** (not `>= 1`) and `edge-status-mix.sql` must show `edge_4xx_other` exactly 1. Record
   `pt400_log_rows_any` as well: **the multiplier** is `pt400_log_rows_any / pt400_log_count`. If `pt400_log_count` is above 1 for
   one request, one error yields several ERROR rows and every `pt429_log_count` threshold is multiplied by that factor: fix the
   query (de-duplicate) before use. If it is 0, the PT429 log alert is blind on this project: use the gateway and database signals.
   Each later probe must then produce at least one row per probe (`QZ-LIVE-PROBE-*`).
3. Check the assumption behind `edge_429_postgrest`: Supabase documents `sb_error_code` as empty when the request reached
   PostgREST, but its log-field reference does not list `response.headers.sb_error_code`. **The `sb_error_code` gateway-429
   exclusion is UNVERIFIED on real logs and stays labelled so until this check is done.** A real cap hit cannot be produced safely
   on dev (it needs 120 events in a minute), so confirm with the database signal during the first real cap hit that
   `edge_429_postgrest` and `saturated_minutes` move together, and check whether any 429 row carries the header. Until then treat
   `QZ-429-EDGE-POSTGREST` as "all 429s" corroboration only.
4. Projects created before June 2026 may still use the BigQuery log engine (`cross join unnest(metadata)`); the ClickHouse
   queries here do not run there and must be translated. `cap-saturation.sql` is unaffected.

Calibration record (fill in on dev; nothing has been run):
| Check | Result | Date |
| --- | --- | --- |
| Keys exist (step 1) | not run | |
| `pt400_log_count` exactly 1 per probe, multiplier (step 2) | not run | |
| `sb_error_code` present on a 429 row (step 3) | not run | |

## When an alert fires
- **Cap hit (`QZ-429-*`, `QZ-CAP-SATURATED-MINUTES`)**: real visitors' quiz events are being dropped for that minute (the quiz
  itself keeps working). Check whether it is an ad burst (compare with ad spend and `public.quiz_funnel_summary` over a short
  window) or a flood (one source, no matching quiz completions). Burst: raise the cap with a new migration
  (`quiz-funnel-events.md`, "Rate limit"). **Raising the cap needs Mark Johnson's (Owner) approval and Themis review**: the cap is the
  control that bounds `quiz_events` storage (2.4 GB at cap x 90 days, sized in `quiz-funnel-events.md`), and there is no runtime
  override. Flood: add the documented per-IP edge rule (30 requests/min/IP, challenge or block)
  in front of the path; the database cannot see IPs. Do not try to identify or join anonymous sessions to accounts.
- **4xx share (`QZ-4XX-SHARE`)**: look at the status split first. 400s: oversize or invalid payloads, a client regression or
  probing (`pt400_log_count` confirms `payload_too_large`). 401/403: the public key was rotated or the request lost its `apikey`;
  check the client build's `EXPO_PUBLIC_SUPABASE_*` values. These requests never reach the cap, so an oversize flood is visible
  only here.
- **`no_data`**: treat as a broken alert, not as a quiet system; look at the failing liveness check first (wrong key, ingestion gap,
  probe not visible), then re-run the pipeline check.

## Needs the owner (not done here)
1. Decide where the evaluator runs and which channel receives warn and critical. The database signal stays manual unless a
   dedicated read-only role is added by a separately reviewed migration; never the `postgres` role or `service_role` and no broad
   Supabase log token (see "Least privilege"). Any hosted alert rule, scheduled job, probe or notification is a remote change and
   was deliberately not created: **the alerts stay DEFINED, NOT ACTIVE.**
2. Approve (or decline) the synthetic probe and its cadence.
3. Run the "Verify the pipeline" steps on dev after migration `20261023000120` is applied there, and fill in the calibration record.
4. Keep the per-IP edge rule on the list: alerts detect, they do not limit.
