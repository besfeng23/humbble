# Database runbook — Humbble P2-01

## Scope and safety boundaries

Migration `20261020000001_enums_and_profiles.sql` establishes the first identity/profile domain: `profiles`, `profile_photos`, `user_preferences`, and `verification_requests`. It is intended to run against the local Supabase stack and synthetic users first. Do not link the local CLI to a remote project or apply these files to production as part of P2-01.

All four tables have Row Level Security enabled. Profile reads are owner-only; there is deliberately no client-facing cross-user profile read or discovery view in this migration. In particular, other users must never receive `profiles.birth_date`. A separately reviewed safe discovery RPC or `security_invoker` projection is required before shipping discovery.

`profiles` grants client UPDATE only for `display_name`, `city_region`, `occupation`, `education_level`, `languages_spoken`, `shared_interests`, `relationship_intention`, `prompts`, and `is_incognito`. Database triggers enforce the age gate and reject changes to `birth_date`, `verification_status`, `is_discoverable`, or `is_suspended` except under `service_role` or `postgres`. Client inserts also have verification/discovery/suspension values forced to safe defaults. `verification_requests` is owner-readable but has no client insert/update/delete grants. It stores provider metadata only; no raw selfie, image artifact path, or biometric template is stored by this schema. Profile-photo rows contain object-path metadata, not file contents; Storage bucket/policy configuration belongs in a later reviewed migration.

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

`supabase db reset` replays the complete local migration chain from a clean database. `supabase test db` runs pgTAP tests under `supabase/tests/`. Tests create synthetic Auth users in a transaction and roll back their records and the temporary grants used to exercise the profile-lock trigger. Never use real user records in these tests.

The GitHub Actions job named **Database (Supabase + pgTAP)** runs `supabase start`, `supabase db reset`, and `supabase test db` on pull requests and pushes to `main`. It uses local Docker-backed services and no Supabase project credentials or secrets. An SQL test failure blocks that job.

## Type generation

After a local schema reset, regenerate the Supabase schema baseline with:

```sh
supabase gen types typescript --local > lib/database.types.ts
```

Review the diff before committing generated output. Supabase-generated types describe schema shape and may include columns in `Update` shapes that application roles cannot write; generated TypeScript is not a security control. Preserve the narrower `profiles.Update` client contract in this file or add a clearly named application-write type after regeneration. Grants, RLS, and database triggers remain authoritative.

## Change and rollback practice

- Add a new ordered migration for future changes; do not edit a migration already applied to a shared environment.
- Before merge, inspect the migration and the RLS/grant matrix, run local reset and pgTAP, and record actual command results in the PR.
- This migration is safe to remove only by resetting a disposable local database. A deployed/shared database requires a forward migration; do not manually drop profile tables or related Auth records as a rollback shortcut.
- Do not add verification-upload Storage policies or raw verification evidence fields without a separately approved privacy/security design. Provider callbacks must be server-authenticated and are responsible for verification status transitions.
