# Launch blockers (tracked compliance and security items)

Items that must be resolved or consciously accepted by the owner before public launch / live PayPal. Source: Themis reviews of PR #35/#36.

## LB-1 Privacy erasure is a stub (Themis F-10)
- `app/(tabs)/profile/privacy-delete.tsx` shows a success state **without calling** `request_privacy_action`, so a user who asks to delete or export their data
  gets a confirmation that nothing backs.
- There is **no erasure/DSAR worker and no retention job**. `public.privacy_requests` rows would sit in `requested` forever; the
  `UPDATE (status, completion_metadata, failure_code, completed_at)` grant for `service_role` has no consumer yet.
- Required before launch: wire the screen to `request_privacy_action` (and show the real state), build the worker (erasure, export, retention, legal hold
  handling through a reviewed SECURITY DEFINER function rather than a direct `UPDATE`), and add pgTAP/Deno tests for it. Until then the screen must not claim success.
- Do not describe account/data deletion as available in store listings or privacy copy.

## LB-2 Billing: service-role key is still a trust anchor (F-01 residual)
See `docs/operations/billing-trust-model.md`: a service-role key holder can fabricate a verified ledger event. Add HMAC attestation or a narrow billing role before live money.

## LB-3 Remaining broad grants (F-04, deferred)
`service_role` still has `ALL` on `profiles`, `conversations`, `conversation_participants`, `matches`, `swipes`, `profile_photos`, `user_preferences`, `daily_swipe_quotas`
(flagged DEBT in `supabase/tests/0026_privilege_matrix_allowlist.test.sql`). Narrow after enumerating writers (`profiles.is_suspended` is legitimately written by `service_role`).

## LB-4 Hosted default ACLs unverified
Run `docs/operations/privcheck4.sql` on dev and prod and compare with `docs/operations/privilege-hardening.md` ("Expected catalog state"). Tables created by
`supabase_admin` (Dashboard/SQL editor) still receive Supabase's permissive default grants; create tables only through migrations (run as `postgres`).
