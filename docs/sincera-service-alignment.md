# Sincera service alignment — 26 October 2026

## Authorized delivery envelope

Owner request: verify that Sincera Web in Bubble is aligned with its Supabase, Vercel and GitHub resources.

- Bubble: `sincera`, Main (`test`). Starter reports `maxBranches: 0`; Live requires a separate release.
- GitHub: `besfeng23/humbble`, base `6299871c824877b27f499f7bde98da90a6705a08`.
- Vercel: `mbanatao/humbble`, project `prj_8NkqrKpDRpt4KXETr7j4JWERqt4g`.
- Supabase: `bthfgwxgusizfjtmcacc`, organization managed by the existing Vercel Marketplace integration.

Acceptance: initialize a real read-only Bubble health call to the verified Vercel bridge; recover five applied identity-link migrations without modifying the hosted database; document the exact bindings and remaining activation gates; run exact-source checks and submit a reviewable PR.

No account linking, migration, billing activation, credential creation, production database mutation or release is included. Existing Bubble sessions and member records remain authoritative for the Bubble app until an approved, verified cutover.

Rollback: remove the additive API collection using transaction undo or the pre-change Bubble savepoint; abandon/revert this source branch. The hosted database remains read-only.

## Initial verified evidence

- GitHub main and Vercel production deployment `dpl_93fPBma9VySPFKqGtobQERYaL2TN` both use the base SHA above.
- Public `GET https://humbble-alpha.vercel.app/api/sincera/health`: 200, `{ "status": "ok", "service": "sincera-supabase-bridge" }`, no-store.
- Unauthenticated `GET /api/sincera/me`: 401, private/no-store.
- Bubble Development and Live `sincera_identity_whoami` exist and reject unauthenticated GETs with 401. This supersedes the older document's claim that Live lacks the workflow; it does not prove real-member token issuance.
- Supabase profiles and private identity-link tables have RLS enabled. The identity-link RPC is executable by service_role only, not anon/authenticated.
- Five applied identity-link migrations are absent from source at the base SHA; recover their original version/name/statements verbatim.
- Existing bridge and linking Node tests: 20 passed.
- Vercel environment metadata includes public Supabase configuration but no server-only link key or Bubble whoami URL. Linking is not configured.
- Bubble uses Stripe connector calls while the repository includes PayPal sandbox billing. Do not treat them as one working subscription system.

## Evidence limitations

Pandora Memory search and canonical-context retrieval returned internal errors. GitHub Issues is disabled, so this branch document records the delivery envelope. Vercel connector deployment fetch was denied by its protection-bypass permission; public GET checks succeeded separately.

Automatic approval review rejected a proposed live identity-linking POST because it could mutate account associations. It was not retried; linking behavior is covered by local tests only. No credential values, member records or bearer tokens belong in this document.

## Completed connection and recovery

Bubble Main/test now contains collection `bTGgC` (Sincera — Vercel Secure Backend),
call `bTGgD` (Bridge health, public read-only). Bubble initialized it through a
real GET to the verified Vercel alias and learned `status` and `service`.
The complete issue check returned zero issues, zero skipped nodes and zero
failed sections. Live does not inherit this new collection until deployment.

Pre-change Bubble savepoint: `1793003104293`. The additive collection and call
can be undone independently. No member authentication token or privileged key
was supplied to Bubble.

The five applied migration versions `20261025170258`, `20261025170924`,
`20261025171922`, `20261025171953`, and `20261025172633` are recovered with their
original names and statements. Their normalized source bytes match the hosted
migration-record hashes. See the
[recovery manifest](evidence/sincera-identity-migration-recovery-20261026.json).
This is source recovery; the migrations were not reapplied to the hosted project.
The public RPC's TypeScript signature is included, with 26 local/CI pgTAP
assertions for privileges, ownership, replay, conflicts, proof fields and revocation.

## Current authority and endpoint contract

| Layer | Verified resource and responsibility | Current proof |
| --- | --- | --- |
| Bubble Web | `sincera`, existing Bubble member sessions and dating records | Dashboard sign-in and code readback; Main health call initialized |
| GitHub | `besfeng23/humbble`, versioned Vercel backend and Supabase schema | Base main SHA matches production |
| Vercel | `mbanatao/humbble`, `https://humbble-alpha.vercel.app` | `/api/sincera/health` 200; anonymous `/api/sincera/me` 401 |
| Supabase | `bthfgwxgusizfjtmcacc`, existing backend and private mapping capability | Hosted catalog readback; zero identity links and zero identity-audit records |

Health reports infrastructure reachability. It does not prove that Bubble
profiles, matches, conversations or subscriptions are synchronized with Supabase.
The member `/me` call remains absent from Bubble until its real-session contract
can be initialized and tested. The dashboard/editor logins are not member API sessions.

## Remaining hosted database drift

The following are read-only catalog observations, not inferred solely from migration names:

| Source change | Hosted readback on 2026-10-26 | Required next proof |
| --- | --- | --- |
| `20261024000130_moderation_console_rpcs.sql` | `moderation_list_queue` and `moderation_take_action` do not exist | Verified rollout of the existing moderation migration and role tests |
| `20261024000140_can_send_message_suspended_sender.sql` | `private.can_send_message(uuid,uuid)` has no `is_suspended` predicate | Verified rollout and suspended/blocked sender acceptance |
| `20261024000150_moderation_self_action_guard_all_actions.sql` | Depends on missing moderation RPCs | Apply only after the moderation migration, then verify self-action denials |
| `20261024000010_privacy_requests_revoke_direct_insert.sql` | Authenticated direct INSERT is already denied, although that version is absent from hosted history | Reconcile history before deciding whether any operation is needed |

Do not run an indiscriminate `supabase db push`: older source migration version
numbers differ from the hosted registry, and an absent history row does not prove
that its protection is absent. Plan any hosted change against the exact current
schema, dependencies and source digests.

## Remaining integration gates

1. Verify genuine Bubble member token issuance and both providers' member sessions.
2. Configure the scoped server-only link credential and exact whoami URL through
   the existing protected credential path; neither is currently configured in Vercel.
3. Run dual-member, replay, conflict, role-isolation, deletion and recovery acceptance
   before activating identity linking or moving the authoritative member database.
4. Resolve the existing Stripe-versus-PayPal billing choice and prove signed callbacks
   before subscription activation. Live Stripe callbacks now report Admin only;
   the older unauthenticated-Live claim is superseded.
5. Review the source recovery PR and any separate hosted rollout before release.

## Durable lessons

- Provider readback overrides stale rollout notes: Live whoami and Admin-only billing
  callbacks were already present, while member integration remained unconfigured.
- A documented API setup instruction is not a configured Bubble connection. Verify
  actual initialized calls and their response fields.
- Inspect schema behavior as well as migration history. Recover applied SQL into
  source and preserve original identities; do not replay blindly to fix a ledger.
- Record infrastructure health separately from member-authentication and migration proof.
