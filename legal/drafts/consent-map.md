DRAFT—COUNSEL REVIEW REQUIRED

# Humbble — Draft User Consent & Lawful Basis Map

> **LEGAL NOTICE:** This document is an unapproved draft prepared for review by independent Philippine legal counsel (`GATE-LEGAL-01`) and the Privacy Lead (`GATE-PRIV-01`). It maps every personal data processing activity in Humbble to its proposed lawful basis under the Philippine Data Privacy Act of 2012 (**RA 10173**), user-facing consent surface, database persistence in `public.consent_records`, and withdrawal mechanism.

- **Draft Version:** `0.1.0-draft` (20 October 2026)
- **Statutory Authority:** Republic Act No. 10173 (Sections 3(b), 11, 12, 13, and 16) and its 2016 IRR
- **Binding Plan References:** `owner-decisions.md` §2, §3, §4; `docs/plan/Humbble_Execution_Build_Plan_v1.2.md` §V1.2 Amendments `A1`, `A2`, `A5`, §4.1 (`public.consent_records`), §5.

---

## 1. Governing Consent Principles (`RA 10173` Alignment)

1. **Definition of Consent (RA 10173 Sec. 3(b)):** Whenever consent is relied upon as the lawful basis, it must be a **freely given, specific, informed indication of will**, evidenced by written, electronic, or recorded means. Passive "by continuing to use this app" text (such as the legacy non-interactive string in `app/auth/signup.tsx:221-227`) is **rejected** and must be replaced with explicit, interactive checkboxes and versioned records in `public.consent_records`.
2. **Separation of Core Service Contract vs. Optional Processing:**
   - Core dating functions (account authentication, 18+ age check, profile display to eligible users, mutual matching, free text messaging, and safety block/report tools) are grounded in **contract performance (RA 10173 Sec. 12(b))** and **legal obligation (Sec. 12(c) / RA 11862)**, paired with explicit acknowledgment at registration.
   - **Non-essential analytics (`PostHog`)** and **push notifications** are strictly **opt-in (`default = false`)** and **never bundled** as a condition for creating an account, matching, messaging, or using safety controls (`docs/plan/Humbble_Execution_Build_Plan_v1.2.md` §5).
3. **Immutable Consent Ledger (`public.consent_records`):**
   - Every affirmative consent grant or withdrawal writes an append-only row to `public.consent_records` recording:
     - `id UUID`
     - `user_id UUID`
     - `consent_type TEXT` (allowlisted enum/code)
     - `policy_version TEXT` (e.g., `'tos-v0.1.0'`, `'privacy-v0.1.0'`)
     - `granted BOOLEAN`
     - `recorded_at TIMESTAMPTZ`
     - `surface TEXT` (e.g., `'SCR-04'`, `'SCR-10'`, `'SCR-18'`, `'SCR-20'`)
   - Per `Amendment A1`, users have an explicit `SELECT` policy to inspect their own `consent_records` rows, and client roles cannot `UPDATE` or `DELETE` historical consent entries.

---

## 2. Canonical Consent & Lawful Basis Matrix

| Consent / Processing ID | Processing Activity | Data Categories Involved | Proposed Lawful Basis under RA 10173 | UI Surface & Interaction | Required vs. Optional | Withdrawal / Revocation Path & Effect |
|---|---|---|---|---|---|---|
| **CNS-01** | **Account Registration, 18+ Age Attestation & Terms Acceptance** | Email, hashed password, `display_name`, `birth_date` (`>= 18` years) | **Sec. 12(b)** (Contract) & **Sec. 12(c)** (Legal obligation for adult-only platform); **Sec. 12(a)** affirmative agreement | `SCR-04` (`app/auth/signup.tsx`): Unchecked affirmative checkbox + clickable modal/page links to Terms of Service & Privacy Notice | **Required** for account creation | Self-service account deletion in `SCR-19` (`API-08`) terminates the contract and purges profile/PII per retention schedule. |
| **CNS-02** | **Core Dating Profile & Photo Publication** | `city_region`, `occupation`, `education_level`, `languages_spoken`, `shared_interests`, `relationship_intention` (neutral), 3 `prompts`, 2–6 `profile_photos` | **Sec. 12(b)** (Contract) & **Sec. 12(a) / Sec. 13(a)** (Explicit user action uploading profile attributes for adult discovery) | `SCR-07`, `SCR-08`, `SCR-09` (Onboarding) & `SCR-17` (Profile Editor) | **Required** to become discoverable (`is_discoverable = true`); user may save incomplete draft (`is_discoverable = false`) | User can edit/remove optional fields, toggle Incognito (if entitled), or delete account in `SCR-19`. |
| **CNS-03** | **External Age & Liveness Verification Session (`Zero Biometric Retention`)** | Transient live camera check at external provider (`DEP-LEGAL-04`); Humbble stores only `provider`, `provider_session_id`, `status` (5-state enum), `attempts`, `created_at`, `decided_at` (`Amendment A2`) | **Sec. 13(a)** (Explicit consent prior to verification check) & **Sec. 12(f)** (Preventing underage access and fraud) | `SCR-10` (`app/(onboarding)/verify.tsx`): Explicit pre-verification checkbox disclosing zero raw selfie/biometric storage by Humbble | **Required** for discovery & swiping (`record_swipe` requires `verification_status = 'verified'`); user may decline and keep account undiscoverable or delete account | Declining before session starts leaves status as `not_started`. Deleting account (`SCR-19`) purges `verification_requests` metadata unless under an active fraud/safety hold. |
| **CNS-04** | **PII-Minimized Pseudonymous Product Analytics (`PostHog`)** | Server-salted HMAC-SHA256 `analytics_id`, allowlisted funnel event names, non-PII counts/booleans (`$ip: null`, no chat/DOB/email/GPS) | **Sec. 12(a)** (Explicit opt-in consent) | `SCR-04` / Onboarding privacy banner & `SCR-18` (`Settings`): Separate, **unchecked-by-default** toggle | **Strictly Optional** (Default: **OFF** / memory-only opt-out mode; never blocks core dating or safety features) | One-tap toggle in `SCR-18` (`Settings -> Privacy Controls`) writes `granted = false` to `consent_records` and immediately halts `posthog.capture()`. |
| **CNS-04a** | **Anonymous Pre-Signup Quiz Funnel Events (`public.quiz_events`) — `COUNSEL REVIEW REQUIRED`** | Random client-generated session UUID, quiz event name, step, allow-listed answer enum, ISO country code, optional ad-network slug/click ID/sub-IDs; **no IP, no user ID, no account link** | **Sec. 11 / Sec. 12(f)** (legitimate purpose, proportionality) on the basis that the data is non-identifying; **if counsel disagrees, treat as CNS-04 (Sec. 12(a) opt-in)** | No banner today. Client honors Do Not Track / Global Privacy Control and the `EXPO_PUBLIC_QUIZ_ANALYTICS=0` build kill-switch | **Optional** (never blocks the quiz or signup) | Clear site storage to drop the session ID; server rows auto-purge after 90 days. The session is deliberately **not linked** to the user at signup because CNS-04 consent is absent for anonymous visitors. |
| **CNS-05** | **Push Notifications (`Matches, Messages & Safety Alerts`)** | Expo push token, notification category preference (no sensitive message body in push payload by default per `PR P3-06`) | **Sec. 12(a)** (Explicit opt-in consent via OS permission + in-app toggle) | `SCR-18` (`Settings`) & OS permission prompt (if `PR P3-06` is included in launch scope) | **Strictly Optional** (Default: **OFF** until user opts in) | Revocable at any time in `SCR-18` or device OS settings; invalid/revoked tokens are removed from the server. |
| **CNS-06** | **Monthly Subscription & Auto-Renewal (`Humbble Reserve` — Sandbox Only)** | Server-resolved plan (`PH PHP 599.00/mo`; deferred `US USD 29.99/mo`), PayPal subscription ID, `payment_events` | **Sec. 12(b)** (Contract) & **Sec. 12(c)** (Consumer/tax compliance under RA 7394, RA 11967, NIRC, and ROSCA for deferred US) | `SCR-20` (`app/(paywall)/upgrade.tsx`): Explicit unchecked auto-renewal & monthly price disclosure checkbox prior to PayPal Sandbox redirect | **Optional** (Required only if upgrading to `Humbble Reserve`; basic mutual messaging & safety tools are always free) | Cancel auto-renewal at any time in `SCR-21` (`Billing Settings`, 2-click flow) or via PayPal; stops future recurring charges while retaining access until `current_period_end`. |
| **CNS-07** | **Safety Reporting, Blocking & Statutory Preservation (`RA 11862`)** | `blocks`, `reports`, `moderation_cases`, `audit_events`, and flagged message/traffic metadata | **Sec. 12(c) & Sec. 13(b)/(f)** (Mandatory statutory compliance with **RA 11862 Sec. 9** & user safety protection — **not** dependent on abuser consent) | `SCR-12`, `SCR-16`, `SCR-22` (`Report Modal`) | **Mandatory Safety Function** (Cannot be opted out of by a reported user) | Block can be managed by the blocker in `SCR-18`. Statutory preservation under RA 11862 Sec. 9 overrides deletion for flagged accounts for 1 year (extendable by 1 year on LEA notice). |

---

## 3. Policy Versioning & Re-Consent Rules

1. **Semantic Versioning of Legal Texts:** Every material update to the Terms of Service (`tos`), Privacy Notice (`privacy_notice`), Community Standards (`community_standards`), or Subscription Disclosures (`subscription_terms`) increments the `policy_version` string and effective date.
2. **Material Change Prompt:** If counsel approves a material change to processing purposes, subprocessors, or user rights, authenticated users are presented with a clear summary of changes upon next app open and must record an updated `consent_records` entry before continuing discovery.
3. **Auditability:** During `GATE-PRIV-01` and `GATE-LEGAL-01` verification, automated tests verify that:
   - Unchecked registration consent boxes block account creation;
   - Analytics telemetry never fires when `CNS-04` is absent or `granted = false`; and
   - Every consent state transition inserts a new timestamped row into `public.consent_records`.

---

## 4. Open Items for Independent Philippine Counsel (`GATE-LEGAL-01`)

1. **Bundled vs. Granular Registration Consent (`CNS-01`):** Confirm whether Philippine NPC guidance requires separate checkboxes for (a) Terms of Service + 18+ age attestation and (b) Privacy Notice acknowledgment on `SCR-04`, or whether two distinct checkboxes alongside an optional third checkbox for analytics (`CNS-04`) is optimal.
2. **Sensitive Personal Information (`RA 10173 Sec. 13`) in Profile Fields:** Confirm whether any optional profile fields (`education_level`, `languages_spoken`, or prompt text) require specific Section 13(a) consent phrasing in `CNS-02`.
