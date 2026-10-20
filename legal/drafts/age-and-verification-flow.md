DRAFT—COUNSEL REVIEW REQUIRED

# Humbble — Draft Age Assurance & Verification Flow Specification

> **LEGAL NOTICE:** This document is an unapproved draft prepared for review by independent Philippine legal counsel (`GATE-LEGAL-01`), the Privacy Lead (`GATE-PRIV-01`), and the Security Lead (`GATE-AUTH-01`). No production age/liveness vendor may be enabled, and no real-user verification data may be collected, until vendor selection (`DEP-LEGAL-04`) and formal counsel sign-off are complete.

- **Draft Version:** `0.1.0-draft` (20 October 2026)
- **Binding Plan Authorities:** `owner-decisions.md` §3; `docs/plan/Humbble_Execution_Build_Plan_v1.2.md` §V1.2 Amendments `A1` & `A2`, §1.2, §3 (`PR P2-01`, `PR P2-04`, `PR P3-01`, `PR P3-02`), §4.1, §5.

---

## 1. Non-Negotiable Principles (`Owner Decision #3` & `Amendments A1–A2`)

1. **Strict 18+ Adult-Only Service:** Users must be at least **18 years of age** to register, complete onboarding, appear in discovery, swipe, or message on Humbble.
2. **Self-Reported DOB Is Not Proof of Verified Age:** A user-entered `birth_date` at registration acts as an initial entry gate, **not** as proof of independently verified age (`owner-decisions.md` §3). Discovery and swipe eligibility (`record_swipe`) additionally require `verification_status = 'verified'`.
3. **Zero Raw Selfie or Biometric Retention (`Amendment A2`):**
   - Humbble **does not store** raw selfie images, liveness videos, facial geometry vectors, or biometric templates in its PostgreSQL database or Supabase Storage buckets.
   - `public.verification_requests` stores **only**:
     - `provider TEXT`
     - `provider_session_id TEXT`
     - `status verification_state` (`not_started`, `pending`, `verified`, `failed`, `requires_review`; default `not_started`)
     - `attempts INT`
     - `created_at TIMESTAMPTZ`
     - `decided_at TIMESTAMPTZ`
   - Columns `artifact_storage_path` and `artifact_purge_after` and client storage upload policy `storage_verif_insert_own` are **prohibited and removed** (`Amendment A2`).
4. **Birth Date Privacy & Immutability (`Amendment A1`):**
   - `public.profiles.birth_date` is never readable by other users (`SELECT` on `profiles` is owner-scoped; cross-user discovery uses `get_discovery_feed` which projects only calculated age / age-bucket, never raw `birth_date`).
   - Column-level `UPDATE` grants and a `BEFORE UPDATE` trigger on `public.profiles` reject any client attempt to alter `birth_date`, `verification_status`, `is_discoverable`, or `is_suspended` (`Amendment A1`).
5. **Vendor-Independent Adapter & Fail-Closed Production Rule:**
   - The verification subsystem uses a replaceable provider adapter interface.
   - A synthetic/fake test adapter is permitted **only** in local development and automated test suites; production startup must fail closed and reject any test adapter configuration.
   - Commercial vendor selection remains an **open dependency (`DEP-LEGAL-04`)** with zero financial or contractual commitment in Phase 0.

---

## 2. Two-Stage Age & Identity Assurance Architecture

### Stage 1: Registration 18+ Entry Gate (`SCR-04` / `PR P3-01`)
1. **UI Entry Check:** During account registration (`app/auth/signup.tsx` -> `SCR-04`), the user must enter their `birth_date` and affirmatively check the age/terms attestation confirming they are 18 years of age or older.
2. **Client-Side Rejection:** If the entered `birth_date` computes to under 18 years of age relative to the current date, the UI immediately blocks submission without creating a profile record.
3. **Database Constraint Enforcement (`TEST-SEC-01`):** `public.profiles` enforces `CHECK (birth_date <= CURRENT_DATE - INTERVAL '18 years')`. Any attempt to insert a minor's birth date via direct PostgREST/API calls fails with PostgreSQL error `23514` (`check_violation`).
4. **Column Lock (`Amendment A1`):** Once created, `birth_date` cannot be modified by the `authenticated` role; corrections of clerical errors require a verified identity support request reviewed by Trust & Safety (`SCR-24`).

### Stage 2: Liveness & Age Verification State Machine (`SCR-10` / `PR P3-02`)
Before a user can become discoverable (`is_discoverable = true`) or execute swipes (`record_swipe`), their verification status must transition to `verified` via the server-controlled 5-state machine:

| `verification_state` Enum Value | Meaning & System Behavior | Discoverability & Swipe Eligibility (`record_swipe`) | User-Facing UI State (`SCR-10` / `SCR-17`) |
|---|---|---|---|
| `not_started` *(Default)* | User has registered (`18+` DOB check passed) but has not initiated a verification session with the external provider. | **Blocked** (`is_discoverable = false`; `record_swipe` rejected) | Displays pre-verification privacy disclosure, explanation of zero selfie retention by Humbble, and `"Start Verification"` CTA. |
| `pending` | Verification session created (`provider_session_id` recorded) and awaiting signed server callback/webhook from the verification provider. Also used as safe degraded state during provider outage. | **Blocked** | Displays `"Verification in progress"` status banner; prevents duplicate concurrent sessions. |
| `verified` | Trusted server callback/result from the approved provider confirms adult liveness/age check passed. Set exclusively by `service_role` / trusted server function. | **Eligible** (provided profile has 2–6 photos, 3 prompts, and `is_suspended = false`) | Renders `"Verified"` badge (`status.verified` `#1B6B50`) on profile. |
| `failed` | Provider session failed liveness/age check or expired. Increments `attempts` counter. | **Blocked** | Displays clear retry guidance if `attempts < max_attempts`; enforces rate limits and cooldown after repeated failures. |
| `requires_review` | Provider returned an ambiguous signal requiring human Trust & Safety review (`SCR-23`/`SCR-24`) without storing raw biometric templates in Humbble. | **Blocked** until moderator resolves to `verified` or `failed` | Displays `"Your verification is being reviewed by our Trust & Safety team"` with expected review window and support link. |

---

## 3. Rate Limits, Abuse Controls & Human Review Path

1. **Attempt Limits & Cooldowns:**
   - Maximum verification attempts per user: **3 attempts per 24-hour window** (configurable server-side).
   - Exceeding the attempt threshold transitions the request to `requires_review` or imposes a 24-hour cooldown to prevent automated brute-force or spoofing attacks.
2. **Server-Side Result Validation Only:**
   - The client app never sets `verification_status` or `is_discoverable`.
   - Only a cryptographically verified webhook/callback from the configured verification provider (or an audited Trust & Safety moderator action in `SCR-24` logged to `public.audit_events`) can transition `verification_requests.status` and `profiles.verification_status`.
3. **Human Review Path (`requires_review`):**
   - When a session enters `requires_review`, a case is queued in the RBAC-protected Trust & Safety console (`SCR-23`/`SCR-24`).
   - Because Humbble stores **no raw selfies or biometric templates** (`Amendment A2`), human review relies solely on provider-hosted review portals (if authorized by counsel and vendor DPA) or secondary non-biometric verification procedures approved by Philippine legal counsel.

---

## 4. Draft Pre-Verification User Disclosure (`SCR-10` — Counsel Review Required)

> **[DRAFT UI COPY — `SCR-10` (`app/(onboarding)/verify.tsx`)]**
>
> **Verify You're a Real Adult (18+)**
>
> To help keep Humbble safe from fake profiles, bots, and underage accounts, we require a quick liveness and age check before you can discover or match with others.
>
> - **How it works:** You will complete a short live camera check through our verification partner `[VENDOR NAME — TBD UPON DEP-LEGAL-04 APPROVAL]`.
> - **Zero raw selfie storage by Humbble:** Humbble **does not save or store** your verification selfie, video, or facial biometric template in our database or storage servers. We only receive and store the verification result (`not_started`, `pending`, `verified`, `failed`, or `requires_review`), the provider session reference, and timestamps.
> - **Your choice:** Verification is required to unlock discovery and matching. You can cancel at any time before starting, or delete your account in `Settings`.
>
> `[ ] I am at least 18 years old and I consent to the processing of my verification session in accordance with the Privacy Notice.`
>
> **[Continue to Verification]** | **[Not Now — Save Draft Profile]**

---

## 5. Open Counsel & Vendor Review Questions (`GATE-LEGAL-01` / `DEP-LEGAL-04`)

1. **Classification under RA 10173 Section 13:** Confirm the exact consent wording required under Section 13(a) of the Data Privacy Act of 2012 when an external verification provider transiently processes facial/liveness imagery to return a binary/enum age and liveness attestation to Humbble.
2. **Vendor DPA & Zero-Retention SLA:** Confirm the mandatory contractual clauses requiring the selected verification vendor (`DEP-LEGAL-04`) to purge raw images/biometric vectors immediately after session decision (or within a strictly bounded statutory window) and prohibiting the vendor from training external AI models on Humbble user sessions.
3. **Ambiguous Case Handling (`requires_review`):** Advise on the legally compliant mechanism for resolving `requires_review` edge cases (e.g., users aged 18–21 where automated age estimation is inconclusive) without Humbble collecting or storing government ID images or raw selfies in Supabase Storage.
