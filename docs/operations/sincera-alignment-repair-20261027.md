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

## Preflight result

The hosted transaction passed all 29 existing pgTAP assertions, including active
sender success, suspended/blocked denial, no new message or push job on denial,
unrelated-member behavior, replay idempotency, and restored sending after lifting
the suspension. The transaction rolled back. Post-rollback checks confirmed no
fixture accounts or pgTAP installation remained, and the original function MD5
was restored (`fab88d3d78f14c7d692ba0baeeac2694`). This proves the proposed
guard works on the hosted schema; the production guard is still unchanged.

The migration SHA256 is
`8d71e564b5cf7dfe6b72dfc6895e2bccf48bbb6c9cdb264915138912fea6e64e`.
The executed preflight SQL is retained with the evidence, including its exact
precondition, rollback, and cleanup checks. The 20 existing bridge/link Node
tests also passed on the PR #54 source.

## Remaining concrete gates

- Server-side identity-link settings are absent. Do not install a privileged
  credential or activate linking before the existing member-session, deletion,
  retention and two-user acceptance gates are met.
- Bubble uses Stripe; the repository's billing implementation is PayPal sandbox.
  A single approved billing authority and verified callback path are required
  before payment activation. No provider was selected or activated here.
- The Supabase organization is Free. Official documentation limits native
  leaked-password protection to Pro and above. No paid upgrade was initiated.
- A fresh Gemini review was attempted through its existing Vault-backed broker.
  The provider returned 403: its free tier is unavailable for this project and
  billing must be enabled. No model verdict was produced and no billing changed.
- The current native Memory bridge supports real_life operations, but no active
  Sincera/Humbble project binding exists. Do not bypass project grants or write
  these operational facts into the AU namespace. The source evidence is retained
  here until an authorized project binding/write path is available.

Exact evidence and limitations are in
[the verification record](../evidence/sincera-alignment-repair-20261027.json).
