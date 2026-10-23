# Anonymous quiz funnel events (`public.quiz_events`)

Measures drop-off in the pre-signup `/quiz` (intent, age, timing, country, result) without
identifying anyone. Migration: `supabase/migrations/20261023000070_quiz_anonymous_funnel_events.sql`.
Client: `lib/quizAnalytics.ts`. Tests: `supabase/tests/0023_quiz_anonymous_funnel_events.test.sql`,
`lib/__tests__/quizAnalytics.test.ts`, `components/__tests__/quiz-screen.test.tsx`.

## Why a separate table
`public.funnel_events` is keyed by `user_id` and only allows `signup_completed`, `doi_confirmed`,
`profile_completed`. Loosening it would mix anonymous and account-linked data. `quiz_events` is
standalone, with no FK to `auth.users`.

## What is stored
| column | notes |
|---|---|
| `session_id` | random v4 UUID generated on the device (`crypto.randomUUID`), kept 30 days in local storage; not a fingerprint |
| `event` | `quiz_started`, `quiz_step`, `quiz_completed`, `quiz_cta_clicked` (CHECK allow-list) |
| `step` | 0 for non-step events, 1..4 for `quiz_step` |
| `answer` | enum only: step 1 `serious/marriage/friendship_first`, step 2 `18_29/30_39/40_49/50_plus`, step 3 `now/few_months/no_rush`, step 4 none |
| `country_code` | only on step 4; must be in the same ISO alpha-2 list as `profiles.country_code` |
| `network`, `click_id`, `attribution` | resolved server-side from the allow-listed params via `private.sanitize_attribution_params` and `attribution_networks.click_id_params` (same logic as signup); `attribution` is capped at 1024 bytes |
| `created_at` | `now()` |

Never stored: IP, user agent, user id, email, free text. The (event, step, answer, country)
combination is validated by one function, `private.quiz_event_shape_valid`, used by both the RPC and a table CHECK.

## Write path
`public.record_quiz_event(...)` is `SECURITY DEFINER`, `search_path=''`, executable by `anon` and
`authenticated` only. It validates, then in order: duplicate `(session, event, step)` returns `false`
(idempotent, no limit consumed); per-session cap (7 rows, `private.quiz_event_session_cap()`); global
breaker (1200 rows/minute, `private.quiz_event_global_rate_per_minute()`). Errors use SQLSTATE 22023
(invalid input), 54000 (payload too large) and 53400 (limit). It returns `true` only when a row is inserted.

## Access
RLS enabled, **no policies**. `REVOKE ALL` from PUBLIC, anon, authenticated and service_role on the table and
its sequence, then `GRANT SELECT` to `service_role` only. No UPDATE, DELETE, TRUNCATE or INSERT for any client
role. (PR #35 lesson: Supabase default privileges grant broad rights on new objects, so everything is revoked explicitly.)
Admin read: `service_role` via SQL or `public.quiz_funnel_summary(p_from, p_to)`, which returns distinct
sessions per day/network/event/step (window capped at 366 days).

## Consent and linking decision: NOT linked
`consent-map.md` CNS-04 makes non-essential analytics opt-in. Linking the quiz session to the new user at
signup would turn the events into personal data about an identified person without that consent, so:
- the session id is **never** put in signup params or `auth.signUp` metadata (a jest test asserts it is absent);
- the quiz answers continue to be saved with the account at signup exactly as in PR #34 (that is account data, not analytics);
- the client sends nothing when `EXPO_PUBLIC_QUIZ_ANALYTICS` is `0/false/off`, or when the browser sends
  Do Not Track or Global Privacy Control, or after the first send failure.

Two things for counsel (see CNS-04a in `consent-map.md`):
1. Whether anonymous, non-identifying quiz events need opt-in at all. The default build has them **on**;
   set `EXPO_PUBLIC_QUIZ_ANALYTICS=0` to turn them off, or flip the default if counsel requires opt-in.
2. `click_id` is an ad-network identifier. **Do not join `quiz_events` to `signup_attributions` on
   `(network, click_id)` or otherwise try to re-identify sessions.** That join would re-link a person.
   Consumers of the service_role read path must not do it.

## Retention and purge (90 days)
`public.purge_quiz_events(p_retention_days int default 90, p_limit int default 50000)`: service_role only,
minimum 7 days, deletes in batches and returns the number removed. **It is not scheduled by the migration.**
Suggested job (operator decision, requires pg_cron):

```sql
SELECT cron.schedule('purge-quiz-events', '17 3 * * *', $$SELECT public.purge_quiz_events(90)$$);
```
Or call it from a scheduled edge function using the service role. If a batch hits `p_limit`, run it again.

## Example read
```sql
-- service_role only
SELECT * FROM public.quiz_funnel_summary(now() - interval '7 days', now());
```

## Limitations
- No per-IP rate limiting (no IP is stored). The global breaker bounds flood growth; add per-IP limiting at the edge/WAF if abused.
- First answer wins per (session, event, step); a changed answer after Back is not updated.
- Attribution is sent on `quiz_started` only; if that event is lost, later rows have no network and the summary shows `direct`.
- A client can fabricate sessions up to the cap and the global breaker, so treat counts as indicative, not audited.
- Client gating is a build flag plus DNT/GPC, not a consent banner.

## Rollback
The rollback SQL is in the migration header (drops the three functions, the table and the private helpers).
