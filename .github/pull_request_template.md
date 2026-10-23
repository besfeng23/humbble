## Summary

## Security checklist (database changes)
- [ ] Every NEW function revokes EXECUTE from `PUBLIC, anon, authenticated` and then grants only what is needed (member RPCs: `authenticated`; Edge Functions: `service_role`).
- [ ] A function callable by `anon`/`authenticated` is added to the allowlist in `supabase/tests/0031_public_function_exposure_allowlist.test.sql` with a justification, its `SECURITY DEFINER`/`INVOKER` mode, owner and pinned `search_path`.
- [ ] New public tables: explicit GRANTs, a row in the privilege matrix test (`0029`), RLS enabled. New sequences: no grants to anon/authenticated.
- [ ] pgTAP files use a free prefix (check `ls supabase/tests` on current main) and the migration number is not taken by another open PR.
- [ ] Migrations that take locks are `BEGIN; SET LOCAL lock_timeout = '5s'; ... COMMIT;` and idempotent.
- [ ] **No schema objects were created by hand in the dashboard SQL editor**; migrations only. Extensions are installed `WITH SCHEMA extensions`, never into `public`.
- [ ] Ownership checks (dev/prod, read-only; `docs/operations/privcheck6.sql`): section `owner_not_postgres` has no rows, `postapply` C1/C2/D are `0`; no object in `public` is owned by `supabase_admin` (its default ACLs are permissive and are NOT closed on hosted, see `docs/operations/default-acl-hardening.md`).
- [ ] A new helper function created by `postgres` in `private`/`extensions` has an explicit `GRANT EXECUTE` where members/Edge Functions call it (the global default revoke makes it owner-only).
- [ ] No secrets, tokens or keys in the diff, logs or PR text.

## Tests
- [ ] `supabase db reset && supabase test db`, `scripts/db/lint.sh`, `npm run lint`, `npm run typecheck`, `npm test`

## Rollout / risk
