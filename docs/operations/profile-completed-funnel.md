# profile_completed funnel event

Migration `20261023000080_profile_completed_on_full_profile.sql`, pgTAP `supabase/tests/0030_profile_completed_funnel.test.sql`.

The event is recorded server-side, once per user, the first time `private.is_profile_complete` is true (see the migration header for the design).

## Applying it
- **Dev and prod: apply in a quiet window, in ONE transaction.** The migration drops and recreates triggers on `public.profiles` and
  `public.profile_photos`, which take strong locks until it commits: `ACCESS EXCLUSIVE` on `profiles`, and on `profile_photos` `ACCESS EXCLUSIVE`
  when the trigger already exists (re-apply) or `SHARE ROW EXCLUSIVE` on first apply (blocks writes, not reads).
- The file carries its own `BEGIN; ... COMMIT;` and starts with `SET LOCAL lock_timeout = '5s'`, so it is one transaction and the timeout is effective
  under any runner, including plain `psql -f` (a bare `SET LOCAL` in autocommit is a no-op with only a warning). If a long transaction holds either
  table the migration fails fast and rolls back (nothing applied) instead of queueing and blocking every read of `profiles`. If it times out, find and
  finish the blocker (`pg_stat_activity`) and re-run. Do not split the file or run it statement by statement.
- A failing funnel insert does not block a member write: the recorder catches any error from the `record_funnel_event` insert only and raises a
  `WARNING` (`profile_completed funnel write failed for <user>: ... (<sqlstate>)`). The next profile / photo write, or `refresh_my_discoverability`,
  retries. **Limit:** the wrapper covers only that insert. The `EXISTS` pre-check on `funnel_events` and the `private.is_profile_complete` evaluation
  that run before it are not guarded, so an error there (for example a lock timeout while another session holds `ACCESS EXCLUSIVE` on `funnel_events`)
  still aborts the member's write.
- **Alert on the warning.** The only signal of a swallowed failure is that Postgres log line, and it repeats on every relevant write while the cause
  persists (up to two per photo write: the photo trigger and the discoverability sync). Add a log-based alert on the text
  `profile_completed funnel write failed` (Supabase Logs / log drain) so a broken funnel is noticed instead of silently losing events.

## Rolling back
One transaction, in this order: restore `private.sync_profile_discoverability` from `...0041` first (the new version calls the recorder), then drop
the two triggers, restore the city-only `handle_profile_completed` and its trigger from `...0030`, and only then drop the new functions.
Dropping the recorder first breaks every member profile write. The exact steps are in the migration header.

## Test-payments notice (client)
`PAYMENTS_ARE_TEST_ONLY` in `lib/billing.ts` is derived from `EXPO_PUBLIC_PAYPAL_ENV` and `EXPO_PUBLIC_PAYPAL_ALLOW_LIVE`, mirroring the server gate
(`PAYPAL_ENV=live` and `PAYPAL_ALLOW_LIVE=true`). Unset, `sandbox`, a typo or only one of the two means test-only (the notice stays). It is display-only;
the server and the database refuse live PayPal regardless. Set the two client variables in the same change that enables live billing.
