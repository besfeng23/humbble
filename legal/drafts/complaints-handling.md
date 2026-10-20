DRAFT—COUNSEL REVIEW REQUIRED

# Humbble — Draft Consumer, Privacy & Safety Complaints Handling Procedure

> **LEGAL NOTICE:** This document is an unapproved draft prepared for review by independent Philippine legal counsel (`GATE-LEGAL-01`). It establishes the user-facing and internal operational workflows for handling user safety complaints, moderation appeals, data privacy complaints (**RA 10173**), and consumer/subscription disputes (**RA 7394** & **RA 11967**). No real users may be admitted to the pilot until the Owner appoints the Human Moderation Lead (`DEP-SAFE-01`), Pilot Recruiter/Support Lead (`DEP-OPS-01`), and Data Protection Officer (`DEP-LEGAL-03`).

- **Draft Version:** `0.1.0-draft` (20 October 2026)
- **Target Launch Jurisdiction:** Republic of the Philippines (`PH`) only
- **Statutory Grounding:**
  - **Republic Act No. 11967** (*Internet Transactions Act of 2023*) — online consumer redress and internal dispute-resolution mechanism requirements;
  - **Republic Act No. 7394** (*Consumer Act of the Philippines*) — consumer complaints and billing redress;
  - **Republic Act No. 10173** (*Data Privacy Act of 2012*) & NPC Rules of Procedure — data subject rights requests and privacy complaints;
  - **Republic Act No. 11862** (*Expanded Anti-Trafficking in Persons Act of 2022*) & **Republic Act No. 10906** (*Anti-Mail Order Spouse Act*) — safety, exploitation, and illegal solicitation complaints.

---

## 1. Unappointed Operational Roles (`OPEN DEPENDENCIES`)

In accordance with `owner-decisions.md` §2, §5, and `docs/plan/Humbble_Execution_Build_Plan_v1.2.md` §9, roles are defined functionally below and **must not** list fabricated personal names until appointed by the Owner:

| Role | Complaint Responsibility | Current Appointment Status |
|---|---|---|
| **Trust & Safety / Moderation Lead** | In-app abuse reports (`SCR-22`), moderation appeals, urgent safety escalations, and RA 11862 takedown/preservation | `UNAPPOINTED` (`DEP-SAFE-01`) |
| **Data Protection Officer (DPO) / Privacy Lead** | Data subject access/export, deletion holds, consent disputes, and NPC breach/privacy complaints (`SCR-19`) | `UNAPPOINTED` (`DEP-LEGAL-03`) |
| **Pilot Support / Consumer Redress Lead** | General service complaints, account recovery assistance, and subscription/billing inquiries (`SCR-21`) | `UNAPPOINTED` (`DEP-OPS-01`) |
| **Independent Philippine Legal Counsel** | Statutory interpretation, regulatory inquiries, law-enforcement escalation sign-off | `UNAPPOINTED` (`DEP-LEGAL-01`) |

---

## 2. Complaint Categories, Intake Channels & Target Response Windows

> **Note on Internal Targets:** The response timelines below are proposed operational targets for staffed pilot periods (`owner-decisions.md` §5) and remain subject to baseline validation and Philippine counsel confirmation under RA 11967, RA 7394, and NPC rules.

| Category | Description | Primary Intake Channel | Target Acknowledgment | Target Triage / Resolution Window |
|---|---|---|---|---|
| **1. Urgent Safety & Statutory Abuse (`P0` / `P1`)** | Suspected underage user (`<18`), CSAEM/OSAEC, human trafficking (`RA 11862`), mail-order marriage brokering (`RA 10906`), financial scam/extortion, or harassment (`RA 11313`) | One-tap in-app **Report** sheet (`SCR-22`, `submit_report` RPC) on any profile or chat; fallback safety email `[TBD UPON DEP-SAFE-01]` | Immediate automated ticket confirmation in-app | **Pilot Hypothesis:** ≥95% human triage within **24 hours** during staffed pilot hours; **≤ 24 hours** mandatory statutory takedown for unlawful trafficking content (`RA 11862 Sec. 9`) |
| **2. Moderation & Account Enforcement Appeal** | User contesting a content removal, `requires_review` verification hold, temporary suspension (`is_suspended`), or permanent ban | Appeal form / support link presented on account restriction screen; email `[TBD]` | Within **24–48 hours** (automated receipt with case reference ID) | Human review by a moderator who did not issue the original action (where staffing permits) within **5 business days** (`[COUNSEL TO CONFIRM]`) |
| **3. Data Privacy & Data Subject Rights Complaint (`RA 10173`)** | Issues with data export (`JSON`), account deletion (`SCR-19`), inaccurate `birth_date` clerical correction, unauthorized data use, or consent withdrawal | In-app `SCR-19` (`Privacy & Account Deletion`) and DPO contact email `[TBD UPON DEP-LEGAL-03]` | Within **24–48 hours** | Automated export/deletion completes promptly (`TEST-PRIV-01`); manual DPO review resolved within **15 business days** (`[COUNSEL TO CONFIRM NPC TIMELINE]`) |
| **4. Subscription, Billing & Refund Inquiry (`PayPal Sandbox / Future Live`)** | Questions regarding `Humbble Reserve` monthly plan (`PHP 599.00/mo`), cancellation (`SCR-21`), duplicate checkout, failed webhook reconciliation, or refund requests | In-app `SCR-21` (`Billing Settings`) & billing support email `[TBD]` | Within **24–48 hours** | Initial investigation within **3 business days**; resolution within **7 business days** (`[COUNSEL TO CONFIRM UNDER RA 11967 / RA 7394]`) |
| **5. General Technical or Accessibility Feedback** | Bug reports, password reset issues (`SCR-06`), WCAG 2.2 AA accessibility barriers | In-app help/feedback link (`SCR-18`) | Within **48 hours** | Triaged into engineering backlog |

---

## 3. Step-by-Step Internal Handling & Audit Workflow

1. **Ticket Creation & Correlation ID:**
   - Every in-app report (`public.reports`), privacy request (`public.privacy_requests`), or support complaint generates a unique UUID reference.
   - Users can view the status of their own submitted safety reports (`reports`) and privacy requests (`privacy_requests`) via owner-scoped `SELECT` policies (`Amendment A1`).
2. **Confidentiality & Non-Retaliation:**
   - The identity of a reporting user (`reporter_id`) is strictly confidential and never disclosed to the reported user.
   - Submitting a good-faith safety report, privacy complaint, or billing dispute never results in account penalty or reduced discoverability.
3. **Moderation Appeal Review (`SCR-24`):**
   - Appeals are ineligible if the account was terminated for verified Child Sexual Abuse or Exploitation Material (`RA 11930`), confirmed human trafficking (`RA 11862`), or verified underage registration where the user is currently under 18.
   - For eligible appeals (e.g., false-positive scam filter, disputed profile photo removal, or age mistake supported by verified adult proof), the reviewer inspects the `moderation_cases` record, logs the appeal review to `public.audit_events`, and either upholds the enforcement action with a final written explanation or restores the account (`is_suspended = false`).
4. **Immutable Recordkeeping:**
   - All complaint intake timestamps, moderator transitions (`moderation_transition`), and resolution outcomes are logged in `public.moderation_cases`, `public.privacy_requests`, and `public.audit_events` to provide verifiable compliance evidence for `GATE-SAFE-01` and `GATE-PRIV-01`.

---

## 4. External Philippine Regulatory Escalation & Redress Channels (`COUNSEL REVIEW REQUIRED`)

Without prejudice to our internal complaints procedure, users in the Republic of the Philippines have the right to escalate unresolved complaints or statutory violations to the appropriate government authorities:

1. **Data Privacy Complaints (RA 10173):**
   - **National Privacy Commission (NPC)**
   - Website: `https://privacy.gov.ph`
   - *(Note: Under NPC Rules of Procedure, complainants are generally required to exhaust internal remedies with the PIC/DPO before filing a formal complaint with the NPC, subject to statutory exceptions.)* `[COUNSEL TO CONFIRM EXACT DISCLOSURE COPY]`
2. **Consumer Protection & Online Transaction Disputes (RA 7394 / RA 11967):**
   - **Department of Trade and Industry (DTI)** — Fair Trade Enforcement Bureau (FTEB) / E-Commerce Bureau (`1-DTI / 1-384`, `consumercare@dti.gov.ph`).
3. **Human Trafficking, Mail-Order Spouse Schemes & Cybercrime Emergencies (RA 11862 / RA 10906 / RA 10175):**
   - **DOJ Inter-Agency Council Against Trafficking (IACAT)** — Actionline `1343` (`https://iacat.gov.ph`)
   - **Commission on Filipinos Overseas (CFO)** — Actionline `1343` / anti-mail-order spouse reporting
   - **PNP Anti-Cybercrime Group (PNP-ACG)** / **PNP Women and Children Protection Center (WCPC)**
   - **National Bureau of Investigation (NBI)** — Cybercrime Division / Anti-Human Trafficking Division
   - **Cybercrime Investigation and Coordinating Center (DICT-CICC)** — Hotline `1326`

---

## 5. Open Questions for Independent Philippine Counsel (`GATE-LEGAL-01`)

1. **RA 11967 (Internet Transactions Act of 2023) Mandatory Redress Disclosures:** Confirm the exact statutory timeframes and contact details that must be displayed on `SCR-03` and `SCR-21` under RA 11967 and DTI Implementing Rules.
2. **CFO / IACAT Safety Helpline Placement:** Confirm whether displaying the **1343 Actionline** (IACAT / CFO) inside `SCR-22` (`Report Modal`) and `SCR-03` (`Community Safety Guidelines`) is recommended or required under the 2022 IRR of RA 10906.
