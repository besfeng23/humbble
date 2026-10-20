DRAFT—COUNSEL REVIEW REQUIRED

# ADR-002: Philippines-Only Initial Market and Conservative Neutral Dating Positioning (`Alternative A`)

- **ADR ID:** `ADR-002`
- **Status:** `DRAFT—COUNSEL REVIEW REQUIRED` *(Approved as binding engineering & product guardrail per Owner Decisions; external legal clearance `GATE-LEGAL-01` remains OPEN / PENDING COUNSEL OPINION)*
- **Date:** 20 October 2026
- **Deciders:** Mark Johnson (Product/Owner — binding planning decisions), Independent Philippine Legal Counsel (`UNAPPOINTED — DEP-LEGAL-01`, required for `GATE-LEGAL-01` sign-off)
- **Work Package:** `PR P0-05`
- **Governing References:**
  - `/workspace/humbble-plan/owner-decisions.md` (§2, §3, §4, §5, §6)
  - `docs/plan/Humbble_Execution_Build_Plan_v1.2.md` (§V1.2 Binding Amendments `A1`–`A6`, §1.2, §3 `PR P0-05`, §4, §5, §6, §8 `GATE-LEGAL-01`, §10)

---

## 1. Context and Problem Statement

Humbble is an Expo / React Native and web dating application being engineered toward an invitation-only pilot and eventual commercial service. Operating an online dating service accessible in the **Republic of the Philippines** implicates strict criminal, regulatory, privacy, and consumer-protection boundaries:

1. **Republic Act No. 10906 (*Anti-Mail Order Spouse Act*, enacted July 21, 2016) & its 2022 Implementing Rules and Regulations (promulgated September 12, 2022):**
   - Section 3 criminalizes any natural or juridical person that directly or indirectly:
     - **(a)** engages in any business or scheme for money, profit, material, economic, or other consideration which has for its purpose the matching or offering of a Filipino to a foreign national for marriage or common-law partnership on a mail-order basis or through personal introduction, email, or websites;
     - **(b)** advertises, publishes, or uses websites to promote such prohibited acts; or
     - **(c)** solicits, enlists, or attracts any Filipino to become a member in any club or association whose objective is to match Filipino nationals to foreign nationals for marriage or common-law partnership.
   - Violations carry severe criminal penalties (15 to 20 years imprisonment, fines of PHP 500,000 to PHP 5,000,000, personal liability of corporate officers, and forfeiture of proceeds).
   - **Statutory Exemption (Section 3, Final Paragraph):** *"The above notwithstanding, legitimate dating websites, which have for their purpose connecting individuals with shared interests in order to cultivate personal and dating relationships, are not covered by this Act."*
2. **Republic Act No. 11862 (*Expanded Anti-Trafficking in Persons Act of 2022*, amending RA 9208):**
   - Section 4(b) criminalizes introducing or matching for money or profit any Filipino to a foreign national for marriage for the purpose of exploitation.
   - Section 9 imposes mandatory duties on internet intermediaries: prohibiting trafficking/exploitation in Terms of Service, blocking/removing unlawful trafficking content within **24 hours** of notice or knowledge, reporting blocked/removed content and unusual traffic data to law enforcement (**DOJ-IACAT**, **PNP**, **NBI**, **DICT-CICC**) within **3 days**, and preserving subscriber information and traffic data for **1 year** from the transaction date (extendable by **1 year** upon formal law-enforcement notice).
3. **Republic Act No. 10173 (*Data Privacy Act of 2012*) & NPC Circular No. 16-03:**
   - Governs collection, proportionality, explicit consent, biometric/sensitive personal information restrictions, cross-border transfers, data-subject erasure/portability rights, and conditional 72-hour breach reporting.
4. **Multi-Jurisdiction Regulatory Complexity:**
   - Launching simultaneously across the Philippines (`PH`), United States (`US`), Canada (`CA`), Australia (`AU`), and United Kingdom (`UK`) prior to independent legal review would multiply statutory obligations (e.g., US ROSCA/state ARLs, UK Online Safety Act, Australian eSafety requirements, Canadian PIPEDA) and heighten cross-border RA 10906 exposure before Philippine counsel has reviewed the baseline product.

---

## 2. Decision

In accordance with `/workspace/humbble-plan/owner-decisions.md` and `docs/plan/Humbble_Execution_Build_Plan_v1.2.md` (§V1.2 Binding Amendments `A1`–`A5`), we adopt and enforce the following architectural and product guardrails across all code, database schemas, APIs, and product copy:

### 2.1 Philippines-Only Initial Market (`PH Only`)
- The initial launch and staged invitation-only pilot (`Phase 6`, up to 1,000 users in controlled stages: internal synthetic -> ~100 invited users -> staged expansion) are restricted strictly to the **Republic of the Philippines (`PH`)**.
- Non-PH markets (`US`, `CA`, `AU`, `UK`) are **disabled at initial launch** and deferred until separately reviewed by counsel and explicitly approved by the Owner.

### 2.2 Conservative, Neutral Shared-Interest Positioning (`Alternative A`)
- Humbble is engineered and marketed strictly as a **conservative, neutral adult (`18+`) dating platform** connecting individuals over shared interests (`shared_interests`), personal conversation prompts (`prompts`), and mutual compatibility.
- **No Marriage-Broker or Catalogue Features (`Alternative B` Rejected):**
  - Zero marriage-broker, mail-order spouse, bride catalogue, or nationality-pairing marketing copy is permitted anywhere in the repository, UI, or external communications.
  - The `relationship_intention` enum is restricted to neutral dating values (`'serious_relationship'`, `'long_term_dating'`, `'cultural_connection_and_dating'`) and **excludes** `'marriage'` and `'international_spouse'`.
  - Discovery ranking (`get_discovery_feed`) prioritizes shared interests, profile prompt completion, and verification status—never asymmetric nationality pairing.
- **100% Free Mutual Messaging & Symmetric Access:**
  - Mutual text messaging between matched users is **100% free** across all tiers (`Plan v1.2` §1.2 Invariant #4).
  - Free safety controls (**Block**, **Report**, **Unmatch**) are unconditionally available to every user.
  - Optional paid features (`Humbble Reserve`) offer identical, symmetric convenience tools (unlimited outgoing likes, viewing the "Liked You" grid, Incognito mode, advanced interest/lifestyle filters) regardless of user gender or nationality.

### 2.3 Strict 18+ Gate, DOB Privacy & Zero Raw Selfie/Biometric Retention (`Amendments A1 & A2`)
- **18+ Enforcement:** Enforced at the UI entry gate (`SCR-04`) and via PostgreSQL constraint `CHECK (birth_date <= CURRENT_DATE - INTERVAL '18 years')` (`TEST-SEC-01`). User-entered `birth_date` is not treated as proof of independently verified age.
- **Hidden DOB & Column Locks (`Amendment A1`):** `public.profiles` revokes table-wide `UPDATE` from `authenticated`, grants column-level `UPDATE` only on safe user-editable profile fields, and enforces a `BEFORE UPDATE` trigger rejecting client changes to `birth_date`, `verification_status`, `is_discoverable`, and `is_suspended`. `birth_date` is never readable by other users; `get_discovery_feed` projects only calculated age/age-bucket, and `record_swipe` verifies both actor and target are `18+`, `verification_status = 'verified'`, `is_discoverable = true`, and `is_suspended = false`.
- **Zero Raw Biometric Storage (`Amendment A2`):** `verification_state` is locked to `('not_started','pending','verified','failed','requires_review')` (default `'not_started'`). `public.verification_requests` stores only `provider`, `provider_session_id`, `status`, `attempts`, `created_at`, and `decided_at`—**no** `artifact_storage_path`, `artifact_purge_after`, raw selfie image, or biometric template, and no client upload policy (`storage_verif_insert_own` removed).

### 2.4 PayPal Sandbox Only & Server-Managed Monthly Plans (`Amendment A5`)
- **Sandbox Only:** Billing operates exclusively in **PayPal Sandbox** until separate written Owner authorization after all legal, security, backup/restore, and operational gates pass.
- **Two Server-Managed Monthly Plans (Never FX-Converted, No Multi-Month Plans):**
  - `PH` market: **`PHP 599.00 / month`** (`₱599.00/month`)
  - `US` market (deferred/disabled at initial PH-only launch): **`USD 29.99 / month`** (`US$29.99/month`)
  - All 3-month (`reserve_3m`) and 6-month (`reserve_6m`) plans are removed (`Amendment A5`).
  - The client never supplies price or currency; `create-subscription` resolves the plan server-side by market.
  - Webhooks (`PAYMENT.SALE.COMPLETED`, subscription events) are cryptographically verified and grant entitlement **only** if the **plan ID, currency, and amount** exactly match the server catalogue (`Amendment A5`).

### 2.5 Unverified Operator & External Counsel Gate (`DEP-LEGAL-01` & `DEP-LEGAL-02`)
- `RED-APPLE TECHNOLOGY AND DIGITAL SERVICES` is treated only as the **proposed operator** pending verification of its registered legal identity and authority; `Banatao Systems` may be used as a product/technology brand. Contracting entity, registration details, and Personal Information Controller (`PIC`) status are explicitly marked **UNRESOLVED** until verified.
- **No Self-Approval:** Engineering completion of code or draft documents never satisfies `GATE-LEGAL-01`. Independent Philippine legal counsel must be appointed by the Owner (`DEP-LEGAL-01`) and issue a formal written legal opinion before any real-user pilot (`Stage B`) or commercial billing activation.

---

## 3. Alternatives Considered

| Option | Summary | Reason for Acceptance or Rejection |
|---|---|---|
| **Alternative A (Selected): Philippines-Only Initial Launch + Neutral Shared-Interest Dating** | Launch initially in `PH` only; neutral shared-interest discovery; exclude `'marriage'` filter enum; 100% free mutual messaging; symmetric monthly convenience tier (`PHP 599.00/mo`); zero raw selfie retention; mandatory Philippine counsel gate (`GATE-LEGAL-01`). | **ACCEPTED (Pending Counsel Confirmation):** Aligns with the legitimate dating website carve-out in **RA 10906 Section 3 (final paragraph)**, minimizes multi-jurisdiction complexity, and eliminates mail-order catalogue mechanics. |
| **Alternative B (Rejected): Nationality-Targeted Cross-Border Marriage Positioning** | Market "Foreign Men & Filipina Women Seeking Marriage"; include explicit `'marriage'` filter tags alongside nationality filtering; monetize cross-border introductions or message unlocking. | **STRICTLY REJECTED / BLOCKED:** Creates severe statutory and criminal exposure under **RA 10906 Section 3(a)–(c)** and **RA 11862 Section 4(b)**. |
| **Multi-Month Subscription Bundles (`reserve_3m`, `reserve_6m`) & Client-Passed Pricing (Rejected)** | Offer 3-month and 6-month plans or FX-converted USD/PHP prices. | **REJECTED (`Amendment A5` & `owner-decisions.md` §4):** Removed to enforce simple, transparent monthly billing (`PHP 599.00/mo` PH; `USD 29.99/mo` deferred US) with strict server-side exact amount/currency validation. |
| **7-Day Raw Selfie Storage in Supabase (`verification_artifacts` bucket) (Rejected)** | Upload user verification selfies to a private Supabase Storage bucket and auto-purge after 7 days. | **REJECTED (`Amendment A2` & `owner-decisions.md` §3):** Storing raw selfies or biometric templates in application storage creates unnecessary sensitive-PII liability under **RA 10173 Sec. 13**. Liveness/age checks run at the external provider; only the 5-state outcome metadata is stored. |

---

## 4. Consequences

### Positive
- Eliminates marriage-broker / catalogue mechanics and marketing before any real user is invited.
- Eliminates biometric/raw-selfie storage risk in Supabase (`Amendment A2`).
- Prevents price tampering, FX rounding drift, and multi-month refund complexity (`Amendment A5`).
- Provides independent Philippine legal counsel with a complete, transparent, non-self-approved review packet (`docs/legal/review-packet.md` and `legal/drafts/*`).

### Negative / Trade-Offs & Blocking Dependencies
- Non-PH markets (`US`, `CA`, `AU`, `UK`) cannot be enabled at initial launch and require separate future legal review and Owner approval.
- Real-user cohort admission (`Stage B`) and live billing (`Phase 7`) remain strictly blocked until the Owner appoints independent Philippine counsel (`DEP-LEGAL-01`), verifies `RED-APPLE TECHNOLOGY AND DIGITAL SERVICES` registration (`DEP-LEGAL-02`), designates a DPO (`DEP-LEGAL-03`), selects/approves a verification vendor (`DEP-LEGAL-04`), and staffs human moderation (`DEP-SAFE-01`).
