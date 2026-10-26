# Sincera identity-link rollout — master specification Phase 3

Status: **implementation staged, not production activated**. Bubble still owns its
existing app-user sessions, profile records, matches and conversations. No
migration or dual-write has been enabled. Supabase is the intended authority
only after a verified cutover; do not claim it is the live source of truth yet.

## Installed non-destructive components

- Bubble Development `test` and Live backend API workflow (both read back on 2026-10-26)
  `sincera_identity_whoami`: GET, **User & admin**, privacy rules on,
  returns `bubble_user_id`, `adult_eligible`, `access_removed`,
  `email_confirmed`. It is NOT an unauthenticated or administrator-impersonation
  proof. Its bearer token must belong to the actual Bubble member.
- Supabase project `bthfgwxgusizfjtmcacc`:
  `private.bubble_identity_links`, `private.bubble_identity_link_audit`,
  and `public.sincera_activate_bubble_link(text, uuid, text)`. The function
  may be executed only by service_role, not anon or authenticated. The mapping
  table is private and has RLS on. Unique constraints disallow linking one
  Bubble ID to multiple Supabase users and vice versa.
- Vercel HTTP `POST /api/sincera/link-identity`: authenticates the two
  independent sessions with their own providers, checks verified email,
  adult confirmation and non-blocked Bubble state, and records only an opaque
  audit correlation ID. It never accepts a member ID or email as proof.

## Deployment gates

Required Vercel **server-only environment variables**, never EXPO_PUBLIC:

- `SUPABASE_SECRET_KEY`: **new** scoped secret key, `sb_secret_...`.
  Alternatively `SUPABASE_SERVICE_ROLE_KEY` supports legacy backends, but
  prefer a new secret key. Never expose either to Bubble or the browser.
- `SINCERA_BUBBLE_WHOAMI_URL`: exact provider URL:
  preview: `https://sincera.bubbleapps.io/version-test/api/1.1/wf/sincera_identity_whoami`;
  production: `https://sincera.bubbleapps.io/api/1.1/wf/sincera_identity_whoami`.
  Production fails closed if pointing at `version-test`.
- `SINCERA_ALLOWED_ORIGIN`: `https://sincera.bubbleapps.io` or the
  approved custom Sincera origin. CORS explicitly permits one origin only.
- Existing `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or existing
  Expo public publishable alternatives) must refer to this exact Supabase project.
- Rotate any formerly pasted Bubble administrative API key. **No admin token
  is needed by this endpoint.** Do not place a member bearer in source control,
  Vercel env vars, screenshots or query strings.

The API is **fail-closed (503)** without these settings. On 2026-10-26, Vercel
metadata showed no server-only link key and no `SINCERA_BUBBLE_WHOAMI_URL`.
The Bubble workflow now exists in both Development and Live, and both reject
unauthenticated GETs with 401. This supersedes the earlier Development-only
status; real-member token issuance and positive-session acceptance remain unverified.

## User linking contract

A user must separately complete *both* sign-ins; the Bubble editor session
cookie is not a Bubble API bearer token. Per Bubble's user authentication
documentation, user API bearer tokens come from an API workflow that runs
the **Log the User in** action. Avoid collecting passwords in Vercel or using
the Bubble admin token to impersonate a member.

An authorized web client can then call:

```http
POST /api/sincera/link-identity HTTP/1.1
Origin: https://sincera.bubbleapps.io
Authorization: Bearer <current_supabase_user_access_token>
X-Sincera-Bubble-Token: Bearer <current_bubble_member_api_access_token>
```

No request body or user ID is accepted. The server verifies the Supabase
access token at `/auth/v1/user` and the Bubble member bearer at the Bubble
`whoami` endpoint. The response from Bubble must include a real current
user ID, adult confirmation, confirmed email and unblocked account. It then
calls a service-role-only SQL RPC that atomically creates or verifies the
one-to-one identity mapping. Repeating the same link is idempotent; trying
to change ownership returns 409 and requires manual account recovery.

Response bodies contain only `{ "linked": true }` on success or a generic,
non-sensitive error code. No PII or bearer values are written to audit data.

## Verification already completed

- Supabase SQL transaction: accepts correct dual-proof-field fixture, denies
  missing proof, is idempotent, and rejects attempts to relink either member;
  test transaction rolled back.
- Supabase privileges: anon and authenticated cannot execute linking RPC;
  service_role can; private link/audit tables are not member-readable.
- Bubble Development issue checker: zero issues after creating whoami.
- Node unit mocks for the Vercel endpoint cover missing bearer, invalid
  origins, bad sessions, unverified email, non-adult/blocked members, ID
  format, conflict handling, idempotency-independent server response, and
  absence of bearer tokens from saved RPC payload.

## Still required before activating real linking

1. Initialize and verify **Bubble user API-token issuance** with a controlled
   two-member test. Don't mistake the normal Bubble browser cookie for an
   API token. Confirm the whoami response over a real user bearer token
   and that a Bubble admin token cannot pass as a member.
2. Verify the Supabase email-confirmation status and adult eligibility of both
   test identities; never create underage production accounts.
3. Install a **dedicated, rotated Supabase secret key** as a Vercel
   **server-only** variable. Test preview with Bubble development token.
4. Complete real-member user-session and privacy acceptance tests against the
   existing Live whoami workflow. Then configure the exact production URL.
5. Run actual dual-user end-to-end login/link, replay, conflict, and
   cross-account RLS tests, plus deletion/recovery support. Existing member
   passwords must not be copied between auth providers.
6. Resolve identity-link cleanup with the erasure worker before activation:
   the existing mapping FK uses `ON DELETE RESTRICT`, so deleting `auth.users`
   while a mapping exists will fail. The worker must apply the approved mapping
   cleanup/retention policy first; audit-row retention is separate. Neither
   cascading deletion nor a retention period is approved by this source recovery.
   See LB-1 in [launch blockers](operations/launch-blockers.md).
7. Plan a controlled one-way migration with audit and rollback before
   Supabase becomes authoritative for production profiles, messages, matches,
   payments and referrals. No mass data movement or shadow writes.

### Separate release blocker: verify one billing provider and its callbacks

Bubble Live `sincera_stripe_sync` and `sincera_stripe_renewal`
both report **Admin-only authentication** in the 2026-10-26 Live readback;
both still ignore privacy rules. This supersedes the earlier unauthenticated-Live
finding, without proving signature verification or actual webhook delivery.
Bubble's configured API Connector uses Stripe, while this repository includes
PayPal sandbox billing. Reconcile the intended billing provider and verify
signed events, entitlements, renewals and refunds before activation. Do not
change authentication or payment routing without verifying the actual sender.

See [service alignment evidence](sincera-service-alignment.md) for exact resource
bindings, recovered hosted migrations and current evidence limitations.

## Documentation

- Bubble user authentication:
  https://manual.bubble.io/help-guides/integrations/api/the-bubble-api/authentication/as-a-user
- Bubble API workflow authentication:
  https://manual.bubble.io/help-guides/integrations/api/the-bubble-api/the-workflow-api
- Supabase keys:
  https://supabase.com/docs/guides/getting-started/api-keys
