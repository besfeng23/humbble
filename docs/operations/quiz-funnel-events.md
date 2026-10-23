# Anonymous quiz funnel events (`public.quiz_events`)

Measures drop-off in the pre-signup `/quiz` (intent, age, timing, country, result) **without a stable
identifier that can be joined to anything else**. Migration:
`supabase/migrations/20261023000070_quiz_anonymous_funnel_events.sql`. Client: `lib/quizAnalytics.ts`.
Tests: `supabase/tests/0024_quiz_anonymous_funnel_events.test.sql`, `lib/__tests__/quizAnalytics.test.ts`,
`components/__tests__/quiz-screen.test.tsx`. Verification query: `docs/operations/privcheck-quiz.sql`.

**Status: OFF by default.** The client sends nothing, and stores nothing, unless the build sets
`EXPO_PUBLIC_QUIZ_ANALYTICS=1`. Do not set it in a production build until counsel has signed off
(`legal/drafts/consent-map.md`, CNS-04a).

## Why a separate table
`public.funnel_events` is keyed by `user_id` and only allows `signup_completed`, `doi_confirmed`,
`profile_completed`. Loosening it would mix anonymous and account-linked data. `quiz_events` is standalone: no FK
to `auth.users`, no user id, and (after review round 1) **no column that can be joined to `signup_attributions`**.

## What is stored (exactly)
| column | notes |
|---|---|
| `session_id` | random v4 UUID generated on the device, kept on the device up to 30 days; not a fingerprint |
| `event` | `quiz_started`, `quiz_step`, `quiz_completed`, `quiz_cta_clicked` (CHECK allow-list) |
| `step` | 0 for non-step events, 1..4 for `quiz_step` |
| `answer` | enum only: step 1 `serious/marriage/friendship_first`, step 2 `18_29/30_39/40_49/50_plus`, step 3 `now/few_months/no_rush`, step 4 none |
| `country_code` | only on step 4; must be in the same ISO alpha-2 list as `profiles.country_code` |
| `network` | only a slug that exists in `public.attribution_networks`; otherwise NULL. The client sends the generic `unknown` slug when the landing URL carried a click id but no network, **never the click id** |
| `utm_source`, `utm_medium`, `utm_campaign` | only values matching `^[a-z0-9_-]{1,32}$`, not hash-like (24+ hex characters) and not digit-heavy (9+ digits, e.g. phone numbers). Anything else is stored as NULL (the event itself is still recorded) |
| `created_at` | **rounded to the hour** (`date_trunc('hour', ...)`, enforced by a CHECK) |

Primary key `(session_id, event, step)`: this is the idempotency key and it bounds a session to at most 7
rows. There is **no** serial id, so insert order cannot reveal finer timing than the hour.

**Never stored:** click id, sub ids, any free-form attribution JSON, IP, user agent, user id, email, URL/path, free text.
`private.quiz_event_shape_valid` (answer/country by step) and `private.quiz_event_utm_valid` are used both by the RPC
and by table CHECKs, so a direct insert by a privileged role is held to the same rules. pgTAP asserts the exact column
list, that no column is json/array/inet, that no column name looks like a click/sub/param/user/ip/agent/email/url
column, that the only column names shared with `signup_attributions` are `network` and `created_at`, and that
PII-looking input such as `Juan Dela Cruz 09171234567` is rejected or stored as NULL.

### Not linked to the account (decision)
`consent-map.md` CNS-04 makes non-essential analytics opt-in. The session id is **never** put in signup params or
`auth.signUp` metadata (a jest test asserts it), so the events cannot be tied to an account by key. Quiz answers continue
to be saved with the account at signup exactly as in PR #34; that is account data, not analytics.

**Residual re-identification risk (stated honestly, not claimed away).** With no key to join on, the events are
*not linked*, but they are not mathematically anonymous either: at very low volume, a combination of answers
(intent, age range, timing, country) plus an hour could be compared with the quiz answers and `created_at` that a new
account stores. The mitigations are: no identifiers, hour-coarse time, a 90-day purge, default OFF, and a standing rule:
**do not join, match or try to re-identify `quiz_events` rows against accounts or `signup_attributions`.** Consumers of
the service_role read path must not do it. A `utm_*` slug is validated by shape, not meaning, so a hostile link could
carry a word-like slug up to 32 characters; digit-heavy and hash-like values are rejected. Platform request logs
(see below) are outside this table and are not covered by its retention.

## Switching it on (opt-in) and opting out
- **Flag:** `EXPO_PUBLIC_QUIZ_ANALYTICS=1` (also `true` / `on`) at build time. Unset or anything else = OFF. Listed in
  `.env.example`. Expo inlines `EXPO_PUBLIC_*` at build time, so changing it needs a new build.
- **Notice:** only when analytics are enabled for that visitor, the quiz shows one small line with a **Privacy** link
  (`/(public)/legal/privacy-notice`) and an **Opt out** control. When the flag is off, no notice is rendered.
- **Opt-out (web and native):** stored on the device (`localStorage` on web, AsyncStorage on native, key
  `humbble.quiz.optout.v1`). It takes effect immediately, deletes the local session id, and is read before any id is
  created. There is currently no in-app way to opt back in other than clearing site/app storage. Browser Do Not Track and
  Global Privacy Control are also respected on web.
- **Session id lifetime:** kept on the device **up to 30 days from first creation**. On the next quiz visit after that
  an expired id is deleted and a new one is created (`initQuizAnalytics`, enforced client-side and unit tested); it is also
  deleted on opt-out, and whenever analytics are off. Clearing site data / app storage removes it at any time.
  The server does not know session ages; it only sees an id.
- **Request:** a plain `POST /rest/v1/rpc/record_quiz_event` with only the public key (`apikey`, plus `Authorization`
  when the key is a legacy JWT). It deliberately does **not** use the shared Supabase client, so a signed-in user's token
  is never attached, and uses `credentials: 'omit'`. Supabase's API gateway logs still see the usual request metadata
  (IP, user agent, time) under the platform's own retention; this is disclosed in the privacy notice draft.

## Write path
`public.record_quiz_event(p_session_id, p_event, p_step, p_answer, p_country_code, p_network, p_utm_source, p_utm_medium, p_utm_campaign)`
is `SECURITY DEFINER`, `search_path=''`, executable by `anon` and `authenticated` only. Checks run cheapest first:
1. argument **lengths** (before any regex or parse): over-long text raises `PT400` `payload_too_large` (PostgREST answers **HTTP 400**; it was SQLSTATE 54000 / HTTP 500 until migration `20261023000110`, which changed only this error code);
2. session id v4 and shape (22023);
3. duplicate `(session, event, step)` returns `false` (idempotent, never consumes the limit);
4. lock-free peek at the current minute's counter: at the cap raises `PT429` `rate_limited` (PostgREST answers **HTTP 429**; it was SQLSTATE 53400 / HTTP 500 until migration `20261023000120`, which changed only this error code) without touching the counter row;
5. network lookup (only allow-listed slugs), then an **atomic** counter bump
   (`INSERT ... ON CONFLICT DO UPDATE SET n = n + 1 WHERE n < cap`) and the insert.
It returns `true` only when a row is inserted. The old `p_click_id` / `p_attribution` arguments no longer exist
(calling with them fails with 42883).

Error contract as seen through PostgREST (`POST /rest/v1/rpc/record_quiz_event`; the body is `{code, message, details, hint}`):

| Condition | SQLSTATE | `message` | HTTP |
| --- | --- | --- | --- |
| argument longer than its limit (event/answer 32, country 2, network/utm 64) | `PT400` (PostgREST custom status; `details` is a fixed rule text, the value is never echoed) | `payload_too_large` | 400 |
| bad session id | `22023` | `invalid_session_id` | 400 |
| unknown event / step / answer / country | `22023` | `invalid_quiz_event` | 400 |
| global per-minute cap reached | `PT429` (PostgREST custom status; `details` is a fixed text, no caller value is echoed, no `Retry-After` header) | `rate_limited` | 429 |

The web client only checks `res.ok` and stops sending for the rest of the session on any failure, so the status split has no
client behaviour change; it keeps oversize probes and cap hits out of 5xx error-rate alerts (a caller who can spend the
120/min cap must not be able to turn every later request into a 5xx). Cap hits are now **429s**, so the cap-hit alert is a
429 rate, not a 5xx rate (see "Edge / WAF rate limiting").

## Rate limit (global, documented config)
- **Cap: 120 events per minute, all callers combined** (`private.quiz_event_global_rate_per_minute()`).
  One visitor sends at most 7 events per quiz, so 120/min supports about 17 complete quiz runs per minute (about
  24,000 visits a day if perfectly even); real traffic is bursty, so size it from your ad spend and raise it knowingly.
- **Change it** with a new migration that does `CREATE OR REPLACE FUNCTION private.quiz_event_global_rate_per_minute() ... RETURN <n>`
  (same owner, `search_path=''`, no grants) and update the pgTAP default-cap assertion. There is deliberately no runtime
  setting an anonymous caller could influence.
- **Atomicity (F-07):** the counter is one row per UTC minute in `private.quiz_event_rate`. Measured on the local stack:
  16 parallel sessions, 960 attempts in the same minute against the cap of 120 stored exactly 120 rows (no overshoot).
- **Per-session bound:** structural, at most 7 rows per session id (primary key). A client can still mint many session
  ids; that is what the global cap and edge limiting are for.
- **This is a flood bound, not abuse prevention:** once the minute is full, real visitors' events are dropped for that
  minute (the quiz is never affected). Treat counts as indicative.

### Edge / WAF rate limiting (recommended, NOT configured by this PR)
The database cannot see the caller's IP (none is stored). Put a per-IP limit in front of
`/rest/v1/rpc/record_quiz_event`, for example a rule of **30 requests per minute per IP** on that path (a legitimate
visit sends at most 7), with a challenge or block action, using a CDN/WAF in front of a custom API domain. This
is an infrastructure change for the owner; until it exists, the global cap is the only limiter. Also alert on a sustained
rate of **HTTP 429 / `PT429`** responses on `/rest/v1/rpc/record_quiz_event` (PostgREST `Proxy-Status: PostgREST; error=PT429`;
it means the minute cap is being hit), or on `n >= cap` in `private.quiz_event_rate`. This is a separate alert from the 5xx
alert: cap hits no longer count as 5xx, so a 5xx-only alert would not see a flood. The Supabase gateway can also emit its own
429s, so match on the path and on the PostgREST `PT429` error code. Oversize requests are never counted by the cap (they are
400s); alert on a rising 4xx share on the same path as well.
The alerts are defined as code (ids, thresholds, read-only queries, offline evaluator, tests) in `docs/operations/quiz-funnel-alerts.md`; scheduling and notification channel are not configured.

### Disk size and measured row growth
Measured locally (Postgres 17, 1,001,000 rows via `generate_series`, realistic event mix, random uuids, hour-spread over 90 days):

| | heap | indexes | total | bytes/row |
|---|---|---|---|---|
| 1.0M rows | 82 MB | 74 MB | 156 MB | about 164 |

Worst case at the cap, 120 rows/min for 90 days = 15.55M rows, is about **2.4 GB** (plus about 25% for index/heap bloat
between purges, so budget **3 GB**). A typical day at an example 2,000 visits is 14,000 rows or about 2.3 MB.
**Alert** when `pg_total_relation_size('public.quiz_events')` exceeds **1 GB** (it means sustained traffic well above
the example, or an attack), and on database disk above 80%:
```sql
SELECT pg_size_pretty(pg_total_relation_size('public.quiz_events')) AS quiz_events_size,
       (SELECT count(*) FROM public.quiz_events) AS rows;  -- count(*) is slow past a few million rows; use reltuples then
```

## Retention and purge (90 days), scheduled in the migration
- `public.purge_quiz_events(p_retention_days int default 90, p_batch_size int default 20000, p_max_rows int default 2000000, p_time_budget_seconds int default 30)`:
  service_role only, minimum retention 7 days (22023 otherwise), **drains in a bounded loop** (batch deletes, stops at
  `p_max_rows` or the time budget, whichever is first; limits are clamped to 100000 / 5M / 300 s) and returns the number of
  rows deleted. It also deletes rate-counter rows older than 2 days.
- **Scheduled by the migration** with pg_cron: job `purge-quiz-events`, daily at 03:17 UTC,
  `SELECT public.purge_quiz_events(90)`. The migration is guarded: if `CREATE EXTENSION pg_cron` is not permitted or pg_cron is
  not installed it raises a **NOTICE** (with the exact command to run later) and continues; `cron.schedule` with a job
  name is an upsert, so re-running never creates a second job. **On a managed project, enable the pg_cron extension in the
  dashboard first, then re-apply or run the `cron.schedule(...)` statement from the NOTICE.**
- Measured: with 1,001,000 rows of which 922,215 were past retention, a single call deleted all 922,215 in 3.1 s.
  Worst-case daily inflow is 172,800 rows, far below one call's 2M cap, so the daily job keeps up with a 90-day window.
- **Dev verification (read-only single SELECT):** `docs/operations/privcheck-quiz.sql` (copy at
  `/workspace/humbble-plan/privcheck-quiz.txt`). It covers table privileges per role, RLS and policy count, PUBLIC ACL
  entries, function owner / `SECURITY DEFINER` / `search_path` / EXECUTE grants, the private rate table, and the
  `cron.job` row (guarded so it reports "pg_cron NOT installed" instead of failing). The expected values are in its header.
  To check only the schedule: `SELECT jobid, jobname, schedule, command, active FROM cron.job WHERE jobname = 'purge-quiz-events';`
  (expect one row: `17 3 * * *`, `SELECT public.purge_quiz_events(90)`, `active = true`), and the last runs:
  `SELECT status, start_time, end_time FROM cron.job_run_details d JOIN cron.job j USING (jobid) WHERE j.jobname = 'purge-quiz-events' ORDER BY start_time DESC LIMIT 5;`

## Access
RLS enabled, **no policies**. `REVOKE ALL` from PUBLIC, anon, authenticated and service_role on the table, then
`GRANT SELECT` to `service_role` only. No UPDATE, DELETE, TRUNCATE or INSERT for any client role. The rate table has RLS on and no
privileges for any role. (PR #35 lesson: Supabase default privileges grant broad rights on new objects, so everything is revoked explicitly.)
Reporting: `public.quiz_funnel_summary(p_from, p_to)` (service_role) returns sessions per day (UTC, day of the session's
first event) / network / utm_source / utm_campaign / event / step. **Reporting is aggregate, but a service_role
holder can read the raw anonymous rows** (that is why the no-joining rule above exists).
```sql
-- service_role only
SELECT * FROM public.quiz_funnel_summary(now() - interval '7 days', now());
```

## Limitations
- No per-IP limiting in the database (see edge/WAF above). The global cap can be consumed by an attacker, dropping real events.
- First answer wins per (session, event, step); a changed answer after Back is not updated.
- Network/utm are read from the first event that carries them (the client sends them on `quiz_started`); if that event is lost, later rows have no source and the summary shows `direct` / `(none)`.
- Per-network click-id parameter mapping is gone with the click id: any click id with no named network is reported as network `unknown`.
- **No small-cell suppression** in the summary: a day x network x campaign cell can be a single session. Small cells are the main
  residual re-identification risk (see above); do not publish the summary outside the team without suppressing small cells.
- **Summary performance (F-08):** `quiz_funnel_summary` scans the requested window (one pass). Measured 1.2 s for a 91-day
  window over 1.0M rows and 0.09 s for a 7-day window of the same table; it scales about linearly (about 20 s for the 15.5M-row
  worst case, extrapolated, not measured), so use short windows. `idx_quiz_events_created_at` serves the window filter. No
  pre-aggregated table was added (not needed at expected volume).
- Client gating is a build flag, a stored opt-out and DNT/GPC, not a consent banner; counsel decides whether a banner is required.

## Rollback
The rollback SQL is in the migration footer (unschedules the cron job, drops the three public functions, the table and the private helpers).
