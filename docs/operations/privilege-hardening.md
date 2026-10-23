# Privilege hardening: evidence, privacy and billing tables

Migration `20261023000060_privilege_hardening_evidence_tables.sql`, pgTAP `supabase/tests/0023_privilege_hardening_evidence_tables.test.sql`.
Follows the security review of PR #35 (N3 narrow the `payment_events` UPDATE grant, N4 and the "default privileges" gap) and applies the
`payment_events` pattern from migration `...0051` to the other evidence and entitlement tables.

## Why
Supabase default privileges give `service_role` `ALL` (including `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`) on every new `public` table.
Migrations `0003`/`0004` revoked from `PUBLIC`/`anon`/`authenticated` but left `service_role` untouched, and `0004` additionally granted `INSERT`/`UPDATE` on `subscriptions`/`entitlements` to the API roles it needed at the time (later removed). Consequences before this change: anyone holding the service-role key
could `TRUNCATE` the audit trail and consent records (row triggers do not fire for `TRUNCATE`), delete privacy requests, or write
`subscriptions`/`entitlements` directly and skip `billing_apply_readback`.

## What `service_role` can do now

| Table | service_role before | service_role after | authenticated | Extra |
|---|---|---|---|---|
| `audit_events` | ALL | `SELECT`, `INSERT` | none (unchanged) | `TRUNCATE` guard |
| `consent_records` | ALL | `SELECT`, `INSERT` | `SELECT`, `INSERT (user_id, consent_key, version, choice, source, metadata)` (unchanged) | `TRUNCATE` guard |
| `privacy_requests` | ALL | `SELECT`, `INSERT`, `UPDATE (status, completion_metadata, failure_code, completed_at, retention_until, legal_hold)` | `SELECT`, `INSERT (user_id, request_type, idempotency_key)` (unchanged) | |
| `subscriptions` | ALL | `SELECT` | `SELECT` (unchanged) | |
| `entitlements` | ALL | `SELECT` | `SELECT` (unchanged) | |
| `payment_events` | `SELECT`, `INSERT`, `UPDATE (5 cols)` | `SELECT`, `INSERT`, `UPDATE (status, provider_verified, processed_at, legal_hold)` | none (unchanged) | `TRUNCATE` guard |

`anon` and `PUBLIC` hold nothing on any of these tables. Nobody gets `DELETE`, `TRUNCATE`, `REFERENCES` or `TRIGGER` (no row-level policy is
changed: RLS and the existing guard triggers are untouched).

### Code paths that write these tables (enumerated, none loses a needed privilege)
- All writers are `SECURITY DEFINER` functions owned by `postgres`, which are unaffected by revoking from `service_role`: `billing_record_event`,
  `billing_finish_event`, `billing_flag_unresolved_event`, `billing_register_pending_subscription`, `billing_apply_readback`,
  `request_privacy_action`, `submit_report`, `block_user`, `unblock_user`, `unmatch`, `moderation_transition_case`.
- Edge Functions (`paypal-*`, `send-push`) only call those RPCs plus one `SELECT` on `subscriptions` (`billingStore.latestSubscription`).
  No Edge Function writes any of these tables directly (checked by searching `supabase/functions` for `.from(` writes).
- Clients keep exactly the previous grants; consent and privacy-request inserts remain RLS-checked.
- Account deletion: `ON DELETE SET NULL` (`audit_events.actor_id`, `consent_records`/`privacy_requests`/`payment_events`/`subscriptions` `.user_id`)
  and `ON DELETE CASCADE` (`entitlements.user_id`) are executed by PostgreSQL referential-integrity triggers under the table owner, not
  `service_role`. pgTAP `0023` section 6 and `0003` assert this still works.
- **Kept on purpose (not removed):** `INSERT` for `service_role` on `audit_events`, `consent_records`, `privacy_requests`, `payment_events`
  (append-only contract, no code needs it today but it cannot rewrite history); column `UPDATE` on `privacy_requests` (future privacy worker);
  four `payment_events` UPDATE columns, because the existing suites `0003`/`0022` exercise them as `service_role`. Only `retention_until` was provably unused
  and is removed (N3). Narrowing further (to zero) means editing `0003`/`0022` and is a follow-up.

### TRUNCATE guard (defence in depth)
Statement-level `BEFORE TRUNCATE` triggers `trg_audit_events_no_truncate`, `trg_consent_records_no_truncate`, `trg_payment_events_no_truncate`
call `private.prevent_evidence_truncate()` and raise `42501 TRUNCATE is not permitted on public.<table>`. They are `ENABLE ALWAYS`, so
`session_replication_role = replica` does not bypass them, and they stop the table owner too. Reviewed maintenance that must truncate (for
example a test-data reset on a non-production database) has to run `ALTER TABLE ... DISABLE TRIGGER trg_<table>_no_truncate` first and re-enable it
after. Note `TRUNCATE public.profiles CASCADE` is also blocked, because the guarded tables reference it; that is intended.

## Follow-up: migration `20261023000090_security_followups_themis_pr36.sql` (Themis PR #36 F-02..F-09)
pgTAP `0027` (billing), `0028` (per-table writers, `42501` as `service_role`, negative proof), `0029` (allowlist matrix + default privileges).
Same pattern (`REVOKE ALL` from every API role, narrow re-grant, `ENABLE ALWAYS` `TRUNCATE` guard) applied to more tables. `service_role` after:

| Table | service_role after | authenticated | Notes |
|---|---|---|---|
| `user_consents` (F-02) | `SELECT` | `SELECT`, `INSERT` (RLS, unchanged) | writer: `private.handle_auth_user_funnel` trigger (definer) |
| `reports` (F-03) | `SELECT`, `INSERT`, `UPDATE (status, severity)` | `SELECT` | writer: `submit_report`. `legal_hold`/`retention_until`/`reporter_id` not writable |
| `moderation_cases` (F-03) | `SELECT`, `INSERT` | `SELECT` | status changes only via `moderation_transition_case` (definer) |
| `verification_requests` (F-03) | `SELECT`, `INSERT`, `UPDATE (status, attempts, decided_at, provider_session_id)` | `SELECT` | no writer exists yet |
| `billing_plans`, `billing_markets`, `attribution_networks`, `postback_outbox` (F-02) | `SELECT` | `billing_plans` `SELECT` | changed by migrations (owner) only |
| `signup_attributions` (F-02) | `SELECT` | `INSERT` (unchanged) | writer: signup trigger |
| `funnel_events` (F-02) | `SELECT` | none | writer: `private.record_funnel_event` |
| `blocks`, `messages` (F-04) | `SELECT` | `SELECT` | writers: `block_user`/`unblock_user`, `send_message` (definer); no direct DML |
| `payment_events` (F-06) | `SELECT`, `INSERT` | none | **all** UPDATE columns removed (nothing used them; `billing_finish_event` is owner-run) |
| `privacy_requests` (F-06) | `SELECT`, `INSERT`, `UPDATE (status, completion_metadata, failure_code, completed_at)` | unchanged | `legal_hold`/`retention_until` no longer writable by the key |
| `billing_readbacks` (new, F-01) | `SELECT` | none | evidence rows written only by `billing_record_*` (definer), immutable; deletable only by `billing_purge_readbacks` (consumed rows older than 30 days) |
| `quiz_events` (PR #37) | `SELECT` | none | in the `0029` matrix; written by `record_quiz_event` (definer) |

`TRUNCATE` guards (`ENABLE ALWAYS`) now exist on: `audit_events`, `consent_records`, `payment_events`, `user_consents`, `reports`, `moderation_cases`,
`verification_requests`, `billing_readbacks`, `privacy_requests`, `subscriptions`, `entitlements`. Tables that other tables reference reject a plain `TRUNCATE`
with `0A000` before the guard runs; `TRUNCATE ... CASCADE` reaches the guard (`42501`).

**Writers found per table (no Edge Function or client code writes any of these as `service_role`; checked in `supabase/functions` and `app/`/`lib/`):**
`user_consents`: signup trigger, plus `authenticated` INSERT under RLS. `reports`: `submit_report`, seed. `moderation_cases`: `moderation_transition_case`
(UPDATE only; nothing inserts). `verification_requests`: none yet. `billing_plans`/`billing_markets`: migrations only. `attribution_networks`: seed rows in
migration `...0030`. `postback_outbox`: nothing writes yet. `signup_attributions`: signup trigger. `funnel_events`: `record_funnel_event`.
`blocks`: `block_user`/`unblock_user`. `messages`: `send_message`. `payment_events`: `billing_record_event` (INSERT) and owner-run `billing_finish_event`.

### Default privileges for future tables (F-07)
`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role`. A table created by a migration
(which runs as `postgres`) is now born with **no** API-role privileges (fail-closed): a new table needs an explicit `GRANT` in its migration, and `0029`
fails if a table outside its matrix grants more than the conservative rule allows. **Limits:** it does not cover tables created by `supabase_admin`
(Dashboard SQL editor / some extensions), whose own default ACL stays permissive, nor sequences and functions (unchanged). Create tables only through migrations.
`0029` keeps an explicit matrix of every current table x role (including the still-open `service_role ALL` on eight product tables, marked DEBT).

### Not covered / deferred (F-04)
`profiles` (legitimately updated by `service_role`: `is_suspended`, tested in `0020`), `conversations`, `conversation_participants`, `matches`, `swipes`,
`profile_photos`, `user_preferences`, `daily_swipe_quotas` still carry `service_role ALL` (DEBT rows in `0029`). `blocks`/`messages` were narrowed because every writer is a
definer RPC. Row-level immutability triggers remain origin-only (`O`) on older tables (F-11, informational). The `consent_records`, `audit_events`, `payment_events`
`INSERT` grants are kept (unused by code, cannot rewrite history).

### Expected catalog state after `...0090`
Run `docs/operations/privcheck4.sql` (single read-only `SELECT`). Expect: one `table_acl` row per table x role exactly as in the matrix in `0029` (`guard=A` on
the eleven guarded tables); six `function_acl` rows with `anon=false authenticated=false service_role=true` (the five billing RPCs plus `billing_purge_readbacks(interval)`); `old_fn` = `absent`; `default_acl` for `postgres`,
objtype `r` = `no API-role entries` (the `supabase_admin` rows stay permissive, see above). Any difference means drift.

## Verifying after deploy (read-only)
`docs/operations/privcheck2.sql` is one `SELECT` returning one row per table. Expected result:

| table_name | service_role_has | authenticated_has | anon_has | service_role_update_cols | public_acl_entries | truncate_guard_enabled |
|---|---|---|---|---|---|---|
| audit_events | INSERT,SELECT | - | - | - | 0 | 1 |
| consent_records | INSERT,SELECT | SELECT | - | - | 0 | 1 |
| entitlements | SELECT | SELECT | - | - | 0 | 0 |
| payment_events | INSERT,SELECT | - | - | - (after `...0090`; `legal_hold,processed_at,provider_verified,status` after `...0060`) | 0 | 1 |
| privacy_requests | INSERT,SELECT | SELECT | - | completed_at,completion_metadata,failure_code,status after `...0090` (adds `legal_hold,retention_until` after `...0060`) | 0 | 1 after `...0090` |
| subscriptions | SELECT | SELECT | - | - | 0 | 0 |

Anything else (a `DELETE`, `TRUNCATE`, `UPDATE`, `REFERENCES` or `TRIGGER` entry, `public_acl_entries > 0`) means a later migration or manual
`GRANT` undid the hardening. `authenticated` also holds column-level `INSERT` on `consent_records` and `privacy_requests`; that is intended.
This was not run against the hosted project: the real default ACLs there are unverified until you run it.

## Tests
`0023` runs as `service_role` (`SET LOCAL ROLE`) and asserts `42501` with the message `permission denied for table <t>` (so the pre-existing guard
triggers cannot satisfy it) for `DELETE`, `TRUNCATE` and forbidden `UPDATE` on all six tables, and forbidden `INSERT` on `subscriptions`/`entitlements`.
It also asserts the legitimate paths (billing RPC chain, privacy and consent flows as `authenticated`, `block_user`/`submit_report` audit writes,
direct `service_role` reads/appends, account deletion) and the catalog (including no `PUBLIC` ACL entries). Mutation check: granting `ALL` back to
`service_role` (and disabling the guard) makes 47 of its 101 assertions fail.

## Rollback
Prefer a forward fix. Never delete or truncate audit, consent or ledger rows to "roll back".
1. If a reviewed operation is blocked by the guard: `DROP TRIGGER IF EXISTS trg_<table>_no_truncate ON public.<table>;` (and, if retiring it,
   `DROP FUNCTION IF EXISTS private.prevent_evidence_truncate();`).
2. If a legitimate workload proves it needs a privilege, grant only that, e.g. `GRANT INSERT, UPDATE ON public.entitlements TO service_role;`
   (this widens the billing trust boundary and needs review) or `GRANT UPDATE (retention_until) ON public.payment_events TO service_role;`.
3. Then update `0023` and this page, so the catalog check and tests stay the source of truth.
Client (`authenticated`/`anon`) grants are unchanged, so no client-side rollback exists or is needed. The migration changes no data.

## Not covered
(Superseded by the follow-up section above for `reports`/`moderation_cases`.) `privacy_requests` UPDATE and the four append-only
`INSERT` grants are kept by design; the hosted project's default ACLs and any ad-hoc grants made outside migrations are not verified by this change.
