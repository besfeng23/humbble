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
