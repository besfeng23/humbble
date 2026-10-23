# Default ACLs for functions and sequences (Themis PR #39 re-review)

Migration `20261023000100_default_acl_functions_sequences.sql`, pgTAP `supabase/tests/0031_public_function_exposure_allowlist.test.sql`,
read-only inventory `docs/operations/privcheck6.sql`. Tracked as LB-3 in `launch-blockers.md` (open until applied and verified on dev and prod).

## What the migration changes (objects created by role `postgres`)
| Statement | Effect |
|---|---|
| `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated` | new public functions are not born executable by anon/authenticated |
| `... IN SCHEMA public REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM PUBLIC, anon, authenticated` | new public sequences are closed to anon/authenticated |
| `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` (global) | removes PostgreSQL's built-in "EXECUTE for PUBLIC" default. **Needed:** verified locally that the schema-level revoke alone leaves a new function executable by anon through PUBLIC. Grants nothing to API roles. |
| `REVOKE ALL` on every existing public sequence (owner = current role) from PUBLIC, anon, authenticated | closes `funnel_events_id_seq` and `postback_outbox_id_seq` (were `rwU` for anon/authenticated). `notification_jobs_id_seq` was already closed. |
| `REVOKE ALL` on public trigger functions from PUBLIC, anon, authenticated | `enforce_max_profile_photos`, `enforce_profile_birth_date_18_plus`, `enforce_profile_column_locks`, `set_row_updated_at` (and any other) were executable by authenticated. EXECUTE on a trigger function is only checked at CREATE TRIGGER time, never when it fires. |

`service_role` keeps its defaults (EXECUTE on new functions, USAGE/SELECT/UPDATE on new sequences) as requested. All statements are idempotent and
run in one transaction (`BEGIN; SET LOCAL lock_timeout = '5s'; ... COMMIT;`).

## `supabase_admin` default ACLs: tried by the migration, guarded
Objects created by `supabase_admin` (the dashboard SQL editor, some extensions) get Supabase's permissive defaults. Only `supabase_admin` or a superuser may
change them. Step 4 of the migration **tries** these three statements, each in its own exception block, so a refusal (SQLSTATE 42501) is a `NOTICE` and the
migration still commits (it never loosens anything; if allowed it only revokes):
```sql
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
```
**Result on the local CLI stack** (role `postgres`, not a superuser, not a member of `supabase_admin`): all three are refused with the exact text
`ERROR:  permission denied to change default privileges`; inside the migration this appears as `NOTICE:  supabase_admin default ACLs NOT changed (permission denied to change default privileges): ALTER DEFAULT ...`.
**Hosted (dev/prod) is not yet tried**: after applying, read the migration output for those NOTICEs and the `supabase_admin` rows of `privcheck6.sql`
(section `default_acl`); report the exact text. Fallback if refused: Supabase support, or the convention below (if nothing is ever created as `supabase_admin`
in `public`, those defaults never apply to our schema).

## Conventions (also in `.github/pull_request_template.md`)
1. Every new function (including trigger functions and helpers): `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;` and then `GRANT EXECUTE` only to
   what is needed (`authenticated` for member RPCs, `service_role` for Edge Functions). Never rely on defaults.
2. A function that must be callable from the client (any role below `service_role`) goes on the allowlist in pgTAP `0031` in the same PR, with a justification.
3. New sequences: no grants to anon/authenticated; definer functions use them as the owner.
4. **Never create schema objects from the dashboard SQL editor** (they are owned by `supabase_admin` and get the permissive defaults). Migrations only.
5. Migrations that take locks carry their own `BEGIN; SET LOCAL lock_timeout = '5s'; ... COMMIT;`.

## Apply and verify (dev first, then prod, after Themis's review)
1. Run `docs/operations/privcheck6.sql` and save the output ("before").
2. Apply with `supabase db push` (or `psql -1 -f`); quiet window.
3. Run `privcheck6.sql` again ("after"). Expected: section `fn_api_exec` lists only the allowlisted RPCs from pgTAP `0031` (20 rows: `record_quiz_event` anon+authenticated,
   19 authenticated-only); `seq_api` has no rows; `default_acl` shows `postgres in all schemas objtype=f | no API-role entries`, `postgres in public` `S` and `f`
   with `service_role` only and `r` with no API-role entries. `supabase_admin` rows are informational.
4. Also run `privcheck4.sql` (default_acl section now has one more row, `postgres in all schemas objtype=f`).
5. Smoke test as a signed-in member: swipe, send a message, register a push token, open the quiz anonymously (`record_quiz_event` as anon).
Rollback is manual (forward-fix preferred); the statements are in the migration header.
