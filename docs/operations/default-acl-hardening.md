# Default ACLs for functions and sequences (Themis PR #39 re-review)

Migration `20261023000100_default_acl_functions_sequences.sql`, pgTAP `supabase/tests/0031_public_function_exposure_allowlist.test.sql`,
read-only inventory `docs/operations/privcheck6.sql`. Tracked as LB-3 in `launch-blockers.md` (open until applied and verified on dev and prod).

## What the migration changes (objects created by role `postgres`)
| Statement | Effect |
|---|---|
| `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated` | new public functions are not born executable by anon/authenticated |
| `... IN SCHEMA public REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM PUBLIC, anon, authenticated` | new public sequences are closed to anon/authenticated |
| `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` (global) | removes PostgreSQL's built-in "EXECUTE for PUBLIC" default. **Needed:** verified locally that the schema-level revoke alone leaves a new function executable by anon through PUBLIC. Grants nothing to API roles. |
| `REVOKE ALL` on every existing public sequence **owned by `postgres`** from PUBLIC, anon, authenticated | closes `funnel_events_id_seq` and `postback_outbox_id_seq` (were `rwU` for anon/authenticated). `notification_jobs_id_seq` was already closed. |
| `REVOKE UPDATE, USAGE` for `service_role` on `funnel_events_id_seq` and `postback_outbox_id_seq` | `service_role` has no INSERT on either table, so it needs neither `nextval` nor `setval`; it keeps `SELECT`. The only writer is the `postgres`-owned definer `private.record_funnel_event`. |
| `REVOKE ALL` on public trigger functions **owned by `postgres`** from PUBLIC, anon, authenticated | `enforce_max_profile_photos`, `enforce_profile_birth_date_18_plus`, `enforce_profile_column_locks`, `set_row_updated_at` (and any other) were executable by authenticated. EXECUTE on a trigger function is only checked at CREATE TRIGGER time, never when it fires. |
| closing assertion block | **aborts the migration** (nothing is committed) if the expected sequences/trigger functions are missing or not owned by `postgres`, if any `postgres`-owned public sequence/trigger function is still open, or if the `postgres` default ACLs still reach PUBLIC/anon/authenticated. The migration also refuses to start unless the current role is `postgres`, a member of it, or a superuser. A run as a superuser such as `supabase_admin` is therefore safe: it no longer skips the `postgres`-owned objects and commits "successfully" with the hole open. Objects owned by other roles only raise a `WARNING` with their count. |

`service_role` keeps its defaults for **new** functions (EXECUTE) and **new** sequences (USAGE/SELECT/UPDATE) as requested; all statements are idempotent and
run in one transaction (`BEGIN; SET LOCAL lock_timeout = '5s'; ... COMMIT;`). `REVOKE`/`ALTER DEFAULT PRIVILEGES` take no relation lock, so the `lock_timeout` is
harmless but practically decorative. `psql -1 -f` prints "already a transaction in progress" warnings for this file (same as migration 080); the CLI does not.

### Side effect: new helper functions need explicit grants (fail-closed)
The global revoke also applies to functions that `postgres` creates later in **any** schema (`private`, `extensions`, ...): they are born executable by their owner only,
**not by PUBLIC, authenticated or `service_role`** (before: all of them, via the PUBLIC default). Existing functions are untouched. So a new `private.*` helper that an RLS
policy or an invoker function calls as `authenticated`, a new helper an Edge Function calls as `service_role`, or a new extension-schema function used by members needs an explicit
`GRANT EXECUTE ... TO <role>` in its own migration (plus `GRANT USAGE ON SCHEMA` if the schema is new). Forgetting it fails closed (permission denied), never open.
Trigger functions need no grant. Existing `private.*` helpers keep their current grants.

## `supabase_admin` default ACLs: what is and is NOT closed
**Plain statement: if step 4 of the migration is refused (the expected outcome for `postgres` on hosted Supabase), the default ACLs of `supabase_admin` stay open.**
Every object that `supabase_admin` creates in `public` is then born with Supabase's permissive defaults:
- **tables**: `ALL` for `anon`, `authenticated` and `service_role`;
- **sequences**: `USAGE, SELECT, UPDATE` for `anon` and `authenticated` (and `service_role`);
- **functions**: `EXECUTE` for `anon`, `authenticated`, `service_role` **and PUBLIC** (the built-in default, because `supabase_admin` has no global function row).

Step 4 therefore **tries** these four statements, each in its own exception block, so a refusal (SQLSTATE 42501) is a `NOTICE` and the migration still commits (it never
loosens anything; if allowed it only revokes). The global one is required because a schema-level `REVOKE ... FROM PUBLIC` does not remove the built-in PUBLIC execute default
(Themis N40-01: with only the schema-level statements a function created afterwards by `supabase_admin` was still executable by anon/authenticated):
```sql
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;   -- global: removes the built-in PUBLIC default
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
```
**Result on the local CLI stack** (role `postgres`, not a superuser, not a member of `supabase_admin`): all four are refused with the exact text
`ERROR:  permission denied to change default privileges`; inside the migration this appears as `NOTICE:  supabase_admin default ACLs NOT changed (permission denied to change default privileges): ALTER DEFAULT ...`.
**Hosted (dev/prod) is not yet tried**: after applying, read the migration output for those NOTICEs and the `supabase_admin` rows of `privcheck6.sql`
(sections `default_acl`, `default_acl_global_f`); report the exact text (PG15 would say `must be member of role "supabase_admin"`, same SQLSTATE).
The fallback if refused is Supabase support, or the controls below.

### What actually controls the remaining risk (and its limits)
- **There is no hosted CI control for it.** pgTAP `0029` and `0031` only inspect the database under test (CI / local `supabase db reset`), where nothing is ever created by `supabase_admin`
  in `public`. They never see dev or prod. On hosted, the only controls are (1) the conventions below and (2) the **manual, read-only** `privcheck6.sql` run (sections `owner_not_postgres`, `default_acl_global_f`, `postapply` C1/C2/D) before and after every
  migration and as a routine on dev and prod. A row in `owner_not_postgres` means objects were created with the permissive `supabase_admin` defaults: investigate and close them with an explicit `REVOKE`.
- **How objects end up owned by `supabase_admin`.** We do not know for certain. The dashboard SQL editor **probably runs as `postgres`** (inferred from Supabase's documentation, **unverified**: run `select current_user;` once in the
  dashboard SQL editor on dev and record the answer here). What is *reproduced*: a trusted `CREATE EXTENSION` run by the non-superuser `postgres` creates the extension's objects **owned by the bootstrap superuser `supabase_admin`**, so they get its
  permissive defaults. In Themis's repro, `CREATE EXTENSION citext WITH SCHEMA public` created **47 `supabase_admin`-owned functions that `anon` can execute**, and pgTAP `0031` #1 failed on them.
- **Install extensions only `WITH SCHEMA extensions`** (`CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;`), never into `public`. `public` is the REST-exposed schema; `extensions` is not.
  If an extension must live in `public`, its migration must revoke EXECUTE on every function it created from PUBLIC, anon and authenticated, and the allowlist in `0031` must stay unchanged.
- **Ownership checks (read-only; part of the routine and the PR template).** Run on dev and prod: `privcheck6.sql` and check that `owner_not_postgres` has **no rows**, that `postapply` C1 and C2 are `0`, D is `0`, and that
  `default_acl_global_f` shows `postgres` closed. For a hand check:
  ```sql
  select p.oid::regprocedure, pg_get_userbyid(p.proowner) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proowner <> 'postgres'::regrole;
  select c.oid::regclass, c.relkind, pg_get_userbyid(c.relowner) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','S','v','m','f') and c.relowner <> 'postgres'::regrole;
  ```

## Conventions (also in `.github/pull_request_template.md`)
1. Every new function (including trigger functions and helpers): `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;` and then `GRANT EXECUTE` only to
   what is needed (`authenticated` for member RPCs, `service_role` for Edge Functions). Never rely on defaults. Since this migration a new function created by `postgres` is owner-only until granted (see "Side effect" above).
2. A function that must be callable from the client (any role below `service_role`) goes on the allowlist in pgTAP `0031` in the same PR, with a justification **and its security mode, owner and pinned `search_path`** (`0031` fails if an allowlisted function is switched to `SECURITY INVOKER`, changes owner or loses/changes its `search_path`). Aggregates and window functions are covered too.
3. New sequences: no grants to anon/authenticated; definer functions use them as the owner. Do not give `service_role` sequence privileges for tables it cannot INSERT into.
4. **Create schema objects only through migrations** (run as `postgres`). Do not create objects by hand in the dashboard SQL editor: whichever role it runs as, nothing there is reviewed or tested. **Install extensions only `WITH SCHEMA extensions`**, never into `public`.
5. Migrations that take locks carry their own `BEGIN; SET LOCAL lock_timeout = '5s'; ... COMMIT;`.
6. Dev/prod routine and every PR that touches grants or creates objects: run the read-only ownership checks from `privcheck6.sql` (above) and confirm no object in `public` is owned by anyone but `postgres`.

## Test evidence (pgTAP `0031`)
`supabase test db` after the migration: 29 files, 1350 tests, all pass (`0031` has 37 assertions: allowlist incl. aggregates/window functions and pinned security mode/owner/`search_path`, sequences incl. `service_role`, default ACLs, new-object probes and negative proofs).
On the **pre-migration** state (migration `...000100` removed) `0031` fails 17 assertions: the root causes are #1, 4, 7, 8, 9, 11, 13, 14, 16, 17, 27; the rest (20, 26, 30, 32, 35, 37) are "clean again" cascades from the dirty baseline, so a failing list always contains cascade noise (earlier PR text quoted a smaller set, which depends on the local default ACLs).
`0031` cannot see a global PUBLIC re-grant through its default-ACL detector (PostgreSQL deletes the row when it equals the built-in default); the behavioural probes (#13, #14, #16) catch it.

## Apply and verify (dev first, then prod, after Themis's review)
1. Run `docs/operations/privcheck6.sql` and save the output ("before").
2. Apply with `supabase db push` (or `psql -1 -f`); quiet window.
3. Run `privcheck6.sql` again ("after"). Expected: section `fn_api_exec` lists only the allowlisted RPCs from pgTAP `0031` (20 rows: `record_quiz_event` anon+authenticated,
   19 authenticated-only); `seq_api` has no rows; `default_acl` shows `postgres in all schemas objtype=f | no API-role entries`, `postgres in public` `S` and `f`
   with `service_role` only and `r` with no API-role entries; `default_acl_global_f` shows `postgres` closed (and `supabase_admin` = `NO global f row` if step 4 was refused); `owner_not_postgres` has no rows; `postapply` A-G match their expected values.
   `supabase_admin` default rows stay permissive if step 4 was refused (see above).
4. Also run `privcheck4.sql` (`default_acl` section now has one more row, `postgres in all schemas objtype=f`).
5. Smoke test as a signed-in member: swipe, send a message, register a push token, open the quiz anonymously (`record_quiz_event` as anon).

## Rollback (reopens the hole; forward-fix preferred)
Tested on a post-migration copy (default ACLs and all function/relation ACLs return to the pre-state; only ACL element order differs). Run as `postgres`:
```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;   -- deletes the global row = PostgreSQL built-in default
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.funnel_events_id_seq, public.postback_outbox_id_seq TO anon, authenticated;
GRANT UPDATE, USAGE ON SEQUENCE public.funnel_events_id_seq, public.postback_outbox_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_max_profile_photos(), public.enforce_profile_birth_date_18_plus(),
  public.enforce_profile_column_locks(), public.set_row_updated_at() TO authenticated;
COMMIT;
```
If step 4 was **permitted** (no NOTICE appeared), its reversal is separate and must run as `supabase_admin` or a superuser:
```sql
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin GRANT EXECUTE ON FUNCTIONS TO PUBLIC;   -- restores the built-in default
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
```
The same text is in the migration header.
