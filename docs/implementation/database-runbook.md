# Database runbook — Humbble P2-01 through P2-04

## Scope and safety boundaries

The ordered local schema is:

1. `20261020000001_enums_and_profiles.sql` — identity/profile domain (`profiles`, `profile_photos`, `user_preferences`, `verification_requests`).
2. `20261020000002_discovery_matches_messaging.sql` — `swipes`, `daily_swipe_quotas`, `matches`, `conversations`, `conversation_participants`, `messages`, and `blocks`.
3. `20261020000003_safety_billing_privacy_audit.sql` — reports, moderation cases, subscriptions, entitlements, payment events, consent records, privacy requests, and audit events.
4. `20261020000004_rls_storage_and_hardened_rpcs.sql` — reasserts RLS/grant boundaries and configures private Storage buckets and policies.

Use the local Supabase stack and synthetic data first. Do not link the local CLI to a remote project, copy production credentials into CI, or apply this chain to production without the applicable review and approval.

## Row-level security, grants, and trust boundaries

Migration 0004 explicitly enables RLS on all 19 public application tables from migrations 0001–0003. Table grants control whether a role may access a relation; RLS controls which rows are visible or mutable. Both must remain restrictive. Client TypeScript types are not an authorization control.

`profiles` remains owner-readable only, including `birth_date`. There is no direct cross-user profile projection or public profile policy in this migration. Discovery must use a separately reviewed RPC or safe projection that omits exact birth dates and returns only the intended public fields. Profile updates remain restricted to the nine approved client-editable fields; triggers protect birth date, verification status, discovery eligibility, and suspension.

Preferences, profile-photo metadata, subscriptions, entitlements, consent history, privacy requests, conversations, messages, and other user-visible records remain owner- or participant-scoped under RLS. Client writes to swipe history, quotas, matches, conversations, participant membership, subscription state, entitlements, payment events, moderation workflow, and audit history are not enabled by this migration. Messages remain append-only for client roles, and the existing active-match/unblocked participant check governs inserts.

A trusted moderator is represented only by a server-controlled JWT `app_metadata.role = "moderator"` claim. The database helper intentionally ignores the user-editable `user_metadata` field and any profile column. Moderators may read reports and moderation cases; this migration does not grant them payment-event, audit-event, or verification-artifact access, and it does not give them direct write privileges for moderation workflow. Server endpoints and role provisioning need a separate controlled implementation and audit trail.

`payment_events` remains server-only. `(provider, provider_event_id)` provides idempotency, and `amount` / `currency` are stored together for future settlement and commission reconciliation. Those fields are not evidence of a valid provider signature and do not independently grant entitlements. Do not introduce affiliate tables as part of P2-04.

## Storage buckets and access strategy

Migration 0004 creates/updates two **private** buckets:

- `profile_photos`: maximum **5 MiB** per object; accepted MIME types are `image/jpeg`, `image/png`, and `image/webp`.
- `verification_artifacts`: maximum **10 MiB** and the same MIME allowlist, but no `anon` or `authenticated` client policy permits uploading, listing, downloading, moving, or deleting its objects. A restrictive deny policy provides defense in depth if a broad Storage policy is accidentally added later. Creating this empty private bucket does not authorize raw selfie or biometric retention; the default verification design still persists provider outcomes/opaque references only. Any future server-side evidence workflow requires separate privacy, legal, security, and vendor approval.

Profile-photo object names must begin with the authenticated user's UUID as the first path segment, for example `<auth.uid()>/photo-1.jpg`. The RLS policies check both that folder prefix and Storage's `owner_id`; operations outside the caller's folder fail. Bucket-level file size and MIME settings reject disallowed uploads independently of path policy. The `public` flag must remain false on both buckets.

**Signed URL strategy:** a private object's normal download is subject to Storage RLS. An authenticated owner may create a time-limited signed URL only for an object they can select under the owner-folder policy. Keep signed URLs short-lived (typically 60–300 seconds), treat the URL as a bearer credential while it is valid, and never log or store the signed URL as durable metadata. Never create signed URLs for `verification_artifacts` for client use. A different user must not receive a profile-photo URL directly from a guessed path; any future discovery/photo-sharing flow must first authorize that viewer in a reviewed server-side endpoint/RPC and return only a short-lived URL. Do not make either bucket public as a shortcut.

Supabase documents the relevant behavior in [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [bucket fundamentals and private access](https://supabase.com/docs/guides/storage/buckets/fundamentals), [upload limits](https://supabase.com/docs/guides/storage/uploads/file-limits), and [signed downloads](https://supabase.com/docs/guides/storage/serving/downloads). These references describe product behavior; the repository migration and CI tests remain the source of truth for this application.

## Retention, account deletion, and legal holds

`retention_until` remains nullable and `legal_hold IS NULL` means **not assessed**. Do not infer a statutory period or automatically purge records simply because a column exists. P2-03 uses `ON DELETE SET NULL` for selected safety/financial/privacy actor references and cascades user entitlements, but `audit_events.target_id` is intentionally non-FK and may retain an identifier. Counsel and the owner must decide which records and references may be retained, tokenized, nullified, or purged before enabling a retention worker on real-user data. These are schema/foreign-key choices, not a legal conclusion that retention is lawful or required.

## Local setup and verification

Prerequisites: Docker, Supabase CLI, and PostgreSQL client (`psql`). CI pins Supabase CLI **2.84.2** and does not require a linked remote project or application secrets.

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

`supabase db reset` replays migrations from a clean local PostgreSQL 17 database. `supabase test db` includes `0001_profiles.test.sql`, `0002_discovery_matches_messaging.test.sql`, `0003_safety_billing_privacy_audit.test.sql`, and `0004_rls_storage.test.sql`. The independent two-client reciprocal-like check runs after pgTAP in the **Database (Supabase + pgTAP)** workflow; keep its connection string scoped to the disposable local stack, never substitute a remote URL, and never add provider credentials to this workflow.

The P2-04 test reserves synthetic Auth IDs `00000000-0000-0000-0000-000000000041` through `...0045`; it runs inside a transaction and rolls its fixtures back. Do not reuse these IDs or `p204-` fixture labels for unrelated data. Role matrix checks use `SET LOCAL ROLE anon` / `authenticated` with synthetic `request.jwt.claims`. The moderator case is simulated by trusted `app_metadata`, and a negative test confirms `user_metadata.role` cannot grant access. `service_role` checks prove server access to selected protected records; this is not permission to expose a service credential to a client.

## Type generation

Migration 0004 changes RLS, grants, and the `storage` schema, not the shape of the `public` application tables. Therefore it requires no change to `lib/database.types.ts`. After future schema-shape changes, regenerate and review the diff:

```sh
supabase gen types typescript --local > lib/database.types.ts
```

Generated types can reflect schema columns without expressing row-level authorization. Preserve narrow client-facing `Insert`/`Update` contracts where needed; database grants, RLS, and triggers remain authoritative.

## Change, rollback, and release practice

- Add new ordered migrations for future changes; do not rewrite migrations already applied to a shared environment.
- Before merge, review table grants, role-specific RLS, Storage bucket flags/limits, object path policies, and privacy impact. Run local reset, the full pgTAP suite, and the host-side concurrency test; record actual results in the PR.
- Only reset a disposable local database. A shared/deployed database needs a forward migration and a reviewed rollback plan.
- Do not enable real-user verification evidence, a public media bucket, automated retention purging, production moderator provisioning, payment settlement, or premium entitlements solely because schema work merges. Each requires its corresponding implementation and approval.

## P2-05 — Hardened RPCs and atomic invariants

Migration `20261020000005_hardened_rpcs.sql` introduces eight explicitly granted functions. Each function uses a fixed `search_path`; sensitive user actions derive the acting identity only from `auth.uid()`. `SECURITY DEFINER` functions are owned by `postgres`, use schema-qualified table/helper references, and have `EXECUTE` revoked from `PUBLIC` and `anon`. Only the intended `authenticated`/`service_role` roles receive execute grants. Do not widen the `private` schema or directly grant client writes to server-owned tables as a workaround.

| Function | Principal and grants | Invariants enforced |
|---|---|---|
| `get_discovery_feed(p_limit, p_cursor)` | Authenticated only; `SECURITY DEFINER` because candidate profiles and photo metadata are private to their owners. | Requires eligible caller; candidates must be verified, discoverable, not suspended, 18+, and not incognito; excludes self, previously swiped accounts, and blocks in either direction; respects `user_preferences` age range; clamps page size to 1–50. Returns age and approved profile fields only—never `birth_date`, verification state, suspension state, or internal account flags. |
| `has_active_entitlement(p_user_id)` | Authenticated and `service_role`; `STABLE SECURITY INVOKER`. | Authenticated callers can check only their own entitlement (cross-user probe returns false); service-role JWT may check another user. True only if an entitlement is active and `valid_from`/`valid_until` contain the current time. Subscription UI/client state never grants access. |
| `record_swipe(p_target_id, p_direction)` | Authenticated only; `SECURITY DEFINER`. | Actor comes from `auth.uid()`; verifies actor and target eligibility, age, and bidirectional block status; rejects self and duplicate swipes. Free likes use a UTC-day atomic upsert/row lock capped at 15. `pass` does not consume quota; active entitlements bypass the free counter (`likes_remaining = -1`). The existing 0002 pair-lock/match trigger remains responsible for canonical reciprocal match, conversation, and participants. |
| `block_user(p_target_id)` | Authenticated only; `SECURITY DEFINER`. | Adds only the caller's block; rejects self/missing targets; is idempotent; relies on the 0002 block trigger to terminate active matches; audits only a newly inserted block. |
| `unblock_user(p_target_id)` | Authenticated only; `SECURITY DEFINER`. | Deletes only the caller's block and returns whether one was removed. Audit row is written only when a row is removed. Does not reactivate an ended match/conversation. |
| `submit_report(p_reported_user_id, p_category, p_context_summary)` | Authenticated only; `SECURITY DEFINER`. | Reporter comes from `auth.uid()`; self-report rejected; context limited to the existing 1,000-character column constraint; a transaction advisory lock enforces at most 10 reports per reporter in a rolling 24-hour window. Creates a privacy-minimized audit event without copying report context. |
| `request_privacy_action(p_request_type, p_idempotency_key)` | Authenticated only; `SECURITY DEFINER`. | User comes from `auth.uid()`; serializes per-user submissions; retries with the same key return the same request ID; only one `requested`/`in_progress` request per type may be open; new requests are audited. Existing worker-only transition trigger remains authoritative. |
| `moderation_transition_case(p_case_id, p_new_status, p_note)` | Authenticated and `service_role`; `SECURITY DEFINER`. | Requires trusted `app_metadata.role = 'moderator'` or a verified `service_role` JWT role; ignores `user_metadata`; validates allowed transitions under a row lock; sets `closed_at` consistently and writes an audit event. A service-role system action may have no Auth subject; the audit row records `actor_id = NULL` and `metadata.actor_principal = 'service_role'`. Direct client updates to case workflow remain denied. |

Message insertion continues to use the existing participant-guarded policy and `private.can_send_message`; P2-05 adds no duplicate message RPC. The pair lock, block trigger and message-policy check must continue to serialize/block unsafe relationship state changes.

### P2-05 tests and quota race

`0005_hardened_rpcs.test.sql` runs under a transaction and rolls all synthetic fixtures back. It tests function catalog metadata, `SECURITY DEFINER`/`INVOKER` modes, owner/search-path/grants, `anon` denial, safe discovery projection, caller/candidate eligibility, age/block/swipe filtering, free and entitled swipe quotas, reciprocal matching, blocking/unblocking, report rate limiting/ownership, privacy idempotency/open-request rules, trusted moderation transitions, and temporary-object search-path shadowing.

`supabase/tests/concurrency/swipe_quota.sh` must run on the CI host after `supabase test db`, against the disposable local `DATABASE_URL`. It runs 20 independent `psql` processes using one synthetic actor and distinct verified targets, then checks exactly 15 successful likes, 5 `quota_exceeded` errors, `likes_used = 15`, and 15 persisted swipe rows. It deletes only its reserved Auth users; FK cascades clean associated application rows. Never point this script at a shared or production database.

Commands:

```sh
supabase start
supabase db reset
supabase test db
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bash supabase/tests/concurrency/reciprocal_likes.sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bash supabase/tests/concurrency/swipe_quota.sh
```

The concurrency invariant is `15|5|15` (successful likes | quota errors | stored quota); the script separately verifies 15 persisted swipe rows. No dblink is used. Database RPCs remain a trusted transaction boundary, but generated TypeScript and UI state do not replace RLS, privilege checks, constraints, advisory locks, or provider-side payment verification.

## P2-06 — Types, seed and local pipeline

### Prerequisites and safety

Install Docker and the Supabase CLI pinned in CI to **2.84.2**. Run these commands from the repository root. The local workflow uses the disposable local Supabase stack; no production/hosted database credentials are used or required. Do not use `supabase link`, `--linked`, `--db-url` with a hosted URL, or `supabase db push` as part of this pipeline. Hosted development changes, if later approved, are applied manually by the owner from merged migration files using the appropriate hosted-project dashboard/workflow.

### Commands

| Command | Purpose |
|---|---|
| `npm run db:reset` | Resets the **local** Supabase database, replays every migration and loads `supabase/seed.sql`. Refuses configured `SUPABASE_DB_URL`/`DATABASE_URL` destinations whose host is not `localhost` or `127.0.0.1`. |
| `npm run db:types` | Runs `supabase gen types typescript --local --schema public` and replaces `lib/database.types.ts` with raw generated output. |
| `npm run db:types:check` | Regenerates types to a temporary file and byte-compares them with the committed file. A mismatch fails with `database types are stale: run npm run db:types`; CI also prints the complete generated file for diagnosis. |
| `npm run db:lint` | Runs `supabase db lint --local --level warning --fail-on error`. Warning-level output is visible, but only lint errors fail the command. |
| `npm run db:diff` | Runs `supabase db diff --local`. If local schema changes exist beyond the migration chain, the command prints the diff and exits non-zero. |

### Migration workflow

After changing a migration, use this sequence:

```sh
npm run db:reset
supabase test db
npm run db:types
npm run db:types:check
npm run db:lint
npm run db:diff
# Commit the migration and the regenerated lib/database.types.ts together.
```

Migrations are the single source of truth. Never hand-edit `lib/database.types.ts`; move app-facing client-write restrictions, row aliases and RPC helper aliases to `lib/database.contracts.ts`. TypeScript narrowing is defense in depth only: grants, RLS, constraints and RPC authorization remain authoritative.

### Synthetic seed policy

`supabase/seed.sql` starts with an explicit fake-development-only header and a database/server-address guard. It creates ten entirely synthetic profiles using reserved UUIDs `00000000-0000-0000-0000-000000000901` through `...000000000910`, email addresses `seed-NN@example.test`, and display names beginning with `Seed `. Eight are verified/discoverable adults; one is unverified and one is suspended. Each profile has preferences. Generic regions are limited to `Metro Manila`, `Cebu`, `Davao`, and `Iloilo`. Placeholder photo paths are metadata only; the seed never writes `storage.objects`. Two normal reciprocal swipe inserts exercise the match trigger and create one match/conversation, with two synthetic messages. The fixture includes one block and one report. It creates no subscription, entitlement or payment-event rows. Hosted projects must never receive this file.

The seed's reserved UUID range is separate from pgTAP/concurrency fixtures (`0x00–0x99`). Tests use their own transaction-scoped fixtures, and RLS must continue hiding the seeded conversation/messages from other users. Do not add unscoped `storage.*` mutations to seed cleanup or tests.

### CI pipeline

The `Database (Supabase + pgTAP)` job pins `supabase/setup-cli@v1` to CLI `2.84.2`, starts a fresh local stack, resets and replays migrations plus seed, then runs the checks in order: **Lint database**, **Check schema drift**, **Check generated types are current**, and the existing pgTAP suite. It then runs the existing host-side reciprocal-like and swipe-quota concurrency scripts. A lint failure indicates database errors (warnings are emitted but do not fail this gate); a schema-diff failure means the local schema and migrations disagree; a type-drift failure means the committed generated file needs regeneration/review; a pgTAP/concurrency failure indicates a behavior, RLS, or race invariant regression. The independent **Lint, Typecheck & Test** job is unchanged.

No remote credentials are used or needed for reset, type generation, lint, schema diff, pgTAP, or the two concurrency checks.
