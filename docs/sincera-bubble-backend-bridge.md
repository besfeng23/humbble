# Sincera Bubble → Vercel → Supabase: read-only verification bridge

## Scope and deployment
- Verified infrastructure binding (2026-10-26): Bubble `sincera` Main/test ->
  `https://humbble-alpha.vercel.app` -> Supabase `bthfgwxgusizfjtmcacc`.
  This is an initialized read-only infrastructure connection, not member-data sync.
- Supabase project: `bthfgwxgusizfjtmcacc` (Mbanatao).
- API: `GET /api/sincera/health` (public, intentionally returns no private data).
- API: `GET /api/sincera/me` (requires the requesting member's **Supabase** access token).
- No new member, match, or message records are created. No paid entitlements are issued.
- Do not reuse the Bubble admin token as a member credential; rotate previously shared admin tokens.
- The Supabase publishable key is the only key needed for this first phase. No service-role key is used or required.

## Security contract
- `/me` authenticates the token against Supabase Auth `/auth/v1/user`; it does not accept arbitrary user IDs.
- `/me` queries the verified member's own profile with **that member's token** so database RLS applies.
- It discloses only display_name and verification_status for the verified session.
- It never uses an admin/service-role key, never reads messages, and fails closed on upstream errors.
- Sensitive responses are no-store; client-side cross-origin access is not enabled.
- Do not move Bubble auth, user accounts, blocks, private messages or payments until an approved account identity mapping and RLS acceptance tests exist.

## Bubble API Connector
Sincera Main/test now contains "Sincera — Vercel Secure Backend" with an
initialized `Bridge health (public read-only)` data call. Bubble made a real GET
to `https://humbble-alpha.vercel.app/api/sincera/health` and learned the `status`
and `service` response fields. No authentication or shared headers are configured.

The member call is **not configured in Bubble** because real Supabase member
sessions and the account-link/cutover gates have not been verified.
- Required future call: `Verified member (Supabase JWT)`, GET `https://humbble-alpha.vercel.app/api/sincera/me`, Use as Action. Header `Authorization: Bearer <member_jwt>` supplied dynamically from the actual Supabase Auth session after migration.
- Do not set a shared/static member JWT. Do not use the Bubble administrative key or a Supabase secret key in these calls.
- The health call is initialized; Bubble's complete issue check returned zero issues.
  The member call still requires authorized real-session initialization. An
  unauthenticated `/me` returned 401 during the 2026-10-26 check.

See [service alignment evidence and remaining gates](sincera-service-alignment.md).

## Rollout / acceptance
1. Run `node --test scripts/ops/sincera-bridge.test.mjs`.
2. Verify Vercel Preview `/health` -> 200 if Supabase Auth is healthy; no secrets in body.
3. Verify Vercel Preview `/me` -> 401 without a token and with invalid token.
4. Verify valid Supabase member token -> 200 returning *only that member's profile*.
5. Verify different members cannot fetch one another's profiles, messages, photos or billing info; confirm RLS denies cross-account access before adding new endpoints.
6. Preserve Bubble's existing block/unmatch privacy behaviour and match/message data. Plan and verify one-way migration; no dual-auth production rollout.
7. Do not deploy payment or affiliate endpoints until signature verification, idempotency, and approval are independently tested.
