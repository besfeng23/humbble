DRAFT—COUNSEL REVIEW REQUIRED

# PR P0-05: Philippine Legal Review Packet & Product Guardrails (`GATE-LEGAL-01`)

- **Document Status:** `DRAFT—COUNSEL REVIEW REQUIRED` (Unapproved Engineering & Product Briefing Packet)
- **Work Package:** `PR P0-05` (Phase 0 — Legal review packet and product guardrails)
- **Governing Authorities in Repo:**
  - `/workspace/humbble-plan/owner-decisions.md` (Owner Decisions, Mark Johnson, 20 October 2026 — binding)
  - `docs/plan/Humbble_Execution_Build_Plan_v1.2.md` (§V1.2 Binding Amendments A1–A6, §0, §1.2, §3 PR P0-05, §4, §5, §6, §8 `GATE-LEGAL-01`, §10)
  - `docs/audit/P0-01.md` (Verified Repository Baseline at `e5bff440a7f0f2f7a11a89f8b01b2985b6990c59`)
- **Primary Launch Jurisdiction:** Republic of the Philippines (`PH`) **only**. United States (`US`), Canada (`CA`), Australia (`AU`), and United Kingdom (`UK`) are **explicitly deferred** until separately reviewed by jurisdiction-specific counsel and approved in writing by the Owner.
- **Self-Approval Prohibition:** Neither the AI coding agent nor engineering contributors may approve, sign off, or waive any item in this packet. `GATE-LEGAL-01` remains **OPEN / BLOCKED** until independent Philippine legal counsel is appointed by the Owner and delivers a written legal opinion.

---

## 1. Executive Purpose & Non-Negotiable Guardrails

This packet consolidates the product architecture, statutory risk posture, draft user-facing disclosures, operational safety workflows, and codebase copy audit for **Humbble** so that **independent Philippine legal counsel** (to be appointed by the Owner) can evaluate the service prior to any real-user pilot (`Phase 6`) or commercial billing activation (`Phase 7`).

### 1.1 Binding Product & Legal Guardrails (Effective Immediately in Code & Copy)
1. **Conservative, Neutral Dating Product (`Alternative A`):**
   - Humbble is positioned strictly as a neutral, adult (`18+`) dating and personal-connection service where individuals connect based on shared interests, personal prompts, and mutual compatibility.
   - **Zero Marriage-Broker or Catalogue Positioning:** No feature, landing page, advertisement, profile field, filter, or paywall may market or operate Humbble as a mail-order spouse service, international marriage broker, or nationality-targeted courtship catalogue under **Republic Act No. 10906** (Anti-Mail Order Spouse Act) or **Republic Act No. 11862** (Expanded Anti-Trafficking in Persons Act of 2022).
   - **Symmetric Mechanics & Free Mutual Messaging:** Mutual text messaging between matched users is **100% free** across all membership tiers. Paid entitlements (`Humbble Reserve`) provide symmetric convenience features only and never gate the ability to introduce, read messages from, or reply to a match based on gender or nationality.
2. **Philippines-Only Initial Market:**
   - The initial launch market is restricted to the **Philippines (`PH`)**. Non-PH markets (`US`, `CA`, `AU`, `UK`) are disabled at initial launch and deferred pending separate legal review and Owner authorization.
3. **Unverified Operator & Contracting Identity (`OPEN DEPENDENCY`):**
   - `RED-APPLE TECHNOLOGY AND DIGITAL SERVICES` is tracked solely as the **proposed operator**, subject to verification of its registered legal identity, DTI/SEC registration, BIR registration, and corporate/contracting authority.
   - `Banatao Systems` may be used only as a product/technology brand.
   - The contracting entity, registered address, registration numbers, Data Protection Officer (DPO) contact, and Personal Information Controller (`PIC`) designation under **RA 10173** remain **UNRESOLVED** until verified by the Owner and Philippine counsel. No draft or UI screen may present an unverified business name as an established legal fact.
4. **Strict 18+ Gate & Zero Raw Selfie / Biometric Retention (`Amendment A2`):**
   - Registration, discovery, and messaging are restricted strictly to adults aged **18 years or older**, enforced at both the UI layer and the PostgreSQL database boundary (`CHECK (birth_date <= CURRENT_DATE - INTERVAL '18 years')`).
   - A user-entered `birth_date` is **not** treated as proof of independently verified age.
   - Exact `birth_date` is never exposed to other users (`Amendment A1`); discovery projections return only a safe age/age-bucket projection.
   - Verification uses a vendor-independent 5-state machine (`not_started`, `pending`, `verified`, `failed`, `requires_review`, default `not_started`).
   - **No raw selfies or biometric templates are retained:** `public.verification_requests` stores only `provider`, `provider_session_id`, `status`, `attempts`, `created_at`, and `decided_at`. There is no `artifact_storage_path`, no `artifact_purge_after`, and no client upload Storage policy for verification artifacts.
5. **PayPal Sandbox Only & Server-Managed Monthly Pricing (`Amendment A5`):**
   - Billing runs in **PayPal Sandbox only**. Live payment processing and production PayPal credentials are disabled until separate written Owner authorization after all gates pass.
   - Pricing is restricted to **two separate, server-managed monthly plans** (never FX-converted and never supplied by the client):
     - **Philippines (`PH`):** `PHP 599.00 / month` (`₱599.00/month`)
     - **United States (`US`):** `USD 29.99 / month` (`US$29.99/month`)
     - **Local monthly prices (Owner decision OWN-PRICE-01, Oct 23 2026, PayPal Sandbox only):** EUR 27.99 (FI, IT, DE, NL, BE, LU, IE), GBP 23.99, SEK 299, NOK 329, CAD 39.99, AUD 44.99, NZD 49.99. *Counsel to confirm the jurisdiction-deferral statements above before any live payments in these markets.*
   - **No multi-month plans:** `reserve_3m`, `reserve_6m`, and all other multi-month bundles are removed (`Amendment A5`).
   - **Settlement-Gated Entitlement:** Entitlements activate only after cryptographically verified `PAYMENT.SALE.COMPLETED` (or verified PayPal REST settlement) where **plan ID, currency, and amount exactly match** the server catalogue. Mismatches are quarantined and alerted without granting access.

---

## 2. Open External Dependencies & Appointment Tracker

None of the dependencies below may be fabricated, self-approved, or assumed by engineering:

| Dependency ID | Required Appointment / Verification | Accountable Owner | Current Status | Blocks |
|---|---|---|---|---|
| **DEP-LEGAL-01** | Appointment of **Independent Philippine Legal Counsel** (qualified in Philippine data privacy, consumer protection, online platforms/intermediaries, dating services/RA 10906/RA 11862, and subscription/payment regulations) | Product / Owner (Mark Johnson) | `OPEN — UNAPPOINTED` | `GATE-LEGAL-01`, Stage B Pilot (`~100` real users), Commercial Launch |
| **DEP-LEGAL-02** | Written verification of `RED-APPLE TECHNOLOGY AND DIGITAL SERVICES` legal registration (DTI/SEC certificate, BIR COR, registered principal office address, authorized signatory) and relationship to product brand `Banatao Systems` | Product / Owner & Philippine Counsel | `OPEN — UNVERIFIED` | Finalization of Terms of Service, Privacy Notice PIC identity, and billing receipts |
| **DEP-LEGAL-03** | Designation and NPC registration (where required) of a **Data Protection Officer (DPO)** under RA 10173 | Product / Owner & Privacy Lead | `OPEN — UNAPPOINTED` | Privacy Notice finalization (`GATE-PRIV-01`, `GATE-LEGAL-01`) |
| **DEP-LEGAL-04** | Selection and privacy/security review of a commercial **Age & Liveness Verification Vendor** (including Data Processing Agreement and cross-border transfer clauses under RA 10173) | Product / Owner, Privacy Lead & Counsel | `OPEN — UNSELECTED` | Production age/liveness verification (`P3-02`, `GATE-AUTH-01`) |
| **DEP-SAFE-01** | Appointment of named **Human Moderation / Trust & Safety Lead**, documented staffed coverage hours, and out-of-band urgent escalation path | Product / Owner | `OPEN — UNAPPOINTED` | `GATE-SAFE-01`, Stage B Pilot (`~100` real users) |
| **DEP-OPS-01** | Appointment of named **Pilot Recruiter / Support Lead** | Product / Owner | `OPEN — UNAPPOINTED` | Stage B Pilot (`~100` real users) |
| **DEP-BILL-01** | Written Owner authorization to enable live PayPal credentials and commercial billing after `GATE-LEGAL-01` through `GATE-ROLL-01` pass | Product / Owner | `OPEN — DISABLED (SANDBOX ONLY)` | Phase 7 live billing (`P7-03`) |

---

## 3. Packet Contents Inventory

All draft legal and policy documents reside under `legal/drafts/` and begin with `DRAFT—COUNSEL REVIEW REQUIRED`:

1. [`legal/drafts/terms-of-service.md`](../../legal/drafts/terms-of-service.md) — Draft Terms of Service (Philippines-only scope, neutral dating, 18+ eligibility, free mutual messaging, RA 10906/11862 prohibitions, Sandbox/monthly subscription terms, liability & dispute resolution placeholders).
2. [`legal/drafts/privacy-notice.md`](../../legal/drafts/privacy-notice.md) — Draft Privacy Notice under RA 10173 (Data Privacy Act of 2012) & IRR (unresolved PIC placeholder, data table inventory, zero raw selfie/biometric retention, hidden `birth_date`, PII-minimized pseudonymous PostHog analytics, cross-border subprocessor placeholders, data subject rights, NPC Circular 16-03 breach policy, logical backup retention).
3. [`legal/drafts/community-standards.md`](../../legal/drafts/community-standards.md) — Draft Community Standards (zero tolerance for human trafficking, mail-order marriage brokering, underage use, romance scams/financial solicitation, harassment, non-consensual content, and impersonation).
4. [`legal/drafts/age-and-verification-flow.md`](../../legal/drafts/age-and-verification-flow.md) — Draft Age Assurance & Verification Flow Specification (18+ UI/DB gate, non-reliance on self-declared DOB as verified age, 5-state `verification_state` enum, zero raw selfie/biometric storage per Amendment A2, manual review/retry, vendor-neutral adapter).
5. [`legal/drafts/consent-map.md`](../../legal/drafts/consent-map.md) — Draft User Consent & Lawful Basis Map (`consent_records` schema mapping, granular opt-in for non-essential analytics/push notifications, separation of contractual core processing from optional consent, withdrawal mechanics).
6. [`legal/drafts/moderation-and-sla.md`](../../legal/drafts/moderation-and-sla.md) — Draft Trust & Safety Moderation Procedures & SLA Specification (free block/report/unmatch, RBAC console & immutable `audit_events`, pilot triage hypothesis of ≥95% within 24h during staffed hours, RA 11862 Sec. 9 24h takedown / 3-day LEA reporting / 1-year preservation workflow).
7. [`legal/drafts/deletion-and-export.md`](../../legal/drafts/deletion-and-export.md) — Draft Account Deletion, Data Export & Retention Schedule (`TEST-PRIV-01`, immediate session revocation and profile/media purge, logical backup rotation within ₱10,000/mo ceiling, reconciliation of RA 10173 erasure with RA 11862 preservation and BIR tax record anonymization).
8. [`legal/drafts/complaints-handling.md`](../../legal/drafts/complaints-handling.md) — Draft Consumer, Privacy & Safety Complaints Handling Procedure (intake channels, acknowledgment/resolution targets, moderation appeals, billing dispute handling, escalation to NPC/DTI/DOJ-IACAT/CICC).
9. [`legal/drafts/subscription-refund-cancellation-disclosures.md`](../../legal/drafts/subscription-refund-cancellation-disclosures.md) — Draft Subscription, Auto-Renewal, Refund & Cancellation Disclosures (PayPal Sandbox only notice, PH `PHP 599.00/mo` and deferred US `USD 29.99/mo` separate monthly plans, no multi-month plans, `PAYMENT.SALE.COMPLETED` settlement rule, 2-click cancellation, refund/reversal revocation).
10. [`docs/legal/product-copy-inventory.md`](./product-copy-inventory.md) — Audited inventory of all existing user-facing strings in the repository (`e5bff440`), prohibited copy patterns, and compliant replacement guardrails.
11. [`docs/adr/ADR-002-philippines-only-and-neutral-dating.md`](../adr/ADR-002-philippines-only-and-neutral-dating.md) — Architecture Decision Record locking Philippines-only launch scope and Alternative A neutral dating positioning.

---

## 4. Specific Legal Questions Requiring Counsel Opinion (`GATE-LEGAL-01`)

Independent Philippine counsel is requested to provide a formal written memorandum addressing:

1. **RA 10906 (Anti-Mail Order Spouse Act) & 2022 IRR Exemption Sufficiency (`LGL-01`):**
   - Confirm whether Humbble's **Alternative A** design—neutral shared-interest discovery,Philippines-only initial launch, exclusion of `'marriage'` from `relationship_intention` enums (`'serious_relationship'`, `'long_term_dating'`, `'cultural_connection_and_dating'`), 100% free mutual messaging, and symmetric premium convenience tiers—falls squarely within the legitimate dating website exemption under **Section 3 (final paragraph) of RA 10906**.
   - Advise whether any Commission on Filipinos Overseas (**CFO**) or DSWD/IACAT educational safety banners or disclosures are recommended or required inside the app.
   - Advise on the legal risks if non-PH markets (`US`, `CA`, `AU`, `UK`) are later enabled in Phase 7 alongside separate market pricing (`PH PHP 599.00/month` vs. `US USD 29.99/month`).
2. **RA 11862 Section 9 Intermediary Duties vs. RA 10173 Data Minimization (`LGL-02`, `LGL-03`):**
   - Reconcile the mandatory internet-intermediary duty under **Section 9 of RA 11862** (preserving subscriber information and traffic data for 1 year from transaction date, extendable by 1 year on LEA notice; 24-hour blocking/removal of unlawful trafficking content; 3-day reporting to DOJ/PNP/NBI/DICT-CICC) with the right to erasure and data minimization under **RA 10173**.
   - Confirm the exact scope of "subscriber information and traffic data" that must be retained when a user deletes an account without an active abuse flag versus when an account is subject to a Trust & Safety report or law-enforcement preservation notice.
3. **RA 10173 (Data Privacy Act of 2012) & Zero-Biometric Verification Architecture (`LGL-03`):**
   - Review the `Amendment A2` verification architecture (where liveness/age checks execute at an external provider and Humbble persists only `provider, provider_session_id, status, attempts, created_at, decided_at` with zero raw selfie or biometric template storage in Supabase).
   - Specify the mandatory Data Processing Agreement (DPA) / cross-border data transfer clauses required before selecting a verification vendor or cloud subprocessor (Supabase, Vercel, PostHog, PayPal, email provider).
   - Confirm the conditional 72-hour breach notification workflow under **NPC Circular No. 16-03**.
4. **Operator Identity, Contracting Authority & Tax/Consumer Disclosures (`DEP-LEGAL-02`, `LGL-04`):**
   - Verify the registration status and contracting authority of `RED-APPLE TECHNOLOGY AND DIGITAL SERVICES` and use of the `Banatao Systems` brand under Philippine DTI/SEC rules, the Consumer Act (**RA 7394**), the E-Commerce Act (**RA 8792**), and the Internet Transactions Act of 2023 (**RA 11967**).
   - Review the `PHP 599.00/month` subscription disclosure, tax/VAT treatment, auto-renewal consent mechanics, and cancellation/refund policy under Philippine consumer protection law.

---

## 5. Master Checklist: Mapping Every User Journey & Public Claim to Counsel Review Items

This checklist maps every planned user journey (`SCR-01` through `SCR-24` and backend RPCs/webhooks) and every public or in-app claim to its corresponding draft legal document, statutory authority, and counsel sign-off item.

| Checklist ID | User Journey / Public Claim | Repo Surface / Target Screen & RPC | Statutory / Policy Authority | Mapped Packet Document(s) | Counsel Review Question & Sign-Off Status |
|---|---|---|---|---|---|
| **CHK-JRN-01** | **Public Landing & Brand Positioning:** Claims Humbble is a respectful, adult (`18+`) shared-interest dating community in the Philippines; no marriage-broker, catalogue, or nationality-pairing promises. | `README.md`, `SCR-01` (`app/(public)/index.tsx`), `ADR-002` | RA 10906 Sec. 3; 2022 IRR; RA 7394 | `docs/adr/ADR-002-philippines-only-and-neutral-dating.md`, `docs/legal/product-copy-inventory.md`, `legal/drafts/terms-of-service.md` | Verify landing & repo copy contains zero prohibited solicitation under RA 10906 Sec. 3(a)–(c). **Status:** `PENDING COUNSEL REVIEW` |
| **CHK-JRN-02** | **Operator & Brand Attribution:** Displays operator identity (`RED-APPLE TECHNOLOGY AND DIGITAL SERVICES`, if verified) and brand (`Banatao Systems`) in legal footers and notices. | `SCR-01`, `SCR-03`, `SCR-20`, `SCR-21` | RA 11967 (Internet Transactions Act); RA 8792; RA 10173 | `legal/drafts/terms-of-service.md`, `legal/drafts/privacy-notice.md` | Verify DTI/SEC/BIR registration and PIC designation before removing `[UNVERIFIED OPERATOR PLACEHOLDER]`. **Status:** `BLOCKED ON DEP-LEGAL-02` |
| **CHK-JRN-03** | **Account Registration & 18+ Entry Gate:** Requires affirmative `birth_date` check (`>= 18` years) and separate, interactive links/checkboxes for Terms of Service and Privacy Notice before creating an account. | `app/auth/signup.tsx` (`SCR-04`), `public.profiles` (`TEST-SEC-01`) | RA 10173 Sec. 3(b), 12; RA 11862; Apple/Google UGC rules | `legal/drafts/terms-of-service.md`, `legal/drafts/age-and-verification-flow.md`, `legal/drafts/consent-map.md` | Approve signup consent wording, checkbox separation, and 18+ age representation clause. **Status:** `PENDING COUNSEL REVIEW` |
| **CHK-JRN-04** | **Birth Date Privacy & Safe Age Projection:** User's exact `birth_date` is write-locked after creation (`Amendment A1` trigger) and never exposed to other users; only calculated age / age-bucket is shown in discovery. | `public.profiles`, `get_discovery_feed` RPC (`API-01`), `SCR-11`, `SCR-12` | RA 10173 Sec. 11 (Data Minimization & Proportionality) | `legal/drafts/privacy-notice.md`, `legal/drafts/age-and-verification-flow.md` | Confirm DOB masking satisfies RA 10173 proportionality principles. **Status:** `PENDING COUNSEL REVIEW` |
| **CHK-JRN-05** | **Progressive Onboarding & Relationship Intentions:** Collects display name, city/region, 2–6 photos, 3 prompts, shared interests, and `relationship_intention` restricted to neutral dating values (excluding `'marriage'`). | `SCR-07`, `SCR-08`, `SCR-09`, `public.profiles`, `public.profile_photos` | RA 10906 Sec. 3; RA 10173 | `docs/adr/ADR-002-philippines-only-and-neutral-dating.md`, `legal/drafts/community-standards.md`, `legal/drafts/privacy-notice.md` | Confirm allowed enum values for `relationship_intention` and profile prompt guidelines. **Status:** `PENDING COUNSEL REVIEW` |
| **CHK-JRN-06** | **Age & Liveness Verification (Zero Biometric Retention):** Runs liveness/age check via external provider adapter; stores only 5-state status (`not_started`, `pending`, `verified`, `failed`, `requires_review`) and session metadata (`Amendment A2`). | `SCR-10`, `public.verification_requests` | RA 10173 Sec. 13 (Sensitive Personal Information); NPC issuances | `legal/drafts/age-and-verification-flow.md`, `legal/drafts/privacy-notice.md`, `legal/drafts/consent-map.md` | Review zero-retention verification notice and approve vendor DPA requirements prior to vendor enablement. **Status:** `PENDING COUNSEL REVIEW & DEP-LEGAL-04` |
| **CHK-JRN-07** | **Discovery, Filtering & Daily Free Like Quota:** Server-filtered feed (`get_discovery_feed`) and atomic swipe RPC (`record_swipe` with 15 free likes/day hypothesis and actor/target verification checks per `Amendment A1`). | `app/(tabs)/people.tsx`, `app/(tabs)/discover.tsx`, `SCR-11`–`SCR-13`, `API-01`, `API-02` | RA 10906 Sec. 3; RA 7394 (Deceptive Sales Practices) | `legal/drafts/terms-of-service.md`, `docs/legal/product-copy-inventory.md` | Confirm replacement of mock `DB/userDB.tsx` cards and fairness of daily free like quota disclosure. **Status:** `PENDING COUNSEL REVIEW` |
| **CHK-JRN-08** | **Incoming Likes ("Liked You") & Upsell Claims:** Free tier shows truthful incoming like count only (no fabricated blurred profile cards); removes unimplemented "Spotlight 30 minutes" claims unless built and approved. | `app/(tabs)/index.tsx` (`SCR-14`), `app/(tabs)/profile.tsx` | RA 7394 Art. 50, 110 (False/Misleading Advertising); FTC Act Sec. 5 | `docs/legal/product-copy-inventory.md`, `legal/drafts/subscription-refund-cancellation-disclosures.md` | Audit all upsell strings to eliminate unbuilt feature promises ("Spotlight", "Compliments"). **Status:** `PENDING COUNSEL REVIEW` |
| **CHK-JRN-09** | **Mutual Match & 100% Free Text Messaging:** Matched adults exchange real-time text messages (`send_message`) at zero cost; in-chat safety banners warn against off-platform money transfers or financial solicitation. | `app/(tabs)/(chats)/index.tsx`, `chatScreen.tsx` (`SCR-15`, `SCR-16`), `API-03` | RA 10906 Sec. 3; RA 11862 | `legal/drafts/terms-of-service.md`, `legal/drafts/community-standards.md`, `legal/drafts/moderation-and-sla.md` | Confirm free mutual messaging covenant and in-chat anti-scam warning copy. **Status:** `PENDING COUNSEL REVIEW` |
| **CHK-JRN-10** | **Unconditional Block, Report & Unmatch Controls:** One-tap block, report, and unmatch available free to all users on every profile and chat; block immediately severs visibility and messaging in both directions. | `SCR-12`, `SCR-16`, `SCR-22`, `block_user` (`API-04`), `submit_report` | RA 11862 Sec. 9; Apple Guideline 1.2; Google Play UGC Policy | `legal/drafts/community-standards.md`, `legal/drafts/moderation-and-sla.md`, `legal/drafts/complaints-handling.md` | Review report categories, user confirmation notices, and anti-retaliation protections. **Status:** `PENDING COUNSEL REVIEW` |
| **CHK-JRN-11** | **Trust & Safety Triage, SLA Hypothesis & RA 11862 Takedown:** Moderator console (`SCR-23`, `SCR-24`) with RBAC and `audit_events`. Pilot target: ≥95% human triage within 24h during staffed hours (hypothesis, not public guarantee); 24h takedown & 3-day LEA report for trafficking content. | `SCR-23`, `SCR-24`, `public.reports`, `public.moderation_cases`, `public.audit_events` | RA 11862 Sec. 9; RA 10173 | `legal/drafts/moderation-and-sla.md`, `legal/drafts/complaints-handling.md` | Approve LEA escalation protocol, evidence preservation scope, and public safety copy so internal targets are not misstated as guarantees. **Status:** `PENDING COUNSEL REVIEW & DEP-SAFE-01` |
| **CHK-JRN-12** | **PayPal Sandbox Checkout, Monthly Pricing & Settlement Rule:** Server-managed monthly plans (`PH → PHP 599.00/mo`; deferred `US → USD 29.99/mo`; no multi-month plans). Sandbox-only banner. Entitlement granted only after verified `PAYMENT.SALE.COMPLETED` with exact plan/currency/amount match (`Amendment A5`). | `app/(tabs)/profile.tsx`, `SCR-02`, `SCR-20`, `SCR-21`, `API-05`–`API-07` | RA 7394; RA 11967; ROSCA (15 U.S.C. §§ 8401–8405) for deferred US | `legal/drafts/subscription-refund-cancellation-disclosures.md`, `legal/drafts/terms-of-service.md`, `docs/legal/product-copy-inventory.md` | Review auto-renewal disclosure, Sandbox testing disclaimer, cancellation effective date, and refund/reversal rules. **Status:** `PENDING COUNSEL REVIEW` |
| **CHK-JRN-13** | **PII-Minimized Pseudonymous Analytics (PostHog):** Replaces README "No tracking" claim with accurate disclosure of opt-in, server-salted HMAC-SHA256 pseudonymous analytics (`$ip: null`, strict property allowlist, no chat/DOB/PII). | `README.md`, `SCR-04`, `SCR-18`, `public.consent_records` | RA 10173 Sec. 11, 12, 16; NPC Advisory Opinions | `legal/drafts/privacy-notice.md`, `legal/drafts/consent-map.md`, `docs/legal/product-copy-inventory.md` | Confirm analytics consent opt-in UX and accurate description of pseudonymous telemetry. **Status:** `PENDING COUNSEL REVIEW` |
| **CHK-JRN-14** | **Self-Service Data Export, Account Deletion & Retention Holds:** Two-step re-authenticated deletion (`SCR-19`, `API-08`) immediately revokes sessions and purges profile/photos, while preserving required anonymized financial logs (`subscriptions.user_id = NULL`), `audit_events`, and RA 11862 holds. | `SCR-19`, `API-08`, `public.privacy_requests`, logical backups (`Amendment A5`) | RA 10173 Sec. 16(e); RA 11862 Sec. 9; NIRC (BIR tax rules); Apple Guideline 5.1.1(v) | `legal/drafts/deletion-and-export.md`, `legal/drafts/privacy-notice.md` | Reconcile statutory retention periods (1-yr RA 11862, BIR tax retention, logical backup rotation) with RA 10173 erasure rights. **Status:** `PENDING COUNSEL REVIEW` |
| **CHK-JRN-15** | **Complaints, Appeals & Regulatory Redress:** Structured user workflow for service complaints, moderation appeals, privacy requests, and billing disputes, with escalation paths to NPC, DTI, and DOJ-IACAT. | `SCR-03`, `SCR-18`, `SCR-21`, support channels | RA 10173; RA 7394; RA 11967 | `legal/drafts/complaints-handling.md`, `legal/drafts/terms-of-service.md` | Confirm mandatory Philippine regulatory contact disclosures and dispute resolution timelines. **Status:** `PENDING COUNSEL REVIEW` |

---

## 6. Verification & Sign-Off Block (Do Not Fill In Until Counsel Is Appointed)

- **Independent Philippine Legal Counsel Name & Firm:** `[UNAPPOINTED — OWNER TO DESIGNATE]`
- **IBP Roll No. / PTR / MCLE Compliance Reference:** `[UNAPPOINTED]`
- **Contracting Entity / PIC Legal Name (Owner-provided, counsel to verify):** JDR Blast Media, 3409 Spectrum Midway, Filinvest City, Alabang, Muntinlupa City, Metro Manila 1781, Philippines
- **Support & Appeals Contact (Owner-provided):** markjohnsonbanatao888@gmail.com · +639681841001
- **Counsel Written Opinion Reference & Date:** `[NONE — GATE-LEGAL-01 OPEN]`
- **Owner Authorization Signature (Mark Johnson):** `[PENDING COUNSEL OPINION]`
