DRAFT—COUNSEL REVIEW REQUIRED

# Humbble — Draft Privacy Notice (Philippine Data Privacy Act of 2012 / RA 10173)

> **LEGAL NOTICE:** This Privacy Notice is an unapproved draft prepared for review by independent Philippine legal counsel (`GATE-LEGAL-01`) and the Privacy Lead (`GATE-PRIV-01`). It must not be published or relied upon for processing real user personal data until counsel verifies the Personal Information Controller (`PIC`) identity, Data Protection Officer (`DPO`) registration, subprocessor Data Processing Agreements (`DPAs`), and retention schedules.

- **Draft Version:** `0.1.0-draft` (20 October 2026)
- **Primary Statutory Authority:** Republic Act No. 10173 (*Data Privacy Act of 2012*), its 2016 Implementing Rules and Regulations (IRR), and National Privacy Commission (NPC) issuances (including **NPC Circular No. 16-03** on Personal Data Breach Management).
- **Initial Launch Scope:** Republic of the Philippines (`PH`) only (`US`, `CA`, `AU`, `UK` deferred).

---

## 1. Personal Information Controller (`PIC`) & Data Protection Officer (`DPO PENDING — COUNSEL REVIEW REQUIRED`)

1.1 **PIC Identity:** Under Republic Act No. 10173, the Personal Information Controller (`PIC`) responsible for personal data processed through **Humbble** (technology brand **Banatao Systems**, which is not a legal entity) is:
- **Operator / PIC:** JDR Blast Media
- **Registered Address:** 3409 Spectrum Midway, Filinvest City, Alabang, Muntinlupa City, Metro Manila 1781, Philippines
- **Privacy & Support Contact (until a DPO is appointed):** [markjohnsonbanatao888@gmail.com](mailto:markjohnsonbanatao888@gmail.com) · [+639681841001](tel:+639681841001)
- **Designated Data Protection Officer (DPO):** `[UNAPPOINTED — OWNER TO APPOINT DPO PRIOR TO REAL-USER PILOT]`
- **DPO Email & Contact Channel:** `[TBD UPON DPO APPOINTMENT]`
- **NPC Registration Status:** `[TBD — COUNSEL TO ASSESS MANDATORY NPC REGISTRATION THRESHOLDS UNDER NPC CIRCULAR NO. 2022-04]`

> **Guardrail:** Until the Owner and Philippine legal counsel verify the registered legal entity and appoint a DPO, Humbble operates using **synthetic test data only** (`Stage A`). No real user personal data may be collected in local or development environments.

---

## 2. Categories of Personal Data We Collect, Purpose & Lawful Basis

We adhere to the principles of **transparency, legitimate purpose, and proportionality** under Section 11 of RA 10173. Below is our canonical data inventory mapped to the 19 target PostgreSQL tables (`docs/plan/Humbble_Execution_Build_Plan_v1.2.md` §4.1):

| Data Category & Database Table(s) | Specific Fields Collected | Purpose of Processing | Lawful Basis under RA 10173 (Sec. 12 / Sec. 13) | Cross-User Visibility & Access Boundary |
|---|---|---|---|---|
| **Account & Authentication** (`auth.users`, `public.profiles`) | Email address, hashed password (managed by Supabase Auth), `display_name` (2–40 chars), `birth_date` (adult `18+` check), account timestamps | Account creation, authentication, session recovery, and enforcing the mandatory `18+` age gate | Contract performance (Sec. 12(b)); Legal obligation for adult-only safety (Sec. 12(c) / Sec. 13(b)) | Email is never shown to other users. **Exact `birth_date` is never readable by other users (`Amendment A1`)**; other users see only calculated age / age-bucket via `get_discovery_feed`. |
| **Profile & Shared-Interest Attributes** (`public.profiles`, `public.user_preferences`) | `city_region`, `occupation`, `education_level`, `languages_spoken`, `shared_interests`, `relationship_intention` (neutral values only), 3 structured `prompts`, `is_incognito`, age/matching preferences | Populating your dating profile and matching you with compatible adults who share your interests | Contract performance (Sec. 12(b)) & explicit user consent for optional profile fields (Sec. 12(a) / Sec. 13(a)) | Visible only to eligible, authenticated `18+` users via `get_discovery_feed` when `is_discoverable = true` and not blocked (`blocks`). Preferences are private to you. |
| **Country** (`public.profiles.country_code`) | ISO 3166-1 country code you choose in onboarding or Settings (pre-filled from your device locale) | Showing and charging the correct local monthly price for your market | Contract performance (Sec. 12(b)) | Private to you and the billing service. Not shown in discovery. You can change it at any time in Settings. |
| **Profile Photos** (`public.profile_photos`, Supabase Storage `profile_photos` bucket) | 2 to 6 user-uploaded profile photographs (JPEG/PNG/WebP), display order `1–6`, storage object path | Displaying your profile to eligible users in discovery and mutual matches | Contract performance (Sec. 12(b)) & user consent (Sec. 12(a)) | Stored in owner-scoped paths (`auth.uid()` folder) with signed URLs; accessible only to eligible authenticated users. |
| **Age & Liveness Verification Status (`ZERO RAW BIOMETRIC STORAGE`)** (`public.verification_requests`) | `provider`, `provider_session_id`, `status` (`not_started`, `pending`, `verified`, `failed`, `requires_review`), `attempts`, `created_at`, `decided_at` | Preventing underage (`<18`) access, catfishing, and automated bot abuse | Legal obligation & protection of users (Sec. 12(c), (f); Sec. 13(a) explicit consent prior to provider session) | **Humbble does NOT collect or retain raw selfie photos, video streams, or biometric templates (`Amendment A2`).** Other users see only whether a profile holds a `verified` badge. |
| **Discovery, Swipes & Matches** (`public.swipes`, `public.daily_swipe_quotas`, `public.matches`) | Actor ID, target ID, swipe direction (`like`/`pass`), daily free-like quota counter (`likes_used`), canonical match pair (`user_a_id < user_b_id`) and match status | Enforcing the daily free like limit (15/day hypothesis) and creating mutual matches | Contract performance (Sec. 12(b)) | Private to actor (`swipes`, `daily_swipe_quotas`) or matched pair (`matches`). |
| **Mutual Match Messaging** (`public.conversations`, `public.conversation_participants`, `public.messages`) | Conversation ID, participant IDs, message `body` (1–2,000 chars), timestamps | Delivering free real-time text chat between mutually matched adults | Contract performance (Sec. 12(b)) | Strictly restricted via RLS (`messages_select_participant`) to active conversation participants; inspected by Trust & Safety moderators **only** if attached to a user-submitted abuse report (`reports`). |
| **Safety, Blocking & Moderation** (`public.blocks`, `public.reports`, `public.moderation_cases`, `public.audit_events`) | Blocker/blocked IDs, reporter/reported IDs, report category, minimal context, moderation case status/decision, immutable moderator audit logs | Protecting user safety, enforcing Community Standards, and complying with RA 11862 Section 9 intermediary duties | Legal obligation under **RA 11862 Sec. 9** (Sec. 12(c) / Sec. 13(b)) & legitimate interest in platform safety (Sec. 12(f)) | `reports` visible only to the submitting reporter and authorized Trust & Safety role (`Amendment A1`). `audit_events` are append-only. |
| **Subscription & Billing Records** (`public.billing_plans`, `public.subscriptions`, `public.entitlements`, `public.payment_events`) | PayPal subscription ID, server-resolved plan (`premium_monthly_ph` PHP 599.00/mo or `premium_monthly_us` USD 29.99/mo), billing period dates, premium entitlement status/period (`public.entitlements`), webhook event ID (`payment_events.provider_event_id`, unique) and SHA-256 hash of the webhook body (raw body not stored), settlement status | Processing optional `Humbble Reserve` monthly subscriptions (currently **PayPal Sandbox only**) and tax/financial accounting | Contract performance (Sec. 12(b)) & tax/financial compliance (Sec. 12(c)) | Humbble never stores raw credit card numbers or bank credentials; payment instruments are handled directly by PayPal. |
| **Consent & Privacy Requests** (`public.consent_records`, `public.privacy_requests`) | Policy version, consent type, granted/withdrawn boolean, timestamp; data export or account deletion request status | Demonstrating compliance with RA 10173 consent and data-subject rights | Legal obligation under RA 10173 (Sec. 12(c)) | Readable by the user for their own records (`Amendment A1`); immutable compliance log. |
| **Anonymous Quiz Analytics** (`public.quiz_events`) — only if enabled in the app build | A random session ID generated on your device (not derived from your device, browser, or IP address), the quiz event name (`quiz_started`, `quiz_step`, `quiz_completed`, `quiz_cta_clicked`), the step number, the answer you picked from a fixed list of options, the country you picked, and, if you arrived from an advertising link, the ad-network name and the `utm_source`, `utm_medium` and `utm_campaign` labels on that link (short lowercase labels only), and the time rounded to the hour. We do **not** store click IDs or sub-IDs from the link | Measuring where visitors leave the pre-signup quiz so we can fix confusing steps | `[COUNSEL REVIEW REQUIRED]` Legitimate purpose and proportionality (Sec. 11), or opt-in consent (Sec. 12(a)). Off by default until counsel decides; you can opt out in the quiz | Not visible to other users. Readable only by authorized Humbble administrators with database access (reporting is aggregate counts). Not linked to any account. Deleted automatically after 90 days. |
| **PII-Minimized Pseudonymous Analytics** (PostHog) | Server-salted HMAC-SHA256 `analytics_id`, allowlisted funnel event names and non-PII counts/booleans | Measuring onboarding completion, crash-free sessions, and product reliability | Explicit opt-in consent (Sec. 12(a)), revocable at any time in `Settings` | **Not "zero-PII"**: treated as pseudonymous personal data under RA 10173. Client IP is discarded (`$ip: null`); never includes email, name, `birth_date`, GPS, photos, or chat text. |

---

## 3. Strict Prohibition on Raw Selfie & Biometric Retention (`Amendment A2`)

3.1 **No Raw Biometrics in Humbble Storage:** Humbble's database schema and storage policies explicitly prohibit storing raw verification selfies, liveness videos, or facial geometry/biometric templates in Humbble's database or Supabase Storage buckets:
- `public.verification_requests` contains **no** `artifact_storage_path` or `artifact_purge_after` columns.
- There is **no** client upload Storage policy for verification artifacts (`storage_verif_insert_own` is omitted).
3.2 **External Verification Provider Boundary:** Liveness and age checks execute exclusively through a replaceable, vendor-independent verification adapter. No commercial verification vendor has been contracted yet (`DEP-LEGAL-04`). Before any production verification vendor is enabled with real users, the vendor must pass privacy, security, and Philippine legal review, and its exact transient processing and immediate-deletion policy will be disclosed here and presented for explicit user consent (`SCR-10`).

---

## 4. PII-Minimized Pseudonymous Analytics & Telemetry Controls

4.1 **Accurate Description (Not "Zero-PII"):** Earlier open-source repository documentation (`README.md`) used informal phrases such as "No tracking". In accordance with RA 10173, Humbble discloses that when you opt into product analytics, we process **PII-Minimized Pseudonymous Analytics** via PostHog:
- **Salted Pseudonymous Identifier:** Your Supabase `auth.uid()` is never sent to PostHog. Instead, a trusted server boundary computes `analytics_id = HMAC-SHA256(auth.uid(), server_secret_salt)`.
- **Network & Location Minimization:** PostHog is configured to discard client IP addresses (`$ip: null`). Precise GPS coordinates are never collected.
- **Strict Property Allowlist:** A client-side and schema-validated allowlist strips any property not explicitly approved. Private chat message bodies, profile prompt text, email addresses, display names, `birth_date`, photo URLs, and PayPal payloads are **never** sent to analytics.
- **Opt-In by Default & Instant Revocation:** Non-essential analytics remain disabled until you grant explicit consent (`consent_records`), and you may withdraw consent at any time in `Settings` without affecting your access to core dating or safety features.

4.2 **Anonymous Quiz Analytics (before you have an account) — `[COUNSEL REVIEW REQUIRED]`:** This feature is **off unless it is switched on in the app build, and it is off by default until counsel has signed off.** When it is on, the quiz shows a short notice with a link to this section and an **Opt out** control, and Humbble records anonymous step events on its own database (not PostHog, not a third party):
- **What is stored (exactly):** a random session ID created on your device; the event name; the step number; your answer, but only as one of a fixed set of options (relationship intention, age range, timing); the country you pick; if you arrived from an advertising link, the ad-network name (only if it is one we have configured) and the `utm_source`, `utm_medium` and `utm_campaign` labels from that link, when they are short lowercase labels (letters, digits, `_`, `-`, up to 32 characters); and the time rounded to the hour. No free text is ever stored, and anything that does not match these rules is discarded.
- **What is not stored in that table:** your IP address, user agent, device or browser fingerprint, email, name, any account identifier, any click ID or sub-ID from an advertising link, or the exact time.
- **Not linked to your account:** the session ID is **never sent when you sign up** and is not stored with your account, and we do not match these events to accounts. Because the events carry no identifier, we do not link them to you. We cannot promise they could never be matched in theory (for example, if very few people used the quiz in the same hour with the same answers), and our staff rules forbid trying.
- **Request logs:** to receive an event our hosting provider (Supabase) necessarily processes the web request, and its own request logs may include your IP address, browser/app user agent and the time. That is the provider's operational logging, kept under its own retention, and is not part of the event table. The request does not carry your account login.
- **Your choices:** use **Opt out** in the quiz notice (web and app): your choice is remembered on the device, the local session ID is deleted, and nothing further is sent. We also do not record these events if your browser sends a Do Not Track or Global Privacy Control signal. The session ID stays on your device for up to 30 days from when it was created, and is replaced the next time you open the quiz after that; clearing the site's storage or the app's data removes it at any time.
- **Retention:** 90 days, then deleted by an automated daily purge. Reporting uses aggregate counts, although authorized administrators with database access can read the anonymous rows.
- **Answers saved with your account:** separately, if you continue to sign up from the quiz, your quiz answers (intent, age range, timing, country) are sent with your sign-up and stored with your account metadata, as in section 2, so we can personalize your onboarding. These answers are part of your account data and are removed on account deletion (section 6).
- **Open point:** `[COUNSEL REVIEW REQUIRED]` whether anonymous quiz analytics needs opt-in consent (as CNS-04 does for PostHog) or can rely on Sec. 11 legitimate purpose. See `legal/drafts/consent-map.md` (CNS-04a) and `docs/operations/quiz-funnel-events.md`.

---

## 5. Subprocessors & Cross-Border Data Transfers (`COUNSEL REVIEW REQUIRED`)

Subject to owner provisioning approval (`owner-decisions.md` §1, §6) and execution of RA 10173-compliant Data Processing Agreements (`DPAs`), Humbble relies on the following categories of infrastructure subprocessors:

| Subprocessor Category | Planned Provider | Role & Data Scope | Environment Status |
|---|---|---|---|
| **Database, Auth, Storage & Realtime** | Supabase (Dedicated Humbble project — not yet provisioned) | Hosts PostgreSQL tables, Auth credentials, `profile_photos` bucket, and Realtime chat channels | `UNPROVISIONED` (Local synthetic dev only until Owner approves cost/topology) |
| **Web Hosting & Server Functions** | Vercel | Hosts web application and trusted server endpoints (`/api/privacy/*`); PayPal billing runs in Supabase Edge Functions `paypal-create-subscription`, `paypal-webhook`, `paypal-cancel-subscription` | `READY` preview/target on `e5bff440` (`live: false`, SSO enabled) |
| **Subscription Billing Processor** | PayPal (Sandbox Only) | Processes monthly subscription checkout and webhooks via the Supabase Edge Functions above (`PH PHP 599.00/mo`; `US USD 29.99/mo`, sandbox) | **PayPal Sandbox Only** (Live billing disabled) |
| **Product Analytics** | PostHog | Processes opt-in pseudonymous funnel telemetry (`analytics_id`, `$ip: null`) | Not yet integrated (`PR P5-03`) |
| **Age / Liveness Verification Vendor** | `[UNSELECTED — DEP-LEGAL-04]` | Executes external liveness/age verification session and returns status outcome only | Test adapter only until vendor is selected and approved by Counsel |
| **Transactional Email & Encrypted Backup Object Storage** | `[TBD BY OWNER WITHIN ₱10,000/MO CEILING]` | Delivers auth/account emails and stores encrypted off-site logical backups (`pg_dump` + Storage sync) | Not yet provisioned (`PR P5-04`) |

> `[COUNSEL REVIEW REQUIRED]:` Under Section 21 of RA 10173 and IRR Sections 50–51, confirm the required contractual cross-border transfer notices and standard data protection clauses for hosting data in cloud regions outside the Philippines (e.g., Singapore `ap-southeast-1` or US regions).

---

## 6. Data Retention, Account Deletion & Backups

6.1 **Summary of Retention Rules:** We retain personal data only for as long as necessary to provide the Service or comply with mandatory Philippine statutory obligations. Full table-by-table retention periods are specified in [`legal/drafts/deletion-and-export.md`](./deletion-and-export.md):
- **Active Profile, Photos, Preferences & Unflagged Messages:** Retained while your account is active; **purged upon verified account deletion request** (`SCR-19`, `API-08`).
- **Anonymous Quiz Events (`quiz_events`) (only if enabled in the app build):** Not linked to any account; automatically purged after **90 days** (daily scheduled `purge_quiz_events`). Not affected by account deletion because they contain no account identifier. The session ID on your device is kept at most 30 days.
- **Verification Metadata (`verification_requests`):** Stores only provider session metadata and status (zero raw selfies/biometrics); deleted upon account deletion except where linked to an active abuse/fraud hold.
- **Trust & Safety Reports & Intermediary Preservation (`reports`, `moderation_cases`):** When flagged for abuse or unlawful activity under **RA 11862 Section 9**, relevant subscriber information and traffic data are preserved for **one (1) year** from the transaction date (extendable for an additional **one (1) year** upon formal notice from DOJ, PNP, NBI, or DICT-CICC). `[COUNSEL TO CONFIRM EXACT SCOPE]`
- **Financial & Subscription Ledger (`subscriptions`, `payment_events`):** Retained in anonymized/de-linked form (`subscriptions.user_id` set to `NULL` on account deletion) for statutory tax and accounting periods required under Philippine BIR rules (`[COUNSEL TO CONFIRM: 5 vs. 10 YEARS UNDER NIRC / EOPT ACT]`).
- **Logical Backups (`Amendment A5`):** To remain within the ₱10,000/month operating ceiling during the pilot, Humbble uses scheduled encrypted logical backups (`pg_dump` + Storage sync, pilot RPO ≤ 24h, target 6h) rather than $100/month PITR. Deleted records age out of encrypted logical backup archives on a fixed rolling window (`[COUNSEL & DEVOPS TO CONFIRM: e.g., 14 OR 30 DAYS]`), and backup restore scripts re-apply completed `privacy_requests` tombstones so deleted accounts are never resurrected.

---

## 7. Your Rights as a Data Subject under RA 10173

Under Section 16 of the Philippine Data Privacy Act of 2012 (RA 10173) and its IRR, you have the right to:
1. **Right to Be Informed:** Receive clear, plain-language information about how your personal data is collected, used, shared, and retained.
2. **Right to Object / Withdraw Consent:** Object to processing based on consent or legitimate interest, and withdraw optional consent (such as product analytics or push notifications) at any time via `Settings`.
3. **Right to Access & Data Portability (Export):** Request a machine-readable copy (JSON export) of the personal data you have provided to us (`SCR-19`).
4. **Right to Rectification:** Correct or update inaccurate profile fields directly in your profile settings or request correction of account records.
5. **Right to Erasure or Blocking (Account Deletion):** Request permanent deletion of your account and profile media via `Settings -> Privacy & Account Deletion` (`SCR-19`), subject only to mandatory statutory preservation holds under Philippine law.
6. **Right to Damages & Right to File a Complaint with the NPC:** Seek indemnification for damages sustained due to inaccurate, incomplete, outdated, false, unlawfully obtained, or unauthorized use of personal data, and lodge a complaint with the **National Privacy Commission (NPC)** (`https://privacy.gov.ph`).

---

## 8. Personal Data Breach Management (`NPC Circular No. 16-03`)

In the event of a suspected security incident involving personal data:
1. **Containment & Assessment:** Our security and privacy leads immediately contain the incident, revoke compromised credentials/sessions, preserve forensic evidence, and evaluate the incident with independent Philippine legal counsel.
2. **Conditional 72-Hour Notification Rule:** In accordance with **NPC Circular No. 16-03**, when our assessment determines that **sensitive personal information** or **information that may be used to enable identity fraud** has been acquired by an unauthorized person, and that such acquisition is **likely to give rise to a real risk of serious harm** to any affected data subject, we will notify the **National Privacy Commission** and the affected data subjects **within seventy-two (72) hours** upon knowledge of, or when there is reasonable belief by the PIC or Personal Information Processor that, a notificable personal data breach has occurred.
