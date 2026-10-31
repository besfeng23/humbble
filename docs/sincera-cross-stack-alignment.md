# Sincera — Bubble to GitHub/Vercel/Supabase alignment

Audit and implementation baseline: 30 October 2026. This is a staged preview, **not** a production cutover.

## Canonical ownership and non-destructive boundaries

- Bubble Live app `sincera` remains the current authoritative Sincera web app at `sincera.chat`. Its account sessions, members, photos, matches, reports, messages and payment records stay in Bubble.
- `besfeng23/humbble` is an existing Expo/React Native Web application. Its Sincera-themed user interface is an independent implementation, not a Bubble source-code export.
- Vercel team `barangayoss-projects`, project `humbble` (`prj_hTEQdy39UCWEJVkToyBCyNUoh9Cy`) is already Git-linked to `besfeng23/humbble`. Build and test a GitHub branch preview before any production promotion.
- Supabase `humbble` (`bthfgwxgusizfjtmcacc`, ap-south-1) contains its own profiles, conversations, messages, matches, safety, billing and privacy tables. It is **not** Bubble's Live database.
- The existing Vercel `/api/sincera/health`, `/api/sincera/me` and `/api/sincera/link-identity` bridge is a separate, strictly gated integration; account linking is not a completed migration.

## Ported Bubble Live design

The preview landing follows the verified Bubble Live editorial baseline: deep forest green, warm gold accent, public editorial photograph disclosed as non-member imagery, `Meet someone who means it.`, and a primary `Create my free profile` action. Existing Expo navigation, consent-attribution entry point, adult-only restriction and Supabase authentication remain unchanged. The preview explicitly warns that Bubble accounts are not linked.

## Environment contracts

- Vercel **preview only** should set the public client variables `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the Humbble Supabase project.
- Separate Vercel server functions use `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`; inspect endpoint behavior because encrypted management responses do not prove those values match the intended project.
- Never place `SUPABASE_SECRET_KEY`, service-role, Bubble admin, PayPal secrets or member bearer tokens in `EXPO_PUBLIC_*`, source control or browser response bodies.
- The dual-session identity-link endpoint fails closed unless the server-only secret, allowed origin and exact Bubble whoami endpoint are verified. Do not enable linkage on Live without two real provider-authenticated test members.
- `sincera.chat` DNS must remain directed to the existing Bubble app until production acceptance, a migration decision, and a rollback plan are approved.

## Release gates

1. GitHub PR and Vercel Preview build succeed at the same reviewed commit. Confirm preview endpoint `/api/sincera/health` = 200 and `/api/sincera/me` unauthenticated = 401.
2. Supabase RLS checks and two-user negative tests prove cross-member denial for profiles, original photos, chats, bans, reports and payment records.
3. Verify the full Bubble feature inventory (31 Live pages, backend workflows, account and consent paths) against the Expo implementation; design parity alone is not functional parity.
4. Complete Bubble–Supabase identity mapping acceptance tests and user-consented migration strategy, or explicitly keep the apps independent. Do not synchronize by email alone or move passwords.
5. Fix privacy-request fulfillment, operational/legal signoffs, and any open blockers in `docs/operations/launch-blockers.md`.
6. Keep paid subscriptions and fictional/AI/human-operated chat monetization disabled until transparent labeling, safety review and payment-provider written approval. Never mix fictional characters into genuine-member discovery without disclosure.
7. Run real mobile and desktop smoke tests, verify Vercel production and DNS routing, then stage-and-promote with rollback evidence. No changes to Bubble Live or the apex domain during preview development.

## Evidence status

Verified from connected provider metadata: the named GitHub repository exists with write access, Vercel is linked to that repo, and the Supabase project is healthy with the expected schema families. Bubble Live contains a current Sincera home and pricing disclosures; no Live checkout. The Vercel preview client environment was configured separately; an end-to-end login, identity cutover, membership checkout or production deployment has **not** been certified by this document.
