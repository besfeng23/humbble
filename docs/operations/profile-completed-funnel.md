# profile_completed funnel event

Migration `20261023000080_profile_completed_on_full_profile.sql`, pgTAP `supabase/tests/0026_profile_completed_funnel.test.sql`.

The event is recorded server-side, once per user, the first time `private.is_profile_complete` is true (see the migration header for the design).

## Applying it
- Apply in a quiet window. The migration drops and recreates triggers on `public.profiles` and `public.profile_photos`, which takes `ACCESS EXCLUSIVE`
  locks on both tables until it commits.
- It starts with `SET LOCAL lock_timeout = '5s'`, so if a long transaction holds either table the migration fails fast and rolls back (nothing
  applied) instead of queueing and blocking every read of `profiles`. If it times out, find and finish the blocker (`pg_stat_activity`) and re-run.
  `SET LOCAL` only lasts for the migration's transaction.
- Analytics never blocks a member write: the recorder catches any error from the funnel insert and raises a `WARNING`
  (`profile_completed funnel write failed ...`). Watch the database logs for it. The next profile / photo write or `refresh_my_discoverability` retries.

## Rolling back
One transaction, in this order: restore `private.sync_profile_discoverability` from `...0041` first (the new version calls the recorder), then drop
the two triggers, restore the city-only `handle_profile_completed` and its trigger from `...0030`, and only then drop the new functions.
Dropping the recorder first breaks every member profile write. The exact steps are in the migration header.

## Test-payments notice (client)
`PAYMENTS_ARE_TEST_ONLY` in `lib/billing.ts` is derived from `EXPO_PUBLIC_PAYPAL_ENV` and `EXPO_PUBLIC_PAYPAL_ALLOW_LIVE`, mirroring the server gate
(`PAYPAL_ENV=live` and `PAYPAL_ALLOW_LIVE=true`). Unset, `sandbox`, a typo or only one of the two means test-only (the notice stays). It is display-only;
the server and the database refuse live PayPal regardless. Set the two client variables in the same change that enables live billing.
