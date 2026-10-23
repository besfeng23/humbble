## Summary

## Security checklist (database changes)
- [ ] Every NEW function revokes EXECUTE from `PUBLIC, anon, authenticated` and then grants only what is needed (member RPCs: `authenticated`; Edge Functions: `service_role`).
- [ ] A function callable by `anon`/`authenticated` is added to the allowlist in `supabase/tests/0031_public_function_exposure_allowlist.test.sql` with a justification.
- [ ] New public tables: explicit GRANTs, a row in the privilege matrix test (`0029`), RLS enabled. New sequences: no grants to anon/authenticated.
- [ ] pgTAP files use a free prefix (check `ls supabase/tests` on current main) and the migration number is not taken by another open PR.
- [ ] Migrations that take locks are `BEGIN; SET LOCAL lock_timeout = '5s'; ... COMMIT;` and idempotent.
- [ ] **No schema objects were created from the dashboard SQL editor** (they get permissive `supabase_admin` default ACLs). Migrations only.
- [ ] No secrets, tokens or keys in the diff, logs or PR text.

## Tests
- [ ] `supabase db reset && supabase test db`, `scripts/db/lint.sh`, `npm run lint`, `npm run typecheck`, `npm test`

## Rollout / risk
