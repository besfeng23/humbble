# Database runbook — Humbble P2-01 / P2-02

## Scope and safety boundaries

Migration `20261020000001_enums_and_profiles.sql` establishes the identity/profile domain (`profiles`, `profile_photos`, `user_preferences`, and `verification_requests`). Migration `20261020000002_discovery_matches_messaging.sql` adds `swipes`, `daily_swipe_quotas`, `matches`, `conversations`, `conversation_participants`, `messages`, and `blocks`. Run the chain against the local Supabase stack and synthetic users first. Do not link the local CLI to a remote project or apply these files to production as part of P2-01/P2-02.

All four tables have Row Level Security enabled. Profile reads are owner-only; there is deliberately no client-facing cross-user profile read or discovery view in this migration. In particular, other users must never receive `profiles.birth_date`. A separately reviewed safe discovery RPC or `security_invoker` projection is required before shipping discovery.

`profiles` grants client UPDATE only for `display_name`, `city_region`, `occupation`, `education_level`, `languages_spoken`, `shared_interests`, `relationship_intention`, `prompts`, and `is_incognito`. Database triggers enforce the age gate and reject changes to `birth_date`, `verification_status`, `is_discoverable`, or `is_suspended` except under `service_role` or `postgres`. Client inserts also have verification/discovery/suspension values forced to safe defaults. `verification_requests` is owner-readable but has no client insert/update/delete grants. It stores provider metadata only; no raw selfie, image artifact path, or biometric template is stored by this schema. Profile-photo rows contain object-path metadata, not file contents; Storage bucket/policy configuration belongs in a later reviewed migration.

All seven P2-02 tables also have RLS. Client reads are owner/participant-scoped. Direct authenticated writes to swipe history, daily quotas, matches, conversations, and participant membership are denied; swipes are intended to be written through a later actor-derived transactional RPC. A reciprocal pair is stored once in canonical UUID order (`user_a_id < user_b_id`). The unique actor/target swipe constraint, unique canonical match pair, unique conversation per match, and unique conversation/user participant key are the final integrity boundaries. A pair-keyed transaction advisory lock serializes reciprocal likes so the second committed like can create exactly one match, conversation, and two participants.

Messages are append-only for client roles. An authenticated sender must equal `auth.uid()`, be a participant in the conversation, and belong to an active match that is not blocked in either direction. A block ends an active match in the same transaction; removing a block does not automatically reopen it. Index comments in migration 0002 identify the intended feed history, incoming-like, participant, conversation-cursor, and reverse-block lookup paths. Daily quotas remain server-write-only until quota enforcement is implemented in the transactional swipe RPC.

## Local setup and verification

Prerequisites: Docker running, Node/npm for the application checks, and the Supabase CLI installed. The CI workflow provisions the CLI without requiring application secrets.

From the repository root:

```sh
supabase start
supabase db reset
supabase test db
npm run lint
npm run typecheck
npm test
```

`supabase db reset` replays the complete local migration chain from a clean database on PostgreSQL major version 17. `supabase test db` runs pgTAP tests under `supabase/tests/`. P2-01 wraps its profile tests in a transaction. P2-02 reserves synthetic Auth IDs `00000000-0000-0000-0000-000000000011` through `...0014`, cleans up leftovers before setup, and deletes those users at the end; do not reuse those IDs for unrelated fixtures. Its reciprocal-like regression uses two local `dblink` sessions and expects one transaction to wait on the canonical pair lock. Never use real user records in these tests.

The GitHub Actions job named **Database (Supabase + pgTAP)** runs `supabase start`, `supabase db reset`, and `supabase test db` on pull requests and pushes to `main`. It installs pinned Supabase CLI version `2.84.2`, uses local Docker-backed services, and requires no Supabase project credentials or application secrets. An SQL test failure blocks that job.

## Type generation

After a local schema reset, regenerate the Supabase schema baseline with:

```sh
supabase gen types typescript --local > lib/database.types.ts
```

Review the diff before committing generated output. Supabase-generated types describe schema shape and may include columns in `Update` shapes that application roles cannot write; generated TypeScript is not a security control. Preserve the narrower `profiles.Update` client contract in this file or add a clearly named application-write type after regeneration. Grants, RLS, and database triggers remain authoritative.

## Change and rollback practice

- Add a new ordered migration for future changes; do not edit a migration already applied to a shared environment.
- Before merge, inspect the migration and the RLS/grant matrix, run local reset and pgTAP, and record actual command results in the PR.
- These migrations are safe to remove only by resetting a disposable local database. A deployed/shared database requires a forward migration; do not manually drop profile tables, match history, conversations, or related Auth records as a rollback shortcut.
- Do not add verification-upload Storage policies or raw verification evidence fields without a separately approved privacy/security design. Provider callbacks must be server-authenticated and are responsible for verification status transitions.
