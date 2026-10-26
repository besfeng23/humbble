# Sincera alignment repair — 27 October 2026

## Authorized change envelope

Owner instruction: “Fix it then”, following the cross-provider verification.
Continue the existing alignment work in PR #54 without overwriting its source.

Exact resources:
- Bubble `sincera`, Main/test; preserve member authentication and privacy.
- GitHub `besfeng23/humbble`, current main `6299871c824877b27f499f7bde98da90a6705a08`.
- Existing PR #54 head `37009b3cf2491f7c8ea9659c5cbb4a0e150fb17f`.
- Vercel `prj_8NkqrKpDRpt4KXETr7j4JWERqt4g`, team `team_3yw1CN59ce4pj5SwyQGCAqN3`.
- Supabase `bthfgwxgusizfjtmcacc`.

Acceptance: recover exact deployment/configuration evidence using the existing
Vault-backed provider path; preflight the already-reviewed suspended-sender
guard against the hosted schema in a fully rolled-back transaction; preserve
reproducible source and evidence; identify the exact remaining activation gates.

No automatic database cutover, member identity linking, payment activation,
credential creation, or moderation-console rollout is included. Those require
their existing principal, retention, provider, and release gates. Existing
production account associations and member records must not change during tests.

## Initial provider evidence

The ordinary Vercel connector returned 404 for the resource. The existing
Vault-backed Vercel broker returned 200 for the exact project ID. It confirms
GitHub repository `besfeng23/humbble`, production branch `main`, and deployment
`dpl_93fPBma9VySPFKqGtobQERYaL2TN`, READY at the main SHA above.

Environment metadata contains only the three existing public Supabase keys
(`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) for preview and production. No values
were retrieved. Server-only linking configuration is absent.

Hosted `private.can_send_message(uuid,uuid)` lacks the suspended-sender
predicate. Source migration `20261024000140_can_send_message_suspended_sender.sql`
is already on main. Its approved change is limited to that predicate while
preserving authentication, match, block, lock, ownership, and privilege checks.

## Preflight safety and rollback

Use only fixed synthetic `example.test` fixture identities, after asserting that
their IDs do not exist. The relevant enabled triggers were inspected: none of
their function bodies contain HTTP/network calls. The test uses an explicit
transaction, short lock timeout, and final ROLLBACK. Extension installation,
function replacement, fixture identities, messages, and notification jobs must
all roll back. An assertion failure aborts the transaction and is not retried as
a live mutation. Verify the original function fingerprint and fixture absence
afterward.

Production rollout remains distinct from this preflight. The exact reviewed
source migration and test results will form the reviewable rollout candidate.
