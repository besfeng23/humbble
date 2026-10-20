# Database runbook — Humbble P2-01 through P2-03

## Scope and safety boundaries

Migration `20261020000001_enums_and_profiles.sql` establishes the identity/profile domain (`profiles`, `profile_photos`, `user_preferences`, and `verification_requests`). Migration `20261020000002_discovery_matches_messaging.sql` adds `swipes`, `daily_swipe_quotas`, `matches`, `conversations`, `conversation_participants`, `messages`, and `blocks`. Migration `20261020000003_safety_billing_privacy_audit.sql` adds reports, moderation cases, subscription/entitlement state, provider payment events, consent evidence, privacy requests, and audit events. Run the migration chain against the local Supabase stack and synthetic users first. Do not link the local CLI to a remote project or apply these files to production as part of P2-01–P2-03.

All public tables in migrations 0001–0003 enable Row Level Security. Profile reads are owner-only; no client-facing cross-user profile read or discovery projection exists in these migrations. Other users must never receive `profiles.birth_date`. A separately reviewed safe discovery RPC or `security_invoker` projection is required before shipping discovery.

`profiles` grants client UPDATE only for `display_name`, `city_region`, `occupation`, `education_level`, `languages_spoken`, `shared_interests`, `relationship_intention`, `prompts`, and `is_incognito`. Triggers enforce the 18+ age gate and reject changes to `birth_date`, `verification_status`, `is_discoverable`, and `is_suspended` except through trusted roles. `verification_requests` is owner-readable but has no client write path. It stores provider metadata only; the schema does not store raw selfies or biometric templates. `profile_photos` stores object-path metadata, not file contents; Storage bucket/policy configuration remains a later reviewed migration.

P2-02 client reads are owner/participant-scoped. Direct authenticated writes to swipe history, daily quotas, matches, conversations, and participant membership are denied; swipes are intended to be written through a later actor-derived transactional RPC. A reciprocal pair is stored once in canonical UUID order (`user_a_id < user_b_id`). A pair-keyed transaction advisory lock plus uniqueness constraints serializes concurrent reciprocal likes so the second committed like can create at most one match, conversation, and two participants. CI verifies concurrency using `supabase/tests/concurrency/reciprocal_likes.sh`, which runs two independent host-side `psql` clients; it is intentionally outside pgTAP because Supabase local Postgres does not support opening a second authenticated database connection from the non-superuser test session. The P2-02 tests reserve synthetic Auth IDs `...0011` through `...0014` and remove their records when complete.

## P2-03 safety, billing, privacy and audit

- **Reports:** an authenticated user may insert a report with `reporter_id = auth.uid()` and read only reports they submitted. Client roles cannot update or delete reports. Moderation state changes are server-owned. The reported user is not given direct access to the report.
- **Moderation cases:** all table access is server-role-only. Case rows refer to reports using `ON DELETE SET NULL`, so deleting a report does not accidentally erase a case. There is no client-controlled moderator role or assignment field.
- **Subscriptions and entitlements:** `subscription_status` distinguishes `approval_pending`, `active`, `past_due`, `suspended`, `cancelled`, `expired`, `refunded`, and `revoked`. Clients may read only their own subscription and entitlement rows. They cannot create or change subscriptions or grant/revoke entitlements. No database trigger converts an `active` subscription row into an entitlement. The later payment/reconciliation service must require independently verified settlement and matching server-catalogue amount/currency before entitlement is granted; browser redirects or client flags are not proof of payment.
- **Payment events:** `(provider, provider_event_id)` is unique and is the provider-event idempotency key. `amount` and `currency` are stored together when an event is financial, supporting later commission reconciliation without introducing affiliate tables. The raw webhook payload is not persisted; an optional SHA-256 digest can identify a processed payload without storing it. Client roles cannot access payment events. The service role may advance processing fields but cannot rewrite the provider event ID, resource association, amount, currency, or other event facts through its column grants; a trigger adds defense in depth. The unique provider event and financial fields do not by themselves verify a provider signature or authorize an entitlement.
- **Consent records:** consent choices are append-only for client and service roles. A later consent decision is a new row, not an edit to history. The retention policy, purpose/legal basis, notice wording, and whether any particular consent is required must be approved separately.
- **Privacy requests:** a user can submit and read their own export/deletion request, using a stable `idempotency_key` across retries. Only the service role advances workflow state. Allowed transitions are `requested → in_progress|failed|cancelled`, `in_progress → completed|failed|cancelled`, and `failed → in_progress`; completed and cancelled are terminal. Completion requires a completion timestamp. The request row tracks workflow, not proof that all storage cleanup has completed; callers must not claim deletion is complete before downstream cleanup is confirmed.
- **Audit events:** client roles have no table access. Service-role access is read/insert only. Application/server roles cannot update or delete stored audit rows; use compensating events to correct the record. Only privileged database maintenance can purge records after an approved retention decision.

### Deletion and retention policy boundaries

The migration distinguishes ephemeral authorization state from potentially retained safety/financial evidence:

- `entitlements.user_id` references `profiles` with `ON DELETE CASCADE`; derived access state does not survive account deletion.
- `reports.reporter_id` and `reported_user_id`, `subscriptions.user_id`, `payment_events.user_id` and `subscription_id`, `consent_records.user_id`, `privacy_requests.user_id`, `moderation_cases.assigned_moderator_id`, and `audit_events.actor_id` use `ON DELETE SET NULL` so the durable record can survive while direct foreign-key identity references are removed.
- `moderation_cases.report_id` uses `ON DELETE SET NULL`. Audit `target_id` is a non-FK reference so deleting a target does not erase event history. It can therefore retain a direct or indirect identifier after account deletion; the approved deletion policy must decide whether a given target reference is safe to retain, null, or tokenize. The migration does not assume all target references are lawfully retainable. Payment events retain provider event identifiers, optional amount/currency, processing status, and safe references for financial reconciliation.
- `retention_until` is nullable. `legal_hold` is also nullable: **NULL means not assessed**, not “no legal hold.” There are no hard-coded retention durations, blanket deletion windows, or legal-hold decisions in this migration. Counsel and the owner must approve retention schedules and legal-hold procedures before a production retention worker or purge operation is enabled.

These rules are a technical foreign-key strategy, not a legal conclusion that every record may or must be retained. Review records, fields, purposes, and legal obligations with counsel before using real-user data. The local synthetic-data tests verify that selected report, subscription, payment, consent, privacy-request, and audit records survive test-account deletion with identity FKs nulled, while entitlement rows cascade.

## Local setup and verification

Prerequisites: Docker running, Node/npm for application checks, PostgreSQL client (`psql`), and Supabase CLI. CI uses Supabase CLI `2.84.2` and requires no linked remote project or application secrets.

From the repository root:

```sh
supabase start
supabase db reset
supabase test db
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bash supabase/tests/concurrency/reciprocal_likes.sh
npm run lint
npm run typecheck
npm test
```

`supabase db reset` replays the local migration chain from a clean database on PostgreSQL major version 17. `supabase test db` runs pgTAP tests under `supabase/tests/`. The host-side concurrency test runs after pgTAP in the **Database (Supabase + pgTAP)** workflow; keep its connection string scoped to the disposable local stack and never substitute a remote or production URL. The SQL test fixtures use reserved synthetic ID ranges and explicit `p203-` provider references; do not reuse them for unrelated tests or real user data.

## Type generation

After a local schema reset, regenerate the database type baseline with:

```sh
supabase gen types typescript --local > lib/database.types.ts
```

Review the diff before committing. Generated types describe schema shape; grants, RLS and triggers remain authoritative. If regenerated types allow client writes that the role should not perform, preserve or restore the narrower application-facing `Insert`/`Update` contracts after generation.

## Change, rollback and release practice

- Add a new ordered migration for future changes; do not edit a migration already applied to a shared environment.
- Before merge, inspect DDL, grants and RLS; run local reset, pgTAP and the concurrency integration test; record actual command results in the PR.
- Migrations are safe to reset only in a disposable local database. A deployed/shared database requires a forward migration; do not manually drop tables or history as a rollback shortcut.
- Do not turn on a real payment webhook, entitlement grant, moderation workflow, privacy purge, backup policy, retention schedule or legal-hold behavior solely because schema work merged. Each needs a server-side implementation and the relevant owner/legal/security approval.
