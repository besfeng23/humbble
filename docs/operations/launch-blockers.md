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

## LB-2 Billing: a service_role key can grant or revoke premium for any user, with no ledger event (Themis P39-01) - HIGH before live PayPal
Anyone holding the service-role key can, with three calls and the public price list (`billing_register_pending_subscription` -> `billing_record_readback`
with the plan's price and no event id -> `billing_apply_readback`), create an active premium entitlement for any user **without any `payment_events` row and
without PayPal**, and can revoke any user's premium the same way. PR #39 only removed the one-call forged-parameter path. See
`docs/operations/billing-trust-model.md`.
**Must be closed before live PayPal:** (1) a database-verified control (HMAC attestation verified in the DB, or a narrow billing role instead of the general
service-role key; plus mandatory, database-bound event citation for grants) **and** (2) a detective alert for any active PayPal entitlement without a
verified ledger event **that is cross-checked against an independent PayPal-side source** (a ledger-only alert is blind to a key that first writes a verified
event itself). Until both exist billing stays sandbox-only.

## LB-3 Hosted default ACLs open for functions and sequences (Themis PR #39 re-review) - open until applied AND verified on dev/prod
Supabase's provisioning defaults give `anon`, `authenticated` and `service_role` EXECUTE on every new function and USAGE/SELECT/UPDATE on every new
sequence, and PostgreSQL gives PUBLIC EXECUTE on new functions. A migration or a dashboard SQL-editor change that forgets its own `REVOKE` therefore ships a
client-callable function. Migration `20261023000100` closes this for objects created by `postgres` (schema-level and global-PUBLIC default ACL revokes, existing
sequences, trigger functions) and pgTAP `0031` fails CI if a public function is executable by anon/authenticated outside an explicit allowlist. **Still open:**
(a) the migration is not applied on dev/prod; (b) default ACLs of role `supabase_admin` (objects created from the dashboard): the migration tries them in a guarded block and tolerates a refusal (locally
`permission denied to change default privileges`); check the NOTICE on dev/prod and report the exact text, see `docs/operations/default-acl-hardening.md`; (c) verify with
`docs/operations/privcheck6.sql` before and after on dev and prod. Convention: create schema objects only through migrations, never from the dashboard SQL editor.

## LB-4 Remaining broad grants (F-04, deferred)
`service_role` still has `ALL` on `profiles`, `conversations`, `conversation_participants`, `matches`, `swipes`, `profile_photos`, `user_preferences`, `daily_swipe_quotas`
(flagged DEBT in `supabase/tests/0029_privilege_matrix_allowlist.test.sql`). Narrow after enumerating writers (`profiles.is_suspended` is legitimately written by `service_role`).

## LB-5 Hosted table default ACLs unverified
Run `docs/operations/privcheck4.sql` on dev and prod and compare with `docs/operations/privilege-hardening.md` ("Expected catalog state"). Tables created by
`supabase_admin` (Dashboard/SQL editor) still receive Supabase's permissive default grants; create tables only through migrations (run as `postgres`).

## Follow-ups from Themis's PR #39 review (not in this PR)
- P39-05 default-ACL revoke is per schema: a later *global* `ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ... TO service_role` is not undone. `privcheck4.sql` flags such rows; no migration fix.
- P39-06 sequences keep the permissive default grants (`funnel_events_id_seq`, `postback_outbox_id_seq`, `notification_jobs_id_seq`). Follow-up: revoke on sequences and add them to the matrix.
- P39-07 kept service_role INSERT/column UPDATE on `reports`, `moderation_cases`, `verification_requests`: narrow after the writers are moved behind definer RPCs.
- P39-08 the eight DEBT tables (see LB-4) still give `service_role` ALL, including TRUNCATE/TRIGGER/REFERENCES.
- P39-09 consent withdrawal: see "Consent withdrawal" below. P39-11 (`quiz_events` matrix row) is done. P39-12: deploy the three PayPal Edge Functions together with migration 090 (`billing-trust-model.md`, "Applying the migration").
- N39-07 purge hardening (optional `p_limit`, 90-180 day service-level floor, min/max `recorded_at` in the audit row, alert on `billing.readbacks.purged`) and N39-06 test gaps (aged-row assertion for the 30-day floor; subscription event with a non-`I-%` resource id) are open follow-ups.

## Consent withdrawal (Themis P39-09 / N39-08): no API path yet
`public.user_consents` has one row per user (PK `user_id`). `authenticated` can INSERT the own row (RLS) but nobody except the table owner can UPDATE or DELETE it,
and only a TRUNCATE guard protects it. There is therefore **no API path to record a marketing-consent withdrawal after signup** through that table. Until one
exists, do not tell members in the app, store listings or privacy copy that they can withdraw marketing consent in-app. Fix (product/legal + engineering):
add a definer RPC that appends a consent change to `public.consent_records` (it already has `choice`, `consent_key`, `version`) and derives the effective state
from the latest row, or document where withdrawal is handled (support/privacy request). Tracked here because the draft privacy notice promises instant revocation.
