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
- **Client wired (this branch, PR to follow review):** `privacy-delete.tsx` now calls `request_privacy_action` (via `lib/privacy.ts`), reuses one idempotency key per attempt,
  shows the member's own requests with a truthful status (`requested` = "Received - not processed yet") and never says data was exported or deleted. **LB-1 stays OPEN:** the worker
  (erasure, export, retention, legal hold), its reviewed SECURITY DEFINER function and the pgTAP/Deno tests are not built, and someone must own the manual handling of recorded requests until it is. The
  draft legal texts (`legal/drafts/terms-of-service.md` 9.1, `deletion-and-export.md`, `docs/legal/review-packet.md`) still describe immediate self-service deletion and must be reconciled by the owner/counsel before launch.
- **Copy + client hardening (Themis N45-02/04/05/06):** the in-app Privacy Notice section 3 and the settings nav labels no longer promise self-service/permanent deletion "at any time"; they say requests are recorded and handled manually. The idempotency key now uses a CSPRNG (no `Math.random` fallback), the screen checks for a session, and a missing `profiles` row (FK 23503) gets a correct message. The **in-app notice wording still needs Owner/counsel sign-off**, and `legal/drafts/*`, `docs/legal/review-packet.md` (CHK-JRN-14, section 7) and `docs/product/screen-inventory.md` (SCR-19) are **not** changed here (N45-03) and still contradict the app.

## LB-2 Billing: a service_role key can grant or revoke premium for any user, with no ledger event (Themis P39-01) - HIGH before live PayPal
Anyone holding the service-role key can, with three calls and the public price list (`billing_register_pending_subscription` -> `billing_record_readback`
with the plan's price and no event id -> `billing_apply_readback`), create an active premium entitlement for any user **without any `payment_events` row and
without PayPal**, and can revoke any user's premium the same way. PR #39 only removed the one-call forged-parameter path. See
`docs/operations/billing-trust-model.md`.
**Must be closed before live PayPal:** (1) a database-verified control (HMAC attestation verified in the DB, or a narrow billing role instead of the general
service-role key; plus mandatory, database-bound event citation for grants) **and** (2) a detective alert for any active PayPal entitlement without a
verified ledger event **that is cross-checked against an independent PayPal-side source** (a ledger-only alert is blind to a key that first writes a verified
event itself). Until both exist billing stays sandbox-only.

## LB-3 Hosted default ACLs open for functions and sequences (Themis PR #39 re-review, PR #40 review) - open until applied AND verified on dev/prod
Supabase's provisioning defaults give `anon`, `authenticated` and `service_role` EXECUTE on every new function and USAGE/SELECT/UPDATE on every new
sequence, and PostgreSQL gives PUBLIC EXECUTE on new functions. A migration that forgets its own `REVOKE` therefore ships a client-callable function. Migration
`20261023000100` closes this for objects created by `postgres` (schema-level and global-PUBLIC default ACL revokes, existing sequences, `service_role` USAGE/UPDATE on the two
unused sequences, trigger functions) and pgTAP `0031` fails CI if a public function (any kind, including aggregates) is executable by anon/authenticated outside an explicit allowlist, or if
an allowlisted function is switched to `SECURITY INVOKER`, changes owner or loses its pinned `search_path`. **Still open:**
(a) the migration is not applied on dev/prod; (b) **default ACLs of role `supabase_admin` stay open if the guarded step is refused** (expected on hosted): tables ALL, sequences, and functions (incl. the built-in PUBLIC execute) for
anon/authenticated; **no hosted CI control exists for this**, the only controls are the conventions and the manual read-only `privcheck6.sql` ownership checks
(`owner_not_postgres` must be empty); check the NOTICE on dev/prod and report the exact text, see `docs/operations/default-acl-hardening.md`; (c) verify with
`docs/operations/privcheck6.sql` before and after on dev and prod, and run `select current_user;` once in the dashboard SQL editor (it probably runs as `postgres`; unverified).
Conventions: create schema objects only through migrations; install extensions only `WITH SCHEMA extensions` (a `citext` install into `public` created 47 `supabase_admin`-owned functions executable by anon in a local repro).
Side effect to remember: new helper functions created by `postgres` in `private`/`extensions` are owner-only until granted (also not for `service_role`): add explicit grants.

## LB-4 Remaining broad grants (F-04, deferred)
`service_role` still has `ALL` on `profiles`, `conversations`, `conversation_participants`, `matches`, `swipes`, `profile_photos`, `user_preferences`, `daily_swipe_quotas`
(flagged DEBT in `supabase/tests/0029_privilege_matrix_allowlist.test.sql`). Narrow after enumerating writers (`profiles.is_suspended` is legitimately written by `service_role`).

## LB-5 Hosted table default ACLs unverified
Run `docs/operations/privcheck4.sql` on dev and prod and compare with `docs/operations/privilege-hardening.md` ("Expected catalog state"). Tables created by
`supabase_admin` (platform objects, extensions) still receive Supabase's permissive default grants (`ALL` for anon/authenticated/service_role) and **nothing in CI can see them on hosted**; create tables only
through migrations (run as `postgres`) and check `privcheck6.sql` section `owner_not_postgres` (no rows expected) on dev and prod.

## Follow-ups from Themis's PR #39 review (not in this PR)
- P39-05 default-ACL revoke is per schema: a later *global* `ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ... TO service_role` is not undone. `privcheck4.sql` flags such rows; no migration fix.
- P39-06 sequences: closed for anon/authenticated by migration `...000100` (`funnel_events_id_seq`, `postback_outbox_id_seq`; `notification_jobs_id_seq` was already closed) and `service_role` USAGE/UPDATE removed on the two without a `service_role` writer. Adding sequences to the `0029` matrix is still open (`0031` covers their exposure).
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

## Moderation console (P5-01, PR #46): production-enable gates (Themis review of 2026-10-24)
Source: Themis' review of PR #46 dated 2026-10-24 (the review report itself is not stored in this repository; the findings that matter are restated in the gates below), verdict (c) **CHANGES REQUESTED** for production enable. Merging #46 and a single-apply on dev with one *test* moderator are acceptable (nothing is enabled by merge);
**do not apply the migration to production and do not grant the first real moderator claim until ALL of the following are done.** See `docs/operations/moderation-console.md` for what the console does and does not guarantee.

- [ ] **N46-01 (HIGH) fixed and proven.** A suspended member could still send messages in existing matches and the recipient was pushed. Fix: PR #50 (`private.can_send_message` denies a suspended sender with the same `conversation_not_sendable` as a blocked sender). Gate = that fix **merged, applied on the target project, and its pgTAP (`0034_suspended_sender_cannot_message`) green**. Status at time of writing: PR #50 is **merged** (`6747cf9a`); migration `20261024000140_can_send_message_suspended_sender.sql` is **NOT yet applied to any database** (dev or prod), so this gate is still open until it is applied on the target project and its pgTAP is green there.
- [ ] **N46-02 (MEDIUM) fix in this PR.** A moderator could open, review, warn, dismiss or close a case in which they are the reported member (the self-action guard covered only suspend / lift_suspension). Fix: migration `20261024000150_moderation_self_action_guard_all_actions.sql` extends the same guard (same error `moderation_self_action_not_allowed`, SQLSTATE 23514) to `moderation_open_case`, **every** `moderation_take_action` verb, `moderation_transition_case` (human callers; the service_role system actor is unchanged) and `moderation_get_case` when `reported_user_id = auth.uid()`; pgTAP `0035_moderation_self_action_guard`. Gate = that PR **merged, the migration applied on the target project, and `0035` green there**. Status at time of writing: **not merged, not applied to any database**. Residual: direct moderator `SELECT` on `reports` / `moderation_cases` (N46-03) is not covered by recusal, and recusal is per account id only.
- [ ] **N46-03 (MEDIUM) decision recorded.** Moderators can `SELECT` all `reports` / `moderation_cases` directly via RLS with no audit row, so "every read is audited / no direct table reads" holds only on the console RPC path (docs corrected). Decide and record: drop the two moderator SELECT policies (RPCs only) **or** accept and monitor direct reads.
- [ ] **At least two named moderators, with MFA.** Dedicated named accounts (not the owner/admin or a founder's personal login), MFA enabled, so a conflicted moderator can recuse. Document revocation (JWT role changes apply only after the token refreshes) and a periodic review of who holds the claim. Nobody is appointed yet (DEP-SAFE-01).
- [ ] **Mark's explicit OK** to enable the console in production (recorded here with date).

Also required by Themis before production enable (not part of the five gates above): guidance that moderator reasons contain IDs/enums and no personal data beyond IDs, and confirmation of retention for moderation `audit_events` rows (N46-10); a post-apply smoke test (anon and non-moderator denied; a moderator's case view produces a `moderation.case_viewed` row).
