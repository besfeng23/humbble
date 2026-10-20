# Humbble Premium — Execution-Ready Build Plan v1.2

**Status:** Approved planning defaults; execution authorization remains separate  
**Plan date:** 20 October 2026  
**Canonical repository:** `besfeng23/humbble`, branch `main`  
**Starting reference:** `e5bff440a7f0f2f7a11a89f8b01b2985b6990c59`  
**Primary launch market:** Philippines only  
**Payment mode:** PayPal Sandbox only  
**Provisional operating ceiling:** ₱10,000/month; not authorization to spend  
**Delivery estimate:** 18.5 weeks is an initial planning estimate, not a deadline or guarantee.

---


> **v1.2 status:** v1.1 with the five fixes from the Antigravity read-only review (`antigravity-review.md`, base `e5bff440`) folded in. Edited by Grok Bot (not by Antigravity) on 2026-10-20 at Mark Johnson's direction. Where §V1.2 below conflicts with any later section, **§V1.2 prevails**; owner-decisions.md still prevails over both.

## V1.2 Binding amendments

### A1. RLS, column locks and SELECT coverage (P2-04, P2-05)
- `public.profiles`: revoke table-wide `UPDATE` from `authenticated`; grant column-level `UPDATE` only on user-editable fields (`display_name, city_region, occupation, education_level, languages_spoken, shared_interests, relationship_intention, prompts, is_incognito`). Add a `BEFORE UPDATE` trigger that rejects client changes to `birth_date, verification_status, is_discoverable, is_suspended` (server/service role only).
- Add explicit, tested `SELECT` policies for `conversations, blocks, swipes, daily_swipe_quotas, verification_requests, reports, consent_records, privacy_requests` (participant/owner-scoped; reports visible to reporter + T&S role only). `messages_select_participant` must depend on a working `conversations` policy.
- `birth_date` is never readable by other users: no direct cross-user `SELECT` on `profiles`; other users see a safe projection (age bucket/age, no DOB) via `get_discovery_feed` RPC or a `security_invoker` safe view.
- `record_swipe` must verify the **actor** is `verification_status='verified' AND is_discoverable AND NOT is_suspended` (and 18+) before inserting; same checks on the target.
- pgTAP tests required for each item above (privilege-escalation attempts must fail).

### A2. Verification states and no raw selfie storage (P2-01, P2-04, P3-02)
- Enum `verification_state` = `('not_started','pending','verified','failed','requires_review')`; default `not_started`.
- `verification_requests` stores only `provider TEXT, provider_session_id TEXT, status verification_state, attempts INT, created_at, decided_at` — **no** `artifact_storage_path`, `artifact_purge_after`, selfie image, or biometric template.
- No client upload Storage policy for verification artifacts (remove `storage_verif_insert_own`). Liveness/age checks run at the provider; only the outcome is persisted. 18+ gate enforced in UI **and** DB (check constraint/trigger on `birth_date`).

### A3. Phase 0 order and scope
- Sequence: **P0-01 → P0-02 → P0-03 / P0-04 → P0-05 → P1-01 / P1-02 → P2-01 … P2-06.** P0-02 runs before any further branches are cut.
- P0-02 scope: add `.env*` (except `.env.example`), `*.keystore`, `*.jks`, `*.p8`, `*.p12`, `*.pem`, `google-services.json`, `GoogleService-Info.plist` to `.gitignore`; remove `android/app/debug.keystore` from the tree; release builds must not use debug signing — use env/Gradle-property release signing that fails closed if absent. History rewrite is an owner decision (report-only in P0-02) and must be decided before parallel branches multiply.
- P0-04 scope: `.env.example` already exists — update rather than create; fix the un-removed `AppState.addEventListener` subscription in `lib/supabase.ts`; remove or guard the root route `app/charscreenf.tsx`.

### A4. Route map and CI (P1-01, P2-01, P2-06)
- Actual routes at `e5bff440`: `app/(tabs)/people.tsx` = swipe deck (`PeopleCard`); `app/(tabs)/index.tsx` = "Liked You"; `app/(tabs)/discover.tsx` = categorized horizontal lists; `app/(tabs)/(chats)/_layout.tsx` references `chatscreen` while the file is `chatScreen.tsx` (casing bug to fix). P1-01 matrix must map from these.
- The local Supabase CLI + pgTAP GitHub Actions job moves from P2-06 into **P2-01**, so migrations 0001–0004 are tested on every PR from the first migration. P2-06 keeps type generation and drift checks.

### A5. Billing, budget and backups (P4-01, P4-02, P5-04, §7)
- PayPal **Sandbox only** until separate live approval. Exactly two monthly plans, priced **server-side only** by market: `PH → PHP 599.00/month`, `US → USD 29.99/month`. They are separate prices, never FX-converted. Non-PH markets disabled at the PH-only initial launch. **No ~~`reserve_3m`~~ (removed in v1.2) / ~~`reserve_6m`~~ (removed in v1.2) or other multi-month plans.**
- Client never sends price/currency; `create-subscription` resolves plan by server-side market.
- Webhooks (`PAYMENT.SALE.COMPLETED`, subscription events) are verified cryptographically and reconciled only if **plan id, currency and amount exactly match** the server catalogue; mismatches go to quarantine + alert, never grant entitlement.
- Pilot backups: **no PITR** (US$100/mo breaches the ₱10,000/month ceiling). Use scheduled logical backups (`pg_dump` + Storage sync to encrypted object storage) with documented pilot RPO ≤ 24h (target 6h) and RTO, and an executed restore drill before the first Sandbox-to-live decision. PITR revisited in Phase 7 with owner approval.
- The US$412/mo low-pilot scenario is superseded; pilot infra must be budgeted under ₱10,000/month (≈US$172) including any verification vendor per-check cost.

### A6. Revised estimates
- **T-014** (Block/Report UI, RBAC middleware, SCR-23/SCR-24 T&S console with audit logging): 6.0 → **11 person-days** (range 10–12).
- **Phase 6 pilot**: calendar **6–8 weeks** (synthetic → ~100 invite cohort → fix → staged expansion), not 2–4; legal review (`GATE-LEGAL-01`) turnaround runs in parallel and may extend it. Total programme effort ≈ 219 person-days; calendar end ≈ week 22–24.

## V1.2 Changelog
| Version | Date | Author | Change |
|---|---|---|---|
| 1.2 | 2026-10-20 | Grok Bot (edit), from Antigravity review | A1 RLS column locks, missing SELECT policies, DOB hidden, `record_swipe` actor eligibility |
| 1.2 | 2026-10-20 | Grok Bot | A2 five verification states; no raw selfie/biometric storage; removed verification upload policy |
| 1.2 | 2026-10-20 | Grok Bot | A3 Phase 0 reordered P0-01 → P0-02 → P0-03/P0-04 → P0-05; P0-02/P0-04 scope corrected |
| 1.2 | 2026-10-20 | Grok Bot | A4 route map corrected to repo; pgTAP CI moved into P2-01 |
| 1.2 | 2026-10-20 | Grok Bot | A5 PH ₱599 / US$29.99 server-side only; no 3/6-month plans; webhook amount/currency checks; logical backups instead of PITR |
| 1.2 | 2026-10-20 | Grok Bot | A6 T-014 → 11 pd; pilot 6–8 calendar weeks |
| 1.1 | — | Owner | Baseline execution plan |


## 0. Execution principles and verified baseline

### 0.1 Governing principles

1. Preserve the existing Expo/React Native application, its visual direction, and the Supabase Auth work. Refactor in place; do not replace the app with a new starter or recreate the UI from the old ZIP inventory.
2. Build from the actual canonical `main` tree and confirm its current HEAD before the first code PR. Use the supplied commit as the audit baseline if `main` has advanced; document the diff and rebase the plan, not the codebase, silently.
3. Keep every change on a focused feature branch with a small, reviewable pull request (PR). The coding agent may implement and test in isolated development contexts; it may not approve its own changes, bypass required checks, write directly to protected `main`, apply production migrations, enable live billing, or promote a production release without the required human approvals.
4. Use synthetic accounts and synthetic content until legal, privacy, operational, and safety prerequisites are met. No real users or production data in local/dev tests.
5. Distinguish: **verified repo facts**, **owner-approved planning constraints**, **implementation proposals**, and **external approvals still pending**. Store material architecture decisions in `docs/adr/` and link each PR to its ADR or requirement IDs.
6. No paid-resource creation, subscription upgrade, paid add-on, provider commitment, vendor contract, or spend above the approved boundary without itemized current pricing and explicit owner approval.
7. Keep the service fail-closed: missing provider configuration, unverified identity, unknown subscription state, failed webhook verification, authorization uncertainty, or unavailable moderation policy must never grant discovery eligibility or premium access.

### 0.2 Verified current baseline

- GitHub repository metadata confirms `besfeng23/humbble`, default branch `main`, public visibility. The specified starting commit is `e5bff440a7f0f2f7a11a89f8b01b2985b6990c59` (merge of the Supabase Auth change).
- Vercel has a project named `humbble`; the latest deployment visible to the connected Vercel account is **READY**, target `production`, built from that same commit SHA. Vercel metadata also reports `live: false` and SSO protection enabled for all deployments except custom domains. Before any cohort is invited, confirm the intended canonical URL, custom-domain protection, authentication redirects, and that access controls are intentional.
- `package.json` shows Expo SDK `~52.0.41`, React Native `0.76.7`, React `18.3.1`, and `@supabase/supabase-js` `2.118.0`. Scripts include `start`, `android`, `prebuild`, `ios`, `web`, `test` (`jest --watchAll`), and `lint` (`expo lint`). The test script is not suitable as-is for unattended CI.
- `lib/supabase.ts` and `lib/AuthProvider.tsx` implement Supabase client/session management, and the sign-in/sign-up screens call Supabase Auth. Keep and harden this foundation.
- The current Supabase client falls back to a placeholder project URL/key when environment variables are absent. Replace this with safe, explicit unconfigured behavior; a missing configuration must not silently instantiate a client pointed at placeholder credentials.
- `app/(tabs)/discover.tsx` still imports sample profile data from `DB/userDB` and renders mock profiles. These records must not be treated as real server-backed discovery.
- The sign-in UI currently tells users password reset is unavailable, and Google/Facebook controls are placeholders. Do not expose dead controls as working functionality. Add a real password recovery and callback flow; leave OAuth hidden or disabled until configured and tested.
- `app.json` still sets iOS/Android identifiers to `com.anonymous.humbble`. Production identity, URL scheme, EAS build profiles, and signing configuration are not complete.
- `supabase/config.toml` and `.github/workflows/ci.yml` were not found at the supplied reference. The initial repository audit must check the full tree and Git history before concluding there are no other migrations, workflows, or tracked signing artifacts.
- No dedicated Humbble Supabase project reference has been verified. Do not use either Pandora's Box or Pandora's Box Memory projects.

**Baseline audit deliverable:** `docs/implementation/baseline-audit.md` with exact current HEAD, tree inventory, route/component map, existing behavior, missing behavior, secret/signing-artifact scan results, deployment URLs/protection checks, dependency risks, and references to owner decisions. Findings must cite inspected paths/commands and avoid restating old ZIP assumptions as current facts.

---

## 1. Architecture and service boundaries

### 1.1 Target architecture

- **Client:** existing Expo Router / React Native app; shared responsive web/mobile components; Supabase Auth client using environment-provided URL and publishable/anon key only.
- **Primary data authority:** Supabase PostgreSQL with RLS, constraints, indexed queries, server-side RPCs for transactional invariants, and Realtime only for authorized conversation participants.
- **Media:** Supabase Storage buckets with per-user object paths, MIME/size restrictions, RLS and signed URLs as appropriate. Verification evidence must not be retained by default.
- **Trusted server boundary:** Vercel server routes/functions (or a Supabase Edge Function where that is the simpler verified runtime) only for operations needing private provider secrets or privileged workflows: PayPal REST/webhooks, account deletion orchestration, provider callbacks, and approved scheduled reconciliation. Record an ADR before selecting the final location for a function; do not duplicate the same privileged operation across Vercel and Edge Functions.
- **Billing provider:** PayPal Subscriptions Sandbox for development and staging. Live credentials are absent from all client builds and remain disabled until owner approval.
- **Verification provider:** provider-independent interface and test adapter first. A production adapter and evidence retention policy require vendor, legal, privacy and security approval.
- **Analytics:** PII-minimized pseudonymous PostHog integration, after consent/notice decisions. No message text, raw DOB, identity artifacts, exact GPS, email, names, or payment payloads in analytics.
- **Source of truth:** GitHub PR history, migration files, ADRs, automated test evidence, signed approvals, and release records. External orchestrator/memory systems may mirror state but do not override repository evidence.

### 1.2 Non-negotiable invariants

1. A user is at least 18 to register; discovery and messaging additionally require the specified profile-completion and approved verification gates. User-entered DOB is not proof of independently verified age.
2. Users only read or modify records permitted by their identity and role. The backend, not UI state, decides discovery eligibility, blocks, matches, quotas, subscription status, and premium entitlements.
3. A mutual match is created at most once for a canonical ordered user pair. Blocking terminates the connection and prevents future discovery, swipes and messages in both directions.
4. Matched users can send text messages for free. No paywall may lock basic mutual messaging.
5. Free like quotas are enforced atomically (baseline proposed limit: 15 likes per user-local business date until product/legal approval confirms final treatment). Premium quota bypass is decided server-side from current entitlement state.
6. No premium entitlement from browser redirects, client claims, a subscription `ACTIVE` label by itself, unverified webhook data, or a replayed event. Payment events are verified and idempotently reconciled.
7. No production verification success can be simulated by a client flag or fake adapter.
8. Account deletion revokes access promptly, removes profile/media and other data according to the approved retention schedule, and preserves only minimum records legally required for financial, safety or audit obligations.

---

## 2. Phases, milestones, and dependencies

The original v1.1 estimate is 214 person-days over 18.5 weeks (initially described for a 3.5-FTE human team). Its phase-level reference allocation is Phase 0: 12 days; Phase 1: 22; Phase 2: 34; Phase 3: 54; Phase 4: 24; Phase 5: 20; Phase 6: 24; Phase 7: 24. These are reference effort values only, not AI-agent days or guaranteed elapsed time. External approvals, review latency, provider setup, physical-device validation and safety staffing remain calendar dependencies. Re-estimate after Phase 0 baseline audit and after the first two merged PRs.

| Phase | Target window (planning only) | Milestone / output | Depends on | Exit gate |
|---|---|---|---|---|
| 0 | Weeks 1–1.5 | Evidence baseline, repo hygiene, environment contract, security/CI bootstrap, legal review packet | Owner decisions (received); repo access | Audit is reproducible; no known committed live secrets; required checks protect PRs; no spending assumed. Legal packet prepared; counsel approval is still an external gate. |
| 1 | Weeks 1.5–3.5 | Product/screen traceability, design tokens, accessible reusable UI primitives and navigation | Phase 0 inventory; existing UI/design preservation | 24-screen inventory mapped to real routes or explicit deferred state; responsive/accessibility checks and visual review pass. |
| 2 | Weeks 3.5–6.5 | Supabase schema, Storage, RLS, hardened RPCs, local database tests | Phase 0 env approved and project available for application testing; schema design review | Clean local reset succeeds; all tables have documented RLS/grants; pgTAP security/concurrency tests pass; migration diff is reviewed. |
| 3 | Weeks 6.5–11 | Core dating loop: auth completion, profile onboarding, verification interface, discovery, swipe/match, messaging, block/report surfaces | Phase 2 contracts and generated types; Phase 1 primitives | Synthetic end-to-end signup → completion → discovery → mutual match → chat → block/report passes; `DB/userDB` no longer supplies production feed data. |
| 4 | Weeks 11–13 | Sandbox billing, PayPal webhooks, subscription state machine, paywall and recovery UI | Phase 2 billing schema; trusted server runtime/envs; PayPal Sandbox credentials approved | TEST-PAY-01–07 pass including forgery, replay, ordering, cancellation/refund/failure; only verified settlement grants entitlement; live billing remains disabled. |
| 5 | Weeks 13–14.5 | Moderation console, privacy/export/deletion, analytics controls, observability and security hardening | Core flows; RBAC and audit; approved privacy copy and retention decisions | Safety/privacy regression passes; moderator actions auditable; deletion/restore drills work; zero unresolved critical security/privacy findings. |
| 6 | Weeks 14.5–18.5 | Controlled, invitation-only pilot: internal synthetic stage then ~100 users then gradual expansion toward 1,000 | All legal, privacy, safety, budget, recovery, auth and release gates; staffed moderation | Stage-by-stage go/no-go review and written evidence; rollback tested; metrics are measured against defined denominator and window. No broad exposure of 1,000 users at once. |
| 7 | After Phase 6 evidence | Public scale and mobile-store readiness | Pilot thresholds met; owner approves market, pricing, spending and launch; store payment rules resolved | Separate public/commercial launch approval. Native store sales require Apple/Google billing policy assessment and required IAP work; PayPal Sandbox does not count as production billing readiness. |

### Phase sequencing and parallel work

- Phase 0 code inventory, secret audit, docs, legal packet and CI design can run in parallel, but the first protected merge and safe environment config are prerequisites to feature work.
- Phase 1 visual design can proceed alongside early local schema design once table/view contracts are drafted, but UI must not hard-code the provisional API schema.
- Phase 2 migrations/RLS/RPCs are the critical path for persistent dating features. Client work may use typed mocks until local Supabase tests pass; it must not use hardcoded client mock data as a substitute for the backend in release builds.
- Legal counsel, verification vendor selection, pilot recruiter/moderator appointment, budget authorization, and paid-project provisioning are external dependencies. They do not prevent work that safely uses synthetic data, but they block the affected real-data/live-user/live-payment stages.

---

## 3. PR work packages

Every PR must include: linked requirement IDs and tests; a short change summary; before/after screenshots for UI changes; migration/rollback notes for SQL changes; security/privacy impact; explicit test commands and actual results; an updated ADR/docs page when behavior or service boundary changes; and a rollback plan. Target one coherent concern per PR, ideally reviewable in under an hour. Split further if an agent is touching unrelated domains.

### Phase 0 — Evidence, repo safety, and governed development

#### PR P0-01 — Current repository and deployment baseline
- **Scope:** inspect actual `main` tree and current HEAD; map route structure and shared components; document auth implementation, mock data, dependencies, existing workflows/migrations, Vercel settings/deployments and environment names; check signing and secret artifacts in current tree and Git history.
- **Files/areas:** `docs/implementation/baseline-audit.md`, `docs/implementation/repo-map.md`, `docs/adr/ADR-001-service-boundaries.md`; read-only inspection of `app/`, `components/`, `lib/`, `DB/`, `app.json`, `package.json`, lockfile, `.github/`, `supabase/`, Vercel project settings.
- **Tests/evidence:** clean install; current lint/typecheck/build attempts logged without hiding failures; tracked-file and Git-history secret scans; test Vercel deployment URL, protection, auth redirect domains.
- **Acceptance:** audit distinguishes verified facts from assumptions, cites paths and command results; current HEAD and deployed SHA recorded; old ZIP is not treated as source of truth; no cloud mutation or spend.

#### PR P0-02 — Repository hygiene and secret/signing-artifact remediation
- **Scope:** remove any confirmed committed debug keystore, private key, `.env` or credential from the current repository; add ignore rules and secret scanning; rotate any credential that evidence shows was exposed. Do not delete/rewrite production release signing identity without a release-owner plan.
- **Files/areas:** `.gitignore`, `SECURITY.md`, repository settings/runbook; confirmed path(s) only.
- **Tests:** repository secret scanner and history scan; assert no signing/debug artifacts are tracked except explicitly approved public certificates/config.
- **Acceptance:** exposed secrets are rotated/revoked; historical secret exposure is documented; secret values are never copied into PR comments/logs; if no secret is found, evidence states that result.

#### PR P0-03 — PR governance and deterministic CI
- **Scope:** add a non-watch test command and required GitHub Actions checks; prohibit direct `main` writes; require independent review and green checks; pin or constrain third-party Actions; least-privilege workflow permissions; use concurrency cancellation safely.
- **Files/areas:** `package.json`, lockfile if changed, `.github/workflows/ci.yml`, `.github/workflows/security.yml`, repository branch protection settings (manual approval recorded separately).
- **Tests:** CI runs `npm ci`, lint, `tsc --noEmit`, Jest in CI mode, Expo web export/build, secret scan and dependency audit. Add smoke job for app import/routes when feasible.
- **Acceptance:** no watch process; failure blocks merge; pull request cannot self-approve; secrets are not exposed to fork PRs; workflow permissions are minimal; checks are reproducible locally.

#### PR P0-04 — Environment contract and local developer setup
- **Scope:** replace placeholder Supabase client fallback with safe missing-config behavior; formalize client and server env validation; add sample env file with names only; document redirect URLs and environment separation.
- **Files/areas:** `lib/supabase.ts`, `lib/AuthProvider.tsx`, `.env.example`, `.gitignore`, `README.md`, `docs/operations/environments.md`, server env-schema module to be added in later PR.
- **Tests:** no-config test does not contact placeholder host and presents clear disabled/setup state; configured fake/local project test initializes; no `service_role`/PayPal secret appears in client bundle.
- **Acceptance:** only public publishable/anon key may be `EXPO_PUBLIC_*`; private credentials are server-only; dev credentials are never copied from production; setup is documented.

#### PR P0-05 — Legal review packet and product guardrails
- **Scope:** prepare, do not self-approve, legal materials: terms, privacy notice, community standards, age/verification flows, consent map, moderation/SLA, deletion/export, complaints and subscription/refund/cancellation disclosures; neutral Alternative A positioning only.
- **Files/areas:** `docs/legal/review-packet.md`, draft documents in `legal/drafts/`, product copy inventory, `docs/adr/ADR-002-philippines-only-and-neutral-dating.md`.
- **Tests/evidence:** checklist maps each user journey and public claim to counsel review item; no marriage-broker/catal og marketing or unsupported claims.
- **Acceptance:** clear `DRAFT—COUNSEL REVIEW REQUIRED` marking; owner appointment of independent Philippine counsel tracked as dependency; no public or paid launch inferred from code completion.

### Phase 1 — UI/UX system and screen traceability

#### PR P1-01 — Requirements and 24-screen route matrix
- **Scope:** map all 24 approved launch screens and states (loading, empty, error, success, access denied) onto current routes; note which routes exist, need adjustment, or are new. Preserve current design direction instead of replacing it with a generic template.
- **Files:** `docs/product/screen-inventory.md`, `docs/product/acceptance-matrix.md`, route files under `app/`.
- **Tests:** automated or checklist-based route reachability; each launch-critical requirement has a screen/API/table/test link.
- **Acceptance:** every screen has owner intent, auth boundary, primary action, error/empty/loading state, analytics event decision, accessibility checks, and test ID; deferred features are labelled.

#### PR P1-02 — Design tokens and accessibility primitives
- **Scope:** editorial visual system: typography, spacing, colors, responsive breakpoints, focus/pressed/disabled states, form fields, dialogs, toasts, cards, profile/media surfaces. Reuse available components where quality is acceptable.
- **Files:** `theme/` or existing `constants/`/`components/` conventions after baseline audit; `components/ui/`; `docs/design/tokens.md`.
- **Tests:** contrast snapshots/manual review, axe checks on web routes, keyboard/focus tests, reduced-motion behavior and screen-reader labels.
- **Acceptance:** WCAG 2.2 AA checks for the launch-critical surfaces; no new hard-coded inconsistent tokens; mobile layout remains usable on mid-range devices.

#### PR P1-03 — Navigation, responsive layouts and form-state patterns
- **Scope:** shared layout for public, auth, onboarding, dating, privacy/settings and moderation views; predictable back/forward behavior and reusable pending/success/failure states.
- **Files:** `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, route groups to match current Router conventions, shared `components/`.
- **Tests:** route smoke tests, deep-link/refresh behavior on web, keyboard/viewport sizes, protected screen redirects.
- **Acceptance:** no route leaks protected views when logged out; no dead buttons; responsive navigation works with keyboard and touch; existing app remains runnable on supported targets.

### Phase 2 — Database, RLS, Storage and transactional invariants

**Canonical migrations:** keep the v1.1 four migration boundaries, but reconcile their declared table count before writing DDL. The listed table names enumerate **19 separate relations**, while the plan says “18”; default implementation is the 19 individually named relations unless an ADR explicitly approves consolidation.

#### PR P2-01 — Migration 0001: identity/profile domain
- **Files:** `supabase/config.toml`, `supabase/migrations/20261020000001_enums_and_profiles.sql`, generated types location established in repo.
- **Scope:** extensions/enums and `profiles`, `profile_photos`, `user_preferences`, `verification_requests`; foreign keys to `auth.users`; strict display-name, age and preference constraints; default profiles undiscoverable.
- **Tests:** clean local reset; DOB age boundary; profile ownership; max six photos/order uniqueness; defaults for verification/discovery; generated types compile.
- **Acceptance:** migration is repeatable through Supabase CLI reset; no client can make a new user discoverable by merely setting a client flag; no biometric artifact fields are introduced by default.

#### PR P2-02 — Migration 0002: discovery, likes, matches and messaging domain
- **Files:** `supabase/migrations/20261020000002_discovery_matches_messaging.sql`.
- **Scope:** `swipes`, `daily_swipe_quotas`, `matches`, `conversations`, `conversation_participants`, `messages`, `blocks`; canonical pair ordering; uniqueness/indexes for feed and conversation queries.
- **Tests:** duplicate pair cannot be inserted; self-swipe rejected; reciprocal likes create exactly one match/conversation under concurrency; unmatched/blocked states cannot be used to send messages.
- **Acceptance:** transactional constraints and indexes are documented; no client-supplied actor ID can cause cross-user mutation.

#### PR P2-03 — Migration 0003: safety, billing, consent, privacy and audit domain
- **Files:** `supabase/migrations/20261020000003_safety_billing_privacy_audit.sql`.
- **Scope:** `reports`, `moderation_cases`, `subscriptions`, `entitlements`, `payment_events`, `consent_records`, `privacy_requests`, `audit_events`; state enums, provider-event idempotency keys, financial references, retention metadata and indexes.
- **Tests:** unique provider event ID; immutable payment/audit insert behavior; deletion-retention foreign key strategy; privacy request transitions; subscriptions never confer entitlement solely from client input.
- **Acceptance:** no client roles have write grants on payment events, entitlements, moderation cases or immutable audit records; retention and legal hold decisions are documented rather than assumed.

#### PR P2-04 — Migration 0004A: RLS, grants and Storage policies
- **Files:** `supabase/migrations/20261020000004_rls_storage_and_hardened_rpcs.sql` or split into 0004/0005 only if migration ordering is updated by an ADR before implementation; `supabase/tests/`.
- **Scope:** enable RLS on every public table; explicit grants; private `verification_artifacts` bucket and scoped `profile_photos`; path ownership (`auth.uid()` folder), MIME/size restrictions, signed URL strategy.
- **Tests:** anon, user A, user B, moderator and server-role policy matrix; users cannot read another private profile/preferences, private media, conversations or verification artifacts; public profile fields are explicitly allowed only where intended.
- **Acceptance:** zero tables without reviewed RLS; storage tests reject traversal/other-user paths/wrong MIME; no public bucket for verification artifacts.

#### PR P2-05 — Hardened RPCs and atomic invariants
- **Files:** migration RPC section, SQL tests, typed RPC wrappers under `lib/`.
- **Scope:** `get_discovery_feed`, `record_swipe`, `has_active_entitlement`, `send_message` (or equivalent participant-guarded insert policy), `block_user`, `submit_report`, moderation transitions and relevant helper functions.
- **Security requirements:** `SECURITY DEFINER` only when required; fixed `search_path = public, pg_temp`; schema-qualified objects; `REVOKE ALL ... FROM PUBLIC, anon`; explicit grant to intended role; avoid dynamic SQL; validate inputs and actor identity server-side; audit sensitive actions.
- **Tests:** pgTAP and integration tests for 20 concurrent likes: exactly 15 free successes if quota is 15, remainder rejected; reciprocal likes create one match; blocked users cannot discover or message in either direction; moderator-only RPCs reject normal authenticated users; injection/search-path regression tests.
- **Acceptance:** race-sensitive logic lives in one transaction; no UI-only enforcement; all privileged functions have a documented principal and privilege test.

#### PR P2-06 — Generated types and repeatable database pipeline
- **Files:** database type-generation scripts, `package.json`, workflow SQL test job, `docs/implementation/database-runbook.md`.
- **Scope:** typegen from local/staging schema; reset and migration diff commands; migration lint; synthetic seed data fixtures; test database setup in CI.
- **Acceptance:** clean checkout can bootstrap local schema without production credentials; CI validates migration replay and RLS tests; generated types are committed only if repository policy chooses committed generation.

### Phase 3 — Core app functionality

#### PR P3-01 — Complete Supabase Auth lifecycle and 18+ entry gate
- **Files:** `app/auth/signin.tsx`, `app/auth/signup.tsx`, new recovery/callback routes, `lib/AuthProvider.tsx`, `lib/supabase.ts`, `app/_layout.tsx`.
- **Scope:** keep current email/password flow; implement password recovery/reset, email verification callback, safe deep links and session-expiry UX; age gate before profile activation; route guard while auth state loads; disable unfinished OAuth controls or fully implement one provider only after provider setup.
- **Tests:** signup/signin/signout; no session routes to auth; valid session survives reload; expired session safely redirects; email confirmation and password recovery happy/failure paths; under-18 DOB fails UI and DB checks; unverified accounts remain non-discoverable.
- **Acceptance:** session state has one authority; no broken “forgot password” or inert social buttons; error messages don't leak user existence unnecessarily.

#### PR P3-02 — Progressive onboarding, profile prompts and photo pipeline
- **Files:** new/updated onboarding routes, profile editor/view components, storage helper, `profile_photos` RPCs/policies.
- **Scope:** staged profile completion, three structured prompts, at least two approved photos before discovery, up to six photos; resumable drafts; server-validated profile quality; vendor-independent verification state machine (`not_started`, `pending`, `verified`, `failed`, `requires_review`).
- **Tests:** incomplete profile never appears in feed; upload type/size/order/ownership; upload fails safely with no orphan metadata; verification pending/review states; production never marks verified with test adapter; provider outage degrades to pending/retry/review, not success.
- **Acceptance:** user sees a truthful checklist; no raw selfie or biometric template retained by default; evidence collection cannot begin until privacy/legal/vendor decisions authorize it.

#### PR P3-03 — Server-backed discovery, filtering, swipe quota and mutual match
- **Files:** `app/(tabs)/discover.tsx`, `app/(tabs)/people.tsx`, `DB/userDB.tsx` references, typed data-access modules, RPCs.
- **Scope:** replace production use of mock lists with cursor-based `get_discovery_feed`; apply age/preferences/shared interests/intent, eligibility, verification, block, report, hidden and prior-swipe filters; deterministic pagination and empty state; call atomic `record_swipe`.
- **Tests:** stable pagination/no duplicates; all ineligible accounts excluded; blocked/reported/swiped users excluded; concurrent like quota tests; reciprocal matches and duplicate retry behavior.
- **Acceptance:** `DB/userDB` data is available only to tests/development previews if useful and cannot ship as a production feed source; server is authoritative for every feed/like/match decision.

#### PR P3-04 — Conversation list and real-time text messaging
- **Files:** `app/(tabs)/(chats)/_layout.tsx`, chat list and screen, message component, typed data access, Supabase Realtime setup.
- **Scope:** server-persisted, cursor-paginated messages; real-time updates only for conversation participants; read/receipt behavior only where approved; idempotent retry/offline queue if supported; anti-scam warnings for early off-platform contact/financial solicitation patterns without exposing message text to analytics.
- **Tests:** user outside conversation cannot read/insert; blocked/unmatched users cannot send; resend does not duplicate; reconnect catches up by cursor; message size and validation limits; warning/report UX tested.
- **Acceptance:** mutual messaging remains free; private conversation text never sent to PostHog or logs; real-time channels cannot widen RLS.

#### PR P3-05 — Blocking, reporting and user-facing safety controls
- **Files:** profile/chat action components and routes, database RPC wrappers, report submission confirmation, user settings.
- **Scope:** one-tap block/report/unmatch; block severance is immediate; reports capture minimal category/context; prevent reappearance/contact; clear status and appeal/help paths.
- **Tests:** blocked user cannot re-match/message/view protected presence; report created once for one submission; unauthorized users cannot browse others’ reports; all profile/chat entry points have block/report actions.
- **Acceptance:** safety controls are free and available to all subscription tiers; report path is accessible even during connection failures (queued retry/clear message where feasible).

#### PR P3-06 — Notifications (launch scope decision)
- **Files:** notification table or schema amendment, Expo push registration and handlers, preference UI.
- **Scope:** new match/message safety-relevant notifications with opt-in permission handling and no sensitive message body in push payload by default.
- **Tests:** invalid token removal, duplicate job handling, user preference respected, no notification after block where prohibited.
- **Acceptance:** implement before pilot only if included in the agreed screen matrix; otherwise mark explicitly deferred and remove any claims that depend on it. Do not silently drop it while leaving dead UI.

### Phase 4 — PayPal Sandbox and premium entitlements

#### PR P4-01 — Plan catalogue, server environment and checkout initiation
- **Files:** `api/paypal/` or chosen Vercel route convention, server env schema, plan registry, billing UI routes, `docs/operations/paypal-sandbox.md`.
- **Scope:** server-managed locale plans: Philippines ₱599/month and US US$29.99/month as separate configured market amounts, not currency conversions. Persist provider plan IDs and active version/config on the server. Expose only approved public plan descriptions to the client.
- **Tests:** correct locale/plan mapping; unknown plan rejected; authenticated account binds to checkout; client cannot choose arbitrary amount/plan ID; sandbox credentials required for all billing endpoints.
- **Acceptance:** browser cannot set price or entitlement; PayPal Sandbox only; production/live credentials are absent or hard-disabled in all environments; price display and renewal/cancellation/refund copy match counsel-reviewed drafts before cohort billing use.

#### PR P4-02 — Webhook cryptographic verification and idempotent ledger
- **Files:** PayPal webhook endpoint, signature verification helper, `payment_events` writer, webhook test fixtures.
- **Scope:** verify signature through PayPal’s verification endpoint using trusted server credentials and configured webhook ID; validate environment, event/resource identity, event type, subscription/user association and expected amount/currency; persist event idempotently before applying state transitions; handle out-of-order delivery and retries.
- **Tests:** forged signature rejected; missing/unknown webhook ID rejected; repeated event has no duplicate effect; delayed cancellation/refund and sale events reconciled against current subscription state; network/API failure returns safe retryable failure; logs redact sensitive payload fields.
- **Acceptance:** raw webhook body is processed without trusting browser state; event ID unique; no entitlement until the v1.1 approved settlement rule (`PAYMENT.SALE.COMPLETED` or independently verified last payment via PayPal REST) succeeds; test events cannot touch production store.

#### PR P4-03 — Subscription state machine, cancellation, recovery and entitlement checks
- **Files:** billing service/state mapper, scheduled reconciliation endpoint/job, `subscriptions`/`entitlements` RPC logic, test fixtures.
- **Scope:** explicit states including approval pending, active, past due, suspended, cancelled, expired and refunded/revoked; map provider events deterministically; cancel-renewal vs immediate revoke behaviors specified; reconcile webhook state with PayPal subscription REST as needed.
- **Tests:** unpaid activation prohibited; cancellation and expiration remove premium on the defined effective date; refund/reversal revokes entitlement; failed payment triggers correct grace/recovery state; stale DB state is corrected by reconciliation; repeated events remain idempotent.
- **Acceptance:** `has_active_entitlement` reads authoritative database state and period timestamps; all transitions audit logged; no client writes `subscriptions` or `entitlements`.

#### PR P4-04 — Premium, pricing, billing and payment-history UI
- **Files:** pricing/paywall screens, subscription status/cancel/restore/retry views, legal disclosure components.
- **Scope:** visible feature comparison, transparent currency and renewal interval, checkout handoff, return-from-PayPal refresh/recovery, cancellation confirmation, payment history/status and meaningful error recovery. Avoid misleading success if post-return status refresh fails.
- **Tests:** sandbox end-to-end test for handoff/callback/webhook delay, retries don't create unintended duplicate subscriptions, stale state recovery, cancellation UX, keyboard/accessibility and locale price mapping.
- **Acceptance:** redirect is never treated as payment success; retries reopen/resume the known checkout when possible; exact active subscription state drives UI; every failure has safe next step.

### Phase 5 — Moderation, privacy, analytics and operational hardening

#### PR P5-01 — Role-protected Trust & Safety console and audit
- **Files:** admin/moderation route group, server-side role-check helper, report queues, moderation RPCs, `audit_events`.
- **Scope:** review queue sorted by severity/age; case assignment/status; evidence access only with a case and least privilege; suspend/restore/takedown/appeal actions; immutable audit history of access and action. No role may be assigned by a user-editable profile field.
- **Tests:** normal auth user receives authorization failure for admin routes/RPCs; moderator access is limited to assigned responsibilities; every evidence view/action is audited; audit events cannot be updated/deleted by client roles.
- **Acceptance:** operational console works in staging with synthetic reports; named human moderation owner and coverage schedule are recorded before any pilot; urgent report escalation is defined and tested.

#### PR P5-02 — Consent records, data export and account deletion
- **Files:** privacy/settings routes, trusted deletion/export endpoint, deletion orchestration, retention jobs, `privacy_requests` and consent paths.
- **Scope:** self-service export and deletion request; confirm identity/re-authenticate for destructive requests; revoke sessions; disable account immediately; purge profile/photos and appropriate messages/PII; preserve only narrowly approved financial, abuse, legal-hold and audit records; track job progress without exposing data.
- **Tests:** `TEST-PRIV-01`: deleted user cannot sign in/use sessions, profile and media are absent, deletion retry is idempotent; export contains permitted data only; held records follow explicit retention; failure leaves a retryable privacy request and alert.
- **Acceptance:** no promise of complete deletion until asynchronous storage cleanup confirms success; retention schedule is approved by counsel; account deletion complies with applicable app-store requirements before public store release.

#### PR P5-03 — PII-minimized PostHog analytics and consent
- **Files:** analytics wrapper, event/property allowlist, consent hooks, configuration, tests.
- **Scope:** HMAC-SHA256 pseudonymous distinct ID with secret salt kept server-side where required; `$ip` omitted; strict event/property allowlist; record essential funnels and pilot metrics; disable/limit capture until required notice/consent choices are approved.
- **Tests:** payload-inspection tests reject email/name/DOB/location/message text/verification payload/payment details; no secret salt bundled client-side; analytics provider failure never breaks core app.
- **Acceptance:** privacy event taxonomy and retention are documented; PII minimization is described accurately (not “zero PII”); consent state is honored.

#### PR P5-04 — Observability, abuse/rate limits, backup and restore drill
- **Files:** structured logger/redaction helper, health endpoint, error reporting configuration, rate-limit middleware/RPC controls, backup runbook and CI/staging verification scripts.
- **Scope:** health/readiness signals, alerting for payment/webhook errors, auth failures, report backlog, deletion backlog, DB failures and costs; login/signup/report/message/upload rate limits; off-site encrypted backup strategy; recovery runbook.
- **Tests:** synthetic alert test; logs contain request IDs but no secrets or private message bodies; rate-limit tests; point-in-time or documented alternative backup restored into a throwaway environment; verify RPO/RTO with measured restore evidence.
- **Acceptance:** a backup file existing is insufficient—restore must be executed and checked. Recovery capability must be verified before first live subscription transaction. PITR is enabled only after current cost is verified and owner approves; if over budget, present an alternative with an explicit RPO/RTO and owner approval.

#### PR P5-05 — Security review and pre-pilot threat-model closure
- **Files:** `docs/security/threat-model.md`, test reports, dependency/SBOM outputs, incident-response playbook.
- **Scope:** review auth/session, RLS, storage, RPCs, upload validation, abuse controls, secrets, webhook signature, rate limits, privacy deletion and admin privilege boundaries.
- **Tests:** RLS matrix, fuzz/negative input tests, ZAP/DAST of staged web endpoints where suitable, bundle secret scan, package vulnerability scan, end-to-end suite.
- **Acceptance:** zero unresolved critical security/privacy findings; high findings have documented remediation or owner-signed risk acceptance that does not waive legal safety gates; the coding agent cannot self-approve that risk acceptance.

### Phase 6 — Controlled pilot and quality gates

#### PR P6-01 — Release-candidate E2E and pilot instrumentation
- **Files:** `e2e/`, integration/contract tests, metrics definitions, launch checklists.
- **Scope:** realistic synthetic journeys across signup/verification, onboarding, discovery/swipe/match, chat, block/report, moderation, password recovery and deletion. Billing tests use Sandbox only.
- **Tests:** full required workflow passes against staging with seed reset; accessibility audit; smoke and load profiles appropriate to initial scale; observability and alert drill; all gate evidence attached.
- **Acceptance:** requirements traceability matrix has no untested launch-critical items; 100% pass on authentication, authorization, account isolation and deletion acceptance tests; zero unresolved critical findings.

#### Operational rollout — internal → ~100 → staged expansion
- Stage A: internal synthetic data only. No real user accounts.
- Stage B: invitation-only cohort up to approximately 100 people, only after all legal/privacy/safety gates and named human operating coverage are in place.
- Stage C: review evidence and critical issues, then expand by controlled increments toward 1,000; do not admit all users to one unvalidated release at once.
- Rollout owner documents invited count, cohort boundary, release SHA, schema version, alerts, on-call contacts by role, stop/rollback criteria and daily/weekly review outcome.

#### Pilot metrics and definitions
- **Security/privacy:** zero unresolved critical findings before real-user admission; 100% pass on required auth, authorization, account isolation and deletion tests.
- **Safety response:** at least 95% of safety reports receive human triage within 24 hours during staffed periods. Measure `triaged_at - submitted_at`; report denominator as reports received during the defined period, excluding explicitly documented spam/test tickets but not silently excluding difficult cases. Also report critical reports separately and publish coverage hours.
- **Reliability:** at least 99.5% crash-free sessions over the measurement period once sufficient usage exists. Define session source, app versions, minimum denominator and the period before drawing a pass/fail conclusion.
- **Onboarding:** at least 70% completion among signup attempts/accounts meeting a declared denominator within 48 hours; exclude bots/test accounts according to documented rules, not ad hoc exclusions.
- **Engagement/quality:** measure profile completion, match rate per eligible active user, meaningful conversations (at least three messages by each participant within 72h of a match per v1.1 hypothesis), retention, report rate, false positives, abuse patterns and qualitative feedback. Treat these as hypotheses pending baseline, not existing claims.
- **Payment integrity:** 100% reconciliation agreement between verified Sandbox settlement records and derived entitlement state in test runs. Live reconciliation is not enabled without a separate owner-approved commercial launch.

### Phase 7 — Public launch and scale (explicitly separate approval)

#### PR P7-01 — App identity and reproducible native build
- **Files:** `app.json`/app config, `eas.json`, URL schemes, Android namespace/source tree if retained, iOS bundle settings, build documentation.
- **Scope:** replace placeholder package/bundle IDs with owner-approved registered identifiers; define dev/staging/production profiles; configure signing through approved secret storage; build on physical Android/iOS test devices.
- **Tests:** clean EAS builds and install/launch/deep-link/auth/recovery flow on actual devices; no debug signing key in repository; release bundle scans clean.
- **Acceptance:** production IDs and app-store accounts are verified by owner; signing keys controlled and backed up under policy; builds reproducible. Creating paid EAS resources requires separate approval.

#### PR P7-02 — Native billing policy and store readiness
- **Scope:** assess Apple/Google rules for premium digital features and implement required StoreKit/Google Play Billing if native storefronts sell subscriptions. Keep web PayPal flows separate and route-aware; do not assume PayPal-only is store compliant.
- **Acceptance:** store-specific billing policy and legal assessment signed off; transaction verification and restore-purchase tests pass; otherwise defer public in-app subscription sales and keep apps in internal/closed testing.

#### PR P7-03 — Production enablement and staged rollout controls
- **Scope:** production configuration, alerts, limits, documented pricing/legal copy, support handoff, feature flags and launch communication.
- **Acceptance:** a separate written owner authorization names the release SHA, environment, domains, market, billing mode and spend envelope; legal, safety, security, recovery and operational gates are green. Live PayPal secrets are injected server-side only after approval. No automatic activation from merge or deployment alone.

---

## 4. Data model and migration rules

### 4.1 Canonical table inventory

| Table | Purpose / key rules | Sensitivity and access boundary |
|---|---|---|
| `profiles` | `id` equals `auth.users.id`; birth date/adult constraint; display name/content; discoverability defaults false; suspension and verification state | High PII; owner-controlled fields only; server-controlled eligibility fields |
| `profile_photos` | user, unique storage path, display order 1–6, metadata only | High media privacy; private Storage object ownership |
| `user_preferences` | user-owned age range and matching preferences | User-only edits; age lower bound 18 and valid range |
| `verification_requests` | provider-neutral status, timestamps, attempts, minimal vendor reference/reason | Restricted; no raw selfie/template by default |
| `swipes` | actor, target, `like`/`pass`, unique actor-target, no self-swipe | User can act only as self; read visibility restricted |
| `daily_swipe_quotas` | user/date composite key, nonnegative counter and update timestamp | Private; RPC-only mutation |
| `matches` | canonical pair `user_a_id < user_b_id`, unique pair and state transitions | Visible only to the pair/approved systems |
| `conversations` | one conversation per match, message activity cursor/time | Participants only |
| `conversation_participants` | composite conversation/user key | Used for participant authorization; no forged membership |
| `messages` | conversation/sender/body/time with length constraint and cursor index | Participants only; immutable or edit/delete semantics explicitly decided |
| `blocks` | blocker/blocked unique pair; no self-block | Safety boundary; enforcement in all RPC/feed/chat paths |
| `reports` | reporter, reported user, category, minimal evidence reference, status/severity | Restricted to reporter's submission and authorized Trust & Safety staff |
| `moderation_cases` | case workflow, assignment, decision, status and references to reports | Moderator RBAC and immutable actions in audit log |
| `subscriptions` | owner reference, provider plan/subscription IDs, state and billing periods | Server-only writes; retain minimum finance history under approved schedule |
| `entitlements` | unique user/key, active/status/period timestamps and origin | Authoritative premium access; no client writes |
| `payment_events` | unique provider event ID, event type/resource refs, verification/processing status | Append-only/idempotent; never store unnecessary raw payment PII |
| `consent_records` | consent/notice version, choice and timestamp | Immutable proof, as permitted by counsel-approved retention |
| `privacy_requests` | export/deletion request, status, timestamps and completion evidence | User can create/read own request; worker-only progress updates |
| `audit_events` | actor, action, target, timestamp, safe metadata/correlation ID | Append-only; updates/deletes revoked for application/client roles |

This inventory contains 19 names. PR P2-01 must settle the v1.1 prose’s “18 tables” inconsistency by updating the source-of-truth schema registry and acceptance tests to the final approved inventory. Do not omit a named relation just to force a count.

### 4.2 Migration order and operating rules

1. `20261020000001_enums_and_profiles.sql`: extensions/enums and profile, photo metadata, preferences and provider-neutral verification request schema.
2. `20261020000002_discovery_matches_messaging.sql`: swipe/quota/match/conversation/message/block tables and required indexes/constraints.
3. `20261020000003_safety_billing_privacy_audit.sql`: reports, moderation, subscriptions, entitlements, payment event ledger, consent, privacy requests and audit events.
4. `20261020000004_rls_storage_and_hardened_rpcs.sql`: RLS/grants/storage policies and reviewed hardened RPC functions. If testing shows these concerns are too large for safe review, split into new ordered migrations via an ADR, never by rewriting a migration already applied to a shared environment.

Rules:
- Migrations are additive, ordered and replayable on an empty local database. Do not modify an already-applied migration to change production history; add a forward migration.
- Use expand-and-contract for incompatible schema changes. In a release, deploy compatible DB changes first, then backend, then client; remove old columns only after usage evidence and a separate migration.
- Use indexes aligned to actual feed/conversation queries; confirm with staging `EXPLAIN` at pilot scale.
- Generate types from the database schema. Avoid hand-maintained duplicate interfaces that drift.
- RLS is required regardless of whether data is accessed through client PostgREST, RPC or Realtime. Test each persona directly against the API, not only through the UI.
- Privileged functions use fixed search path, explicit schema qualification, least privilege and explicit grants. Avoid granting `EXECUTE` to `PUBLIC` or `anon`.
- Define deletion/retention policy and legal hold behavior before production data. Financial/audit retention and a user’s right to deletion must be reconciled with counsel, not hand-waved by cascade behavior.

### 4.3 RPC contracts to document before implementation

- `get_discovery_feed(cursor, limit, filters)` → safe profile projection only; excludes self, underage/unverified/incomplete/suspended, blocked/reported/hidden and previously swiped profiles; stable cursor.
- `record_swipe(target_id, direction)` → derives actor from `auth.uid()`, validates eligibility and block state, locks daily quota, applies free limit, atomically persists swipe and reciprocal match/conversation.
- `has_active_entitlement(user_id, entitlement_key)` → server/authorized read of current entitlement and effective period; clients cannot supply a trusted result.
- `send_message(conversation_id, body, idempotency_key)` or equivalent insert path → validates participant, active match and no block; applies rate/body limits; prevents duplicate retry.
- `block_user(target_id)` → idempotent block, terminates active relationship, prevents future discovery/chat, audit logs.
- `submit_report(target_id, category, permitted_context)` → validates reporter identity and payload size; does not expose reports to other users.
- `moderation_transition(case_id, action, reason)` → requires trusted moderator role; logs access and decision.
- `request_account_deletion()` and worker completion → idempotent lifecycle, revokes sessions/visibility then purges permitted records/media; reports completion only when the required steps are confirmed.

---

## 5. Authentication, verification and privacy controls

### Authentication
- Preserve current Supabase email/password auth and session provider; confirm listener cleanup, token refresh across foreground/background, web storage behavior, and deep linking on native builds.
- Use allowlisted redirect URLs per environment; never allow an arbitrary query-string return URL.
- Password recovery uses expiring one-time links and a confirmation route; sign-out invalidates server session according to chosen Supabase semantics and clears local state.
- Configure email confirmation/rate limits/leaked-password protection as available in the selected project, subject to cost approval and current provider options. Record the actual settings from dashboard/API in evidence.
- Do not make Google/Facebook buttons appear functional until each provider is configured, consented, and tested; then add an isolated PR.

### Age and liveness verification
- Enforce minimum age at client UX and database write boundary. Keep `birth_date` private and do not publish exact DOB to discovery or analytics.
- Model verification statuses exactly: `not_started`, `pending`, `verified`, `failed`, `requires_review`. Provider result validation and transitions are server-side; add attempts/rate limits and a manual review route.
- Define `Verified` badge and discoverability as server-derived state; client cannot set verified flags.
- Provider adapter interface must allow replacement and a fake test adapter usable only in local/test. Production startup must reject test adapter configuration.
- No raw selfie/biometric template storage by default. Any evidence retention, vendor transfer, biometric processing, or automated match must await vendor selection and legal/privacy/security review; minimize what is logged.

### Privacy, consent and analytics
- The Philippine initial market governs the first legal review; the US, Canada, Australia and UK remain deferred until separately reviewed and approved.
- Define data inventory, purpose, retention, access, subprocessor and deletion flow for profile data, chat, photos, verification, reports/moderation, billing records and analytics.
- Add versioned legal notice/consent records where lawful basis/consent is required, and do not make non-essential analytics consent a barrier to core safety functions.
- PostHog receives allowlisted pseudonymous events only. Never ingest chat text, identity evidence, email/name/DOB, precise location, authorization tokens, full PayPal payloads or free-form user content.
- Breach playbook: contain, preserve required evidence, assess impact and notification triggers with counsel/privacy lead, and follow applicable notification timelines. Do not hard-code a blanket statutory deadline without evaluating the actual trigger and current legal advice.

---

## 6. PayPal Sandbox design and billing gates

### State and event rules
- Store plan catalogue and provider Plan IDs server-side by environment and market; never accept amounts, currency or entitlement keys from an untrusted client.
- Checkout creation returns only the approved Sandbox approval URL and server correlation ID; the URL redirect is not a payment confirmation.
- Verify webhook signature with PayPal’s server-side verification mechanism and the configured Sandbox webhook ID. Validate event/resource identity and use provider REST reads to reconcile ambiguous/out-of-order events.
- Persist the unique provider event ID before applying a transition. Handle duplicate delivery idempotently; do not treat a 2xx browser return as a verified webhook.
- Follow v1.1’s conservative settlement rule: entitlement starts only after verified `PAYMENT.SALE.COMPLETED` (or independently verified last payment through PayPal REST if the approved contract uses that fallback). Subscription approval or `ACTIVE` alone is not enough.
- Maintain a deterministic state machine for approval pending, active, past due, suspended, cancelled, expired and refunded/revoked; exact entitlement end date and grace behavior must be specified/tested rather than assumed.
- Add scheduled reconciliation for provider state vs local state, with bounded pagination, idempotent updates, redaction and alerts. Do not add recurring schedules until environment and operational ownership are approved.

### Required Sandbox tests
1. Correct locale plan and user binding; modified amount/plan ID rejected.
2. Valid verified settlement grants expected entitlement exactly once.
3. Forged/invalid/missing signature never grants entitlement.
4. Browser return without verified settlement grants no entitlement.
5. Duplicate event causes no duplicate payment or entitlement.
6. Out-of-order, delayed, or transiently unavailable events result in retry/reconciliation, not false success.
7. Cancellation, failed payment, expiration, refund/reversal and resubscription follow documented transitions.
8. User A cannot inspect/cancel user B’s subscription or payment history.
9. Checkout retry does not accidentally create duplicate subscriptions; resumes known pending checkout when possible.
10. Production bundle and environment tests prove there are no live PayPal secrets or enabled live endpoint paths.

**Billing gate:** Sandbox implementation and test entitlements may exist only in dev/staging/test. Live credentials, real payment processing, paid entitlement grants, and billing promotion require written owner approval after legal, security, operational and recovery gates. App-store sales of digital premium features require separate Apple/Google policy review and likely native billing work before public store launch.

---

## 7. Environments, infrastructure and approval boundaries

### Environments

| Environment | Purpose | Data and secrets | Provisioning policy |
|---|---|---|---|
| Local | fast development and CI contract tests | synthetic-only; local Supabase or disposable test DB; test PayPal adapter | no production credentials; no paid project required to begin code work |
| Development | shared integration | synthetic identities/data; isolated project and Sandbox provider | create only after owner-approved resource plan/pricing; never point at Pandora's Box projects |
| Staging | release-candidate validation and pilot rehearsal | synthetic data by default; PayPal Sandbox; separate email/webhook/domain config | isolated project/config; paid features only after explicit approval |
| Production | real users after all gates | minimum required secrets in server environment; user data under approved retention | do not create/upgrade/apply migrations or promote without explicit approval and a release record |

A single dedicated development project is required by owner decision; separate staging/production projects should be used where budget and isolation justify them. The exact topology is a Phase 0 decision proposal, not authority to provision. The code must support environment-specific Supabase URL, publishable key, server credentials and provider IDs.

### Secrets and config
- Client-only `EXPO_PUBLIC_*`: Supabase URL + publishable/anon key; non-sensitive public config only.
- Server-only: Supabase service role (or restricted server role), PayPal client secret/webhook ID, verification provider secret, analytics HMAC salt, email provider key, signing/cron secrets. Never pass server secrets to Expo, browser bundles, issue text, logs or test artifacts.
- Use the provider’s environment vault/project secrets. Separate dev/staging/prod secrets; test bundle scans should search known secret patterns and confirm private identifiers aren't embedded.
- Log config presence (true/false) and environment labels, never the value.

### Provisional cost baseline from the source plan (not a purchase approval)

The v1.1 document’s **hypothetical low/pilot scenario** totals approximately **US$412/month** before one-time setup costs. This scenario is a dated planning input, not a verified current quote. It includes the following modeled lines; refresh each one with current provider pricing, taxes, volume assumptions, FX exposure and contract terms before seeking approval.

| Cost line (source-plan estimate) | Low/pilot model | Cost behavior / caution |
|---|---:|---|
| Supabase Pro base + staging micro instance | US$35/mo | Fixed recurring; verify actual selected topology and included quotas |
| Supabase production compute | US$5/mo | Usage/tier dependent; verify capacity and included credit |
| Supabase PITR add-on (7-day window) | US$100/mo | Optional in the source estimate; do not enable without cost approval |
| Supabase DB/storage/egress/custom domain allowance | US$10/mo | Usage dependent; monitor growth and egress |
| Vercel hosting/serverless (one Pro seat) | US$20/mo | Fixed/usage dependent; confirm team, seat count and plan |
| PostHog | US$0/mo | Assumes usage below the modeled free tier; establish quota alert |
| Transactional email + off-site storage backup sync | US$25/mo | Usage/provider dependent; storage/egress may vary |
| PayPal processing | US$117/mo | Variable transaction cost modeled against hypothetical payer/revenue assumptions; not a fixed infrastructure bill |
| Moderation/support/verification operations | US$100/mo | Operational labor/tooling assumption; owner must fund and staff real human coverage |
| **Modeled total** | **US$412/mo** | **Not approved; reconcile scope and currency before commitment** |

One-time cost estimates in the source plan include Apple developer enrollment and a possible Google Play setup fee. Verify current vendor terms and store requirements before including any such spend. Since the owner’s hard planning ceiling is ₱10,000/month across all services, this US-dollar scenario must be converted at the current approved budgeting FX rate and reconciled with actual vendor quotes. If it cannot fit, do not simply remove safety staffing or required recovery controls: offer a decision such as staged scope reduction, deferred paid services, an approved lower-cost recovery model, or a revised budget.

### Spending approval workflow
1. Produce a current, itemized cost sheet with base, usage, one-time and annualized costs; list owner, service, tier, region, expected usage, overage trigger, cancellation method and budget impact.
2. Check it against the ₱10,000/month provisional ceiling including all services, not just Supabase. Pricing must be re-verified immediately before approval because the v1.1 2026 table is an estimate, not current authorization.
3. If cost can fit, request explicit owner authorization naming the resources/tier/region and monthly ceiling. If it does not fit, propose a safe lower-cost configuration, document trade-offs and wait for a decision—do not exceed silently.
4. A dedicated project, paid Vercel feature, Supabase add-on/PITR, paid email, verification vendor, PostHog upgrade, or EAS paid resource is a separate approval item if it can incur a charge.
5. The original v1.1 low-pilot cost scenario includes a Supabase Pro+staging base, production compute/storage/egress, and a $100/month 7-day PITR add-on before all other possible tools. Treat the combined bill as a budget risk; evaluate PITR versus an approved alternative instead of enabling it automatically.

---

## 8. CI, release gates, deployment verification and rollback

### Required PR checks
- `npm ci` on a pinned supported Node version agreed after the baseline compatibility check.
- lint and static typecheck.
- Jest in non-watch/CI mode with coverage threshold decisions documented.
- Expo web export/build; route smoke tests; native dependency/config validation.
- migration replay from empty local database; schema lint; pgTAP RLS, grants and concurrency suite.
- secret scanning and client bundle scan for service-role, PayPal secret, verification secret, HMAC salt and unexpected private config.
- dependency audit/SBOM; high/critical vulnerable dependencies assessed and fixed/waived by designated human, not the coding agent.
- UI accessibility smoke tests; snapshot/screenshot checks for design changes.
- E2E/contract suite for changed domain; payment Sandbox suite for billing changes.

### Governance
- Required reviewers: at least one independent reviewer for ordinary PRs; database/security changes require reviewer with database/security role; billing changes require payment/security review. Author cannot approve own PR.
- Required status checks and branch protection on `main`; no force push, no direct commits by agent, no merge on failing/absent checks.
- Agent PR template declares changed files, linked requirement/ADR, data/privacy exposure, migration impact, secrets touched (yes/no, no values), tests run with logs/results, UI evidence, deployment/rollback plan and unresolved risks.
- Do not grant production credentials to the coding agent. Its deployment permission should be preview-only unless owner separately authorizes promotion.

### Twelve release gates (must all have evidence before real users)
1. **GATE-LEGAL-01:** written opinion from independent Philippine counsel on neutral product, laws/regulations, subscription/payments, marketing and safety operations; approved terms/privacy/community standards and user-facing disclosures.
2. **GATE-SEC-01:** RLS enabled and tested on every table; privileged functions hardened and explicit grants verified; no unapproved keys/signing artifacts.
3. **GATE-AUTH-01:** 18+ enforcement validated at UI and database boundaries; password recovery/email confirmation and session handling tested; unverified/ineligible accounts cannot discover/message.
4. **GATE-CORE-01:** onboarding, profile photos, discovery, swipe, match and real-time chat E2E pass; mock DB not used in production data path; WCAG 2.2 AA review on launch-critical screens.
5. **GATE-DATA-01:** concurrent free-like quota and reciprocal match tests pass with no anomalies; no duplicate matches or quota bypass.
6. **GATE-BILL-01:** Sandbox signatures, idempotency, event ordering, settlement, refund, cancellation and entitlement tests pass; no live billing enabled.
7. **GATE-SAFE-01:** block/report at every relevant surface; moderator RBAC/audit operational; documented human coverage, urgent escalation and handling SLA; safety test rehearsal complete.
8. **GATE-PRIV-01:** export/deletion and storage purge tests pass; analytics payload audit excludes sensitive properties; retention and consent copy reviewed.
9. **GATE-CFG-01:** environment/secret scan proves server secrets absent from client bundles; redirect URLs/domains/protection reviewed; production config unavailable to PR previews.
10. **GATE-OPS-01:** monitoring/alerts active; backup restored into a safe environment with measured RPO/RTO; incident response exercised.
11. **GATE-MOB-01:** if native public launch is enabled, approved bundle/package IDs, protected signing, physical-device builds and store-compliant payment model verified. This gate may be deferred only while mobile distribution remains internal/closed testing.
12. **GATE-ROLL-01:** prior deployment can be restored by alias/promotion rollback; database forward-fix/compensation procedure tested; release artifacts and runbook available.

### Deployment sequence
1. Merge to `main` only after review/checks. Let Vercel create a preview/production candidate; do not infer release authorization from automatic deployment.
2. Apply migrations first to local/CI and development; then staging after explicit approval. Run post-migration invariant checks and smoke tests.
3. Deploy compatible backend and client. Validate auth, discovery, messaging, block/report, and (Sandbox only) billing in staging.
4. Production migrations and aliases require named owner approval and a release ticket listing SHA, migration version, environment, expected impact and rollback.
5. Canary internally first, then cohort stage. Watch health/errors/latency, authentication recovery, reports backlog, database failures, storage errors, payment/webhook discrepancies and spending.
6. Stop cohort expansion immediately for any critical privacy/security incident, failure of block/report, underage access, payment entitlement discrepancy, recovery failure or cost-envelope breach.

### Rollback and incident procedures
- **Web/API:** roll back to the last known-good immutable Vercel deployment/alias; confirm route and health checks after rollback. Feature flags may disable non-critical features but cannot disable block/report, account safety or deletion.
- **Database:** prefer forward repair; never assume a Git rollback undoes a database migration. Use additive/expand-contract migrations. PITR/restore only under approved runbook with owner/on-call authority and data consistency review.
- **Payment:** disable checkout initiation first; preserve webhook/event processing and reconciliation evidence; do not delete financial/audit events to “fix” an entitlement. Repair entitlement from verified provider records.
- **Privacy/security:** revoke affected tokens/keys, rotate secrets, restrict compromised route, preserve necessary evidence and involve security/privacy lead and counsel. Communicate/notify according to applicable legal decision and documented timeline.
- **Safety:** urgent reports have documented human escalation outside app UI; do not rely on push notifications alone. Suspend account or discovery at server side where required, with audited reason and appeal path.
- **Restore evidence:** keep sanitized restore logs, checksums/record counts and date of drill; do not use real user exports as test fixtures.

---

## 9. Role ownership (roles only until appointments)

| Role | Accountable responsibilities | Required approval boundaries |
|---|---|---|
| Product/Owner | market and feature decisions, pilot expansion, spend envelope, release authorization | signs legal/launch/spend decisions; resolves product trade-offs |
| Independent Philippine Legal Counsel | statutory review, privacy/consumer/payments, terms and marketing, retention/deletion, vendor terms | written sign-off for GATE-LEGAL-01; no agent substitution |
| Technical Lead/Reviewer | architecture, PR review, migration sequencing and integration correctness | independent approval; cannot approve their own changes |
| Database/Security Lead | RLS/grants/RPCs, threat model, secret handling, security triage | security and database gate evidence; approves technical risk treatment within authority |
| Frontend/Mobile Lead | Expo routes, UX, accessibility, build identities, physical-device checks | mobile readiness gate and UI acceptance evidence |
| Payment Lead | PayPal plans, webhook signature, lifecycle mapping, reconciliation and Sandbox credentials | payment gate evidence; live credentials stay off until owner authorization |
| Trust & Safety Lead/Moderator | report triage, cases, suspensions, appeals and coverage schedule | confirms staffed coverage before real users; urgent safety escalation |
| Privacy Lead | data map, consent, exports, deletion, analytics and breach process | privacy gate evidence and retention coordination with counsel |
| DevOps/Release Lead | environments, CI, Vercel deployment, monitoring, backup/restore and rollback | changes to production environment/aliases and restore execution under approval |
| Pilot Recruiter/Support Lead | invitation cohort, feedback, user support and incident routing | owner appoints person before pilot; no assumed staffing |
| AI Coding Agent (Antigravity) | scoped implementation on branches, tests, PR creation and documentation updates | never authorizes spend, legal conclusions, production migration/release, live billing or its own review |

An individual may hold more than one operational role only if access segregation and independent review remain intact. The person who authors a high-risk PR cannot be its sole reviewer or sole approver.

---

## 10. Risks, mitigations and unresolved dependencies

| Risk / dependency | Severity | Mitigation / exit condition | Blocks |
|---|---|---|---|
| Dedicated Humbble Supabase project not yet verified/provisioned | High | Price and region proposal; owner approval; isolated dev project; synthetic-only until configured | DB integration against shared cloud; staging/pilot |
| Owner spend approval and ₱10,000/month budget fit | High | Current provider price sheet, usage assumptions, alerts/limits, owner approval before paid resources | Resource creation/upgrade; PITR/vendor/EAS paid services |
| Vercel deployment metadata says `live: false` while a production-target deployment is READY; SSO enabled except custom domains | High | Verify intended URL/domain, current production alias, access policy, auth redirects and user reachability | Invitation pilot and public release |
| Legal counsel not yet appointed; legal operator/data controller unverified | Critical | Owner appoints independent Philippine counsel; verify RED-APPLE identity/authority and contracting entity; approve neutral copy, terms and workflows | Real-user pilot and any public/paid launch |
| Age/liveness vendor unresolved | High | Provider-independent adapter; fake adapter limited to tests; no raw biometric retention; vendor selection/privacy review later | Production verification and eligible real users if required gate depends on verified result |
| Table count mismatch (18 prose vs 19 individually named tables) | Medium | Canonical table registry and ADR; default keep 19 named relations | Schema PR merge until inventory reconciled |
| Auth integration partial; password reset/deep-link/verification unfinished | High | PR P3-01 acceptance suite on web and native | Real-user cohort |
| Current SDK/dependency versions may be stale/incompatible with 2026 build/runtime | Medium/High | Audit peer support and Expo compatibility; upgrade only in focused PR with lockfile/tests; do not blanket-upgrade during feature build | Build reproducibility/native release |
| Mock data still drives discover screen | Critical | P3-03 removes production mock feed; production path must use secure RPC | Real-user cohort |
| RLS or SECURITY DEFINER vulnerabilities | Critical | pgTAP/API role matrix, independent security review and GATE-SEC-01 | Any real user data |
| PayPal webhook timing/order/replay and entitlement drift | Critical | signature verify, unique event ledger, provider REST reconciliation, sandbox lifecycle suite | Any paid entitlement/live billing |
| Cost of PITR/verification/email/analytics/native build exceeds ceiling | High | defer/replace only with approved documented RPO/RTO and risk assessment; owner decision before cost | Recovery gate or particular integration |
| Human moderation not staffed | Critical | assign a named lead and coverage/escalation plan; run mock report drill; report triage measurement | Any real-user pilot |
| Deletion vs financial/safety retention conflict | High | counsel-approved schedule and legal-hold rules; tests of purge and retained record scope | Privacy gate / pilot |
| Public store billing rules require native IAP | High | separate review and P7-02 implementation or defer store subscriptions | Public store monetization |
| Open-source repo + production secrets or abuse exposure | High | secret scans, server-only secrets, rate limits, least-privilege admin and safe disclosure workflow | Merge/release gate as applicable |
| Metrics look precise before a baseline exists | Medium | label thresholds as hypotheses; specify window, numerator/denominator and minimum sample | Scale/expansion decision, not safe internal engineering |

### Genuine unresolved prerequisites

These are not unanswered planning questions; they are future approvals/work that the plan must not fabricate:
1. Owner approval of actual paid infrastructure/provider resources after current pricing review.
2. Dedicated development Supabase project reference and separately approved staging/production topology.
3. Appointment of independent Philippine counsel and completed written legal review.
4. Verification provider selection and approval of any personal/biometric data it would process or retain.
5. Verification of the operator’s registered legal identity, contracting entity and data-controller responsibilities.
6. Named human moderation lead and pilot recruiter, published staffed hours and urgent escalation route.
7. Approved actual domains/redirect allowlist and confirmation of Vercel SSO/custom-domain access behavior.
8. Owner’s explicit production release and live PayPal authorization after all required gates; never implied by passing CI.
9. Native store billing and store-account decisions before public App Store/Play subscription sales.
10. Counsel-approved retention schedule for reports, messages, financial records, audit events and verification metadata.

---

## 11. Definition of done and reporting contract

A PR is done only when its acceptance criteria, relevant automated checks and manual evidence are linked in GitHub; its independent review is complete; documentation/ADR and rollback notes are updated; no unapproved resources/spend are created; and any follow-on risk is tracked as an issue. “Code compiles” or “Vercel says READY” is not a feature-acceptance or release gate.

Weekly milestone report (required by owner decision) should contain, in one page:
- planned vs achieved phase/PR milestones and next critical-path dependency;
- merged PRs and release SHAs, with independent reviewer and checks evidence;
- failed or flaky tests and confirmed root cause/fix (no unsupported status claims);
- environment/provisioning status and current month-to-date/forecast spend against ₱10,000 ceiling;
- open security/privacy/legal/safety blockers and who-role owns them;
- release gate status (pass/fail/not tested), links to evidence, and requested owner approvals;
- pilot metrics only when denominator/window/sample is sufficient, clearly labelled as hypotheses until validated.

### Immediate authorized work

Without further approvals, Antigravity can begin read-only baseline inspection, documentation, synthetic-data tests, UX/design inventory, CI definitions, environment validation code and provider-independent interfaces on feature branches. It must not create the Supabase project, upgrade subscriptions, enable paid capabilities, use production credentials in development, apply production migrations, process real payments, represent the product as legally approved, or deploy an unapproved change to production.

**First execution sequence:** P0-01 → P0-03/P0-04 (parallel after baseline paths confirmed) → P0-02 as findings require → P0-05 legal packet in parallel → P1-01/P1-02 → P2-01 through P2-06. Start UI mock contracts in parallel, but do not merge dependent core features until the relevant DB API contract and tests are accepted.
