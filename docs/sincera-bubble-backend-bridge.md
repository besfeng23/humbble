# Sincera Bubble → Vercel → Supabase: read-only verification bridge

## Scope and deployment
- Environment: Humbble Vercel Preview first, no production promotion without successful tests.
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
In Sincera's development version, create a collection named "Sincera — Vercel Secure Backend".
- `Bridge health (public read-only)`: GET `<VERCEL_PREVIEW_URL>/api/sincera/health`, Use as Data; no authentication.
- `Verified member (Supabase JWT)`: GET `<VERCEL_PREVIEW_URL>/api/sincera/me`, Use as Action. Header `Authorization: Bearer <member_jwt>` supplied dynamically from the actual Supabase Auth session after migration.
- Do not set a shared/static member JWT. Do not use the Bubble administrative key or a Supabase secret key in these calls.
- Bubble API Connector calls require one editor initialization before use. An unauthenticated `/me` must return 401; initialize only with an authorized temporary Supabase member session and then clear the initialization value.

## Rollout / acceptance
1. Run `node --test scripts/ops/sincera-bridge.test.mjs`.
2. Verify Vercel Preview `/health` -> 200 if Supabase Auth is healthy; no secrets in body.
3. Verify Vercel Preview `/me` -> 401 without a token and with invalid token.
4. Verify valid Supabase member token -> 200 returning *only that member's profile*.
5. Verify different members cannot fetch one another's profiles, messages, photos or billing info; confirm RLS denies cross-account access before adding new endpoints.
6. Preserve Bubble's existing block/unmatch privacy behaviour and match/message data. Plan and verify one-way migration; no dual-auth production rollout.
7. Do not deploy payment or affiliate endpoints until signature verification, idempotency, and approval are independently tested.
