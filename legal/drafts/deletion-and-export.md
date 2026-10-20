DRAFT—COUNSEL REVIEW REQUIRED

# Humbble — Draft Account Deletion, Data Export & Retention Schedule

> **LEGAL NOTICE:** This document is an unapproved draft prepared for review by independent Philippine legal counsel (`GATE-LEGAL-01`) and the Privacy Lead (`GATE-PRIV-01`). The reconciliation between a user's right to erasure under **Republic Act No. 10173** (*Data Privacy Act of 2012*), mandatory intermediary preservation under **Republic Act No. 11862 Section 9**, and tax/financial ledger retention under Philippine **BIR / NIRC** rules must be formally signed off by Philippine counsel before any real-user data is processed.

- **Draft Version:** `0.1.0-draft` (20 October 2026)
- **Binding Plan References:** `owner-decisions.md` §3, §5, §6; `docs/plan/Humbble_Execution_Build_Plan_v1.2.md` §V1.2 Amendments `A1`, `A2`, `A5`, §1.2, §3 (`PR P5-02`, `PR P5-04`), §4.1, §4.3 (`request_account_deletion`), §8 (`GATE-PRIV-01`, `GATE-OPS-01`).

---

## 1. Governing Deletion & Export Principles

1. **Self-Service Access (`SCR-19`):** Authenticated users can request a machine-readable personal data export (`JSON`) or initiate permanent account deletion at any time in `app/(tabs)/profile/privacy-delete.tsx` (`SCR-19`) without needing to contact customer support (`RA 10173 Sec. 16(c), (e)` and Apple App Store Guideline `5.1.1(v)`).
2. **Re-Authentication Gate for Destructive Requests:** Initiating account deletion (`/api/privacy/delete-account` or `request_account_deletion` RPC) requires a fresh re-authentication check and explicit confirmation (`"DELETE MY ACCOUNT"`) to prevent session-hijack deletion attacks.
3. **Truthful Asynchronous Completion Semantics (`Plan v1.2` §3 `PR P5-02`):**
   - Upon receiving a valid deletion request, Humbble **immediately** revokes active sessions (`auth.sessions`), sets `is_discoverable = false`, and removes the user from all discovery and messaging surfaces.
   - The system does **not** report `privacy_requests.status = 'completed'` until both PostgreSQL row purge/anonymization and Supabase Storage (`profile_photos/{user_id}/*`) object deletion have been confirmed. If storage cleanup encounters a transient error, the request remains in a retryable state and triggers an operational alert (`PR P5-02`).
4. **Zero Raw Selfie / Biometric Retention (`Amendment A2`):** Because Humbble never stores raw verification selfies or biometric templates in `public.verification_requests` or Supabase Storage (`Amendment A2`), there are no biometric media artifacts in Humbble storage to purge.

---

## 2. Self-Service Data Export Specification (`SCR-19`)

### 2.1 Scope of Exported Data (`JSON` Archive)
When a user requests a data export (`privacy_requests.request_type = 'export'`), the server compiles and returns ONLY data owned by `auth.uid()` (`TEST-PRIV-01`):
- **Included:**
  - Account & profile fields (`profiles`: `display_name`, `birth_date`, `city_region`, `occupation`, `education_level`, `languages_spoken`, `shared_interests`, `relationship_intention`, `prompts`, `verification_status`, `created_at`).
  - Profile photo metadata (`profile_photos`) and time-limited signed download URLs for the user's own uploaded photos.
  - User preferences (`user_preferences`).
  - Verification request status history (`verification_requests`: `provider`, `status`, `attempts`, `created_at`, `decided_at`).
  - Messages **sent by the requesting user** (`messages WHERE sender_id = auth.uid()`). `[COUNSEL REVIEW REQUIRED: Confirm that messages sent by the other participant in a conversation are excluded from a unilateral export to protect the third party's privacy under RA 10173.]`
  - Subscription and billing history (`subscriptions`, `entitlements`, user-scoped `payment_events` summary).
  - Consent and privacy request log (`consent_records`, `privacy_requests`).
- **Excluded (Strict Privacy & Security Boundary):**
  - Other users' private profile data, `birth_date`, or messages written by other users;
  - Reports submitted *against* the requesting user (`reports` / `moderation_cases` internal notes);
  - Internal security/moderator `audit_events` or server secrets/salts.

---

## 3. Table-by-Table Retention & Account Deletion Schedule (`19 Canonical Tables`)

| Table / Storage Bucket | Standard Active Retention | Action Upon Account Deletion (`TEST-PRIV-01`) | Statutory / Legal-Hold Exception (`COUNSEL REVIEW REQUIRED`) |
|---|---|---|---|
| `auth.users` & `auth.sessions` | Active account lifetime | **Immediate session revocation** (`DELETE FROM auth.sessions`); `auth.users` record deleted once dependent storage & DB purge steps complete | If account is under an active **RA 11862 Sec. 9** preservation hold (`legal_hold_until > NOW()`), login is permanently disabled/banned and subscriber registration metadata is preserved in a restricted compliance hold table until the statutory hold expires. |
| `public.profiles` | Active account lifetime | **Immediate `DELETE`** (`ON DELETE CASCADE` from `auth.users`) | Preserved only in restricted legal-hold archive if subject to an active **RA 11862 Sec. 9** trafficking/abuse hold (`1 year`, extendable by `1 year` on LEA notice). |
| `public.profile_photos` & Storage `profile_photos` bucket | Active account lifetime | **Immediate `DELETE`** of DB metadata rows and all Storage objects under `{user_id}/*` | If a specific photo is flagged as evidence in an open `P0`/`P1` `moderation_cases` record, only the flagged evidence reference is held under strict legal hold (`RA 11862`). |
| `public.user_preferences` | Active account lifetime | **Immediate `DELETE`** (`ON DELETE CASCADE`) | None. |
| `public.verification_requests` | Active account lifetime (stores status & session metadata only; **no raw selfies/biometrics** per `Amendment A2`) | **Immediate `DELETE`** (`ON DELETE CASCADE`) | Retained up to 1 year only if linked to a fraud/spoofing investigation or RA 11862 hold. |
| `public.swipes` | Active account lifetime | **Immediate `DELETE`** (`ON DELETE CASCADE`) | None (unless traffic metadata is locked by an RA 11862 preservation notice). |
| `public.daily_swipe_quotas` | Rolling **30 days**, then pruned (`HumbblePlan-v1.1` §10) | **Immediate `DELETE`** (`ON DELETE CASCADE`) | None. |
| `public.matches` | Active account lifetime | **Immediate `DELETE`** (`ON DELETE CASCADE`) | None. |
| `public.conversations` & `public.conversation_participants` | Active match lifetime | Cascades on match deletion or removes deleted user's participation | Preserved if locked by an open `moderation_cases` / RA 11862 hold. |
| `public.messages` | Active conversation lifetime | **Purged / anonymized** on account deletion **unless** locked by an open `moderation_cases` / RA 11862 legal hold | **RA 11862 Sec. 9 Hold:** Flagged messages/traffic metadata preserved for **1 year** from transaction date (extendable by **1 year** upon DOJ/PNP/NBI/DICT-CICC notice). `[COUNSEL TO CONFIRM UNFLAGGED MESSAGE DELETION VS. 1-YEAR TRAFFIC DATA RULE]` |
| `public.blocks` | Active blocker account lifetime | **Immediate `DELETE`** when blocker deletes account | If block was accompanied by a safety `report`, the report record follows `reports` retention. |
| `public.reports` & `public.moderation_cases` | **1 to 2 years** (`RA 11862 Sec. 9` preservation rules) | Reporter/reported FK references are **retained under restricted T&S access** (or pseudonymized where no statutory hold applies) to prevent repeat ban-evasion and satisfy **RA 11862 Sec. 9** | Mandatory **1-year** preservation (plus **1-year** extension upon formal LEA notice) under **RA 11862 Sec. 9**. |
| `public.subscriptions` | Active + statutory tax/financial period (`[COUNSEL TO CONFIRM: 5–10 YEARS]`) | **De-linked / Anonymized:** `user_id` is set to `NULL` (`ON DELETE SET NULL` per `TEST-PRIV-01`), preserving only non-PII financial ledger amounts, plan code, and provider subscription reference for tax/audit reconciliation | Required for Bureau of Internal Revenue (**BIR**) tax & accounting compliance and PayPal chargeback defense. |
| `public.entitlements` | Active account lifetime | **Immediate `DELETE`** (`ON DELETE CASCADE`) | None. |
| `public.payment_events` | Statutory tax/financial period (`[COUNSEL TO CONFIRM: 5–10 YEARS]`) | **Retained as append-only financial audit ledger** (stores `provider_event_id`, `provider_subscription_id`, event type, settlement status; never stores raw card numbers or unnecessary payer PII per `Plan v1.2` §4.1) | Required for financial audit, webhook idempotency, and tax compliance. |
| `public.consent_records` & `public.privacy_requests` | **5 years** from record/completion timestamp (`[COUNSEL TO CONFIRM]`) | **Retained in minimized compliance form** (recording request ID, consent/deletion timestamps, and completion proof without profile content) | Required under **RA 10173** to prove lawful consent history and prove that a user's deletion request (`TEST-PRIV-01`) was executed. |
| `public.audit_events` | **2 years** (`[COUNSEL TO CONFIRM]`) | **Append-only security log retained** (`UPDATE`/`DELETE` revoked from all application roles; stores actor UUID, action, target table, correlation ID, and safe redacted metadata) | Required for security incident forensics (`NPC Circular 16-03`) and moderator accountability (`GATE-SAFE-01`). |
| **PostHog Analytics** | **90 days to 2 years** depending on event category (see `Privacy Notice`) | Pseudonymous `analytics_id` is Computed via one-way server-salted `HMAC-SHA256`; once `auth.users` is deleted, `analytics_id` can no longer be linked back to any identity | Contains zero email, name, DOB, IP (`$ip: null`), or message text. |

---

## 4. Backup Architecture & Deletion Reconciliation (`Amendment A5`)

1. **No PITR in Pilot (`₱10,000/month` Budget Ceiling):**
   - Per `Amendment A5` and `owner-decisions.md` §6, Supabase Point-in-Time Recovery (`US$100/month`) is **not** enabled during the pilot because it would breach the provisional `₱10,000/month` operating ceiling.
   - Instead, Humbble uses scheduled encrypted logical backups (`pg_dump` + Supabase Storage sync to encrypted off-site object storage) with a documented pilot **RPO ≤ 24 hours (target 6 hours)** and a verified restore drill prior to any live billing decision (`PR P5-04`, `GATE-OPS-01`).
2. **Preventing Resurrection of Deleted Accounts on Backup Restore:**
   - Encrypted logical backup snapshots expire and are overwritten on a fixed rolling retention window (`[COUNSEL & DEVOPS TO CONFIRM: e.g., 14 DAYS]`).
   - If a disaster-recovery restore from a logical backup is ever executed, the restore runbook (`PR P5-04`) mandates re-playing completed deletion tombstones from `public.privacy_requests` before re-opening traffic so that any user who deleted their account after the backup snapshot was taken is immediately re-purged.

---

## 5. Open Questions for Independent Philippine Counsel (`GATE-LEGAL-01`)

1. **Reconciling RA 11862 Sec. 9 (1-Year Preservation) vs. RA 10173 Sec. 16(e) (Right to Erasure):**
   - Does Section 9 of RA 11862 require internet intermediaries to preserve subscriber registration and traffic metadata for 1 year for **all** users even after normal account deletion, or **only** where an account/transaction is flagged, reported, or subject to a preservation notice?
2. **BIR / NIRC Financial Record Retention Period:**
   - Confirm the exact statutory retention period (`5 years` vs. `10 years` under the National Internal Revenue Code as amended by the Ease of Paying Taxes Act, RA 11976) for anonymized `subscriptions` and `payment_events` records once live billing is eventually authorized.
3. **NPC Prescribed Response Window for Export & Deletion Requests:**
   - Confirm the maximum statutory response period under NPC rules for fulfilling a Data Subject Access/Portability Request (`export`) or Erasure Request (`deletion`) in edge cases where manual legal-hold review is required.
