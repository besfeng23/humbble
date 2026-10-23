DRAFT—COUNSEL REVIEW REQUIRED

# Humbble — Draft Trust & Safety Moderation Procedures & SLA Specification

> **LEGAL NOTICE:** This document is an unapproved draft prepared for review by independent Philippine legal counsel (`GATE-LEGAL-01`) and the Trust & Safety Lead (`GATE-SAFE-01`). All internal triage response targets below are **planning hypotheses and pilot targets subject to baseline validation (`owner-decisions.md` §5)**, **not** existing performance claims or unconditional public guarantees. No real users may be admitted to the Stage B pilot until the Owner appoints a named Human Moderation Lead (`DEP-SAFE-01`), staffed coverage hours are published, and a mock safety-report drill is completed.

- **Draft Version:** `0.1.0-draft` (20 October 2026)
- **Binding Plan References:** `owner-decisions.md` §5; `docs/plan/Humbble_Execution_Build_Plan_v1.2.md` §V1.2 Amendments `A1` & `A6` (`T-014` = 11 person-days), §3 (`PR P3-05`, `PR P5-01`, `Phase 6`), §4.1, §8 (`GATE-SAFE-01`).
- **Primary Statutory Authority:** Republic Act No. 11862 (*Expanded Anti-Trafficking in Persons Act of 2022*, Section 9 internet intermediary obligations), Republic Act No. 11930 (*Anti-OSAEC and Anti-CSAEM Act*), Republic Act No. 10906 (*Anti-Mail Order Spouse Act*), and Republic Act No. 10173 (*Data Privacy Act of 2012*).

---

## 1. Staffing & Governance Prerequisites (`DEP-SAFE-01` — Open Dependency)

1. **Human Moderation Lead Appointment (`UNAPPOINTED`):** Per `owner-decisions.md` §5, the Owner appoints the human moderation lead. Engineering and AI agents must **never** invent a moderator's identity or assume 24/7 staffing exists.
   - **Designated Human Moderation / Trust & Safety Lead:** `[UNAPPOINTED — OWNER TO DESIGNATE PRIOR TO STAGE B PILOT]`
   - **Published Staffed Pilot Hours (Philippine Standard Time, `UTC+8`):** `[TBD BY OWNER & MODERATION LEAD PRIOR TO STAGE B PILOT]`
   - **Out-of-Band Urgent Escalation Channel (Voice/SMS/Pager outside app UI):** `[TBD BY OWNER & MODERATION LEAD — MUST NOT RELY ON PUSH NOTIFICATIONS ALONE]`
2. **Pre-Pilot Exit Gate (`GATE-SAFE-01`):** Before admitting the first invitation-only cohort (`Stage B`, up to ~100 users), block, report, moderation, and account-recovery flows must pass automated and manual rehearsal against synthetic staging data.

---

## 2. User-Facing Safety Controls (`PR P3-05`)

1. **Unconditional Free Access:** Block, Report, and Unmatch controls are **100% free** and accessible in one tap on every profile (`SCR-12`) and conversation (`SCR-16`, `SCR-22`) across all subscription tiers. Feature flags can never disable Block, Report, or Account Deletion (`Plan v1.2` §8).
2. **Immediate Block Enforcement (`block_user` RPC):**
   - Inserting a row into `public.blocks` atomically severs any active match (`matches.status = 'blocked'`), hides the conversation, and prevents both users from appearing in each other's discovery feed (`get_discovery_feed`), swiping (`record_swipe`), or sending messages (`send_message`) in either direction (`TEST-SEC-06`).
3. **Structured Report Submission (`submit_report` RPC / `SCR-22`):**
   - Report categories:
     - `underage_or_csaem` (Critical — P0 Emergency)
     - `human_trafficking_or_exploitation` (Critical — P0 Statutory RA 11862)
     - `marriage_broker_or_mail_order_scheme` (Critical — P0 Statutory RA 10906)
     - `financial_solicitation_or_scam` (High — P1)
     - `harassment_or_threats` (High — P1)
     - `non_consensual_or_explicit_media` (High — P1)
     - `impersonation_or_fake_profile` (Medium — P2)
     - `spam_or_off_platform_solicitation` (Low — P3)
   - Per `Amendment A1`, `public.reports` has strict RLS (`SELECT` limited strictly to the submitting reporter for their own ticket status and authorized Trust & Safety moderator role). A reported user can never inspect who reported them via client API queries.

---

## 3. Triage SLA Targets (`Hypotheses Pending Pilot Validation`) & Statutory Clocks

> **IMPORTANT DISTINCTION:** Internal pilot targets (`owner-decisions.md` §5) are operational measurement benchmarks for staffed pilot periods and **must not** be advertised to consumers as unconditional 24/7 response guarantees. Mandatory statutory deadlines under **RA 11862 Section 9** are binding legal obligations upon notice or knowledge.

| Severity Tier | Report Categories | Pilot Triage Target *(Hypothesis During Staffed Hours)* | Mandatory Statutory Clock (`RA 11862 Sec. 9` / `RA 11930`) | Immediate Automated / Interim Action |
|---|---|---|---|---|
| **P0 — Critical / Statutory Emergency** | `underage_or_csaem`, `human_trafficking_or_exploitation`, `marriage_broker_or_mail_order_scheme`, credible imminent physical threat | **Immediate out-of-band page**; target human triage **≤ 4 hours** during staffed hours (and always within statutory 24h ceiling) | **≤ 24 hours** from notice or knowledge to block access / remove unlawful trafficking content; **≤ 3 days (72 hours)** to report blocked/removed content and unusual traffic data to **DOJ-IACAT / PNP / NBI / DICT-CICC**; **1-year preservation** of subscriber & traffic data (extendable by 1 year on formal LEA notice) | Immediate automatic block between reporter & reported user; if `>= 2` independent P0/P1 reports or high-confidence safety trigger, auto-set `is_discoverable = false` pending human review. |
| **P1 — High Severity** | `financial_solicitation_or_scam`, `harassment_or_threats`, `non_consensual_or_explicit_media` | **≥ 95% triaged within 24 hours** during staffed pilot periods (`owner-decisions.md` §5) | Preserve evidence for potential RA 11313 / RA 9995 / RA 10175 investigation | Immediate mutual block if toggled by reporter; queued at top of `SCR-23` priority queue. |
| **P2 — Medium Severity** | `impersonation_or_fake_profile`, ambiguous verification (`requires_review`) | **≥ 95% triaged within 24 hours** during staffed pilot periods | Standard RA 10173 data minimization applies unless escalated to P0/P1 | Profile held undiscoverable (`is_discoverable = false`) while in `requires_review`. |
| **P3 — Low Severity** | `spam_or_off_platform_solicitation`, minor profile prompt violations | **≥ 95% triaged within 24 hours** during staffed pilot periods | Standard retention | Queued in `SCR-23`. |

### 3.1 Pilot SLA Measurement Definition (`Plan v1.2` §3 Phase 6)
- **Metric Formula:** `triage_latency = moderation_cases.triaged_at - reports.created_at`.
- **Target Threshold (Hypothesis):** At least **95%** of safety reports received during staffed pilot periods have `triage_latency <= 24 hours`.
- **Denominator Rules:** All user-submitted `reports` created during the declared measurement window, excluding only explicitly documented synthetic test tickets or verified duplicate spam bursts (difficult or complex cases may **never** be excluded from the denominator). Critical (`P0`) reports are tracked and reported separately alongside published staffed coverage hours.

---

## 4. Trust & Safety Console (`SCR-23` / `SCR-24`) & Audit Controls (`PR P5-01`)

1. **Strict Server-Side RBAC:**
   - Access to `SCR-23` (`app/(admin)/moderation/index.tsx`), `SCR-24` (`app/(admin)/moderation/[reportId].tsx`), and `moderation_transition` RPC requires a trusted server-assigned `moderator` role claim (`app_metadata.role = 'moderator'`). An `admin` claim or `user_metadata` does not grant access.
   - No moderator role may ever be granted via a client-editable profile column (`TEST-RLS-08`).
2. **Case-Scoped Least Privilege:**
   - Moderators may view reported profile content or the specific reported message context **only** within an active `moderation_cases` record. General browsing of private user conversations is prohibited.
   - *Implementation note (Themis N46-03, open):* the console enforces this through its RPCs, but database RLS currently also lets a moderator `SELECT` all `reports` and `moderation_cases` directly (not limited to an opened case). That is a known deviation from this paragraph until the direct-read policies are dropped or the deviation is formally accepted.
3. **Immutable Audit Trail (`public.audit_events`):**
   - Every moderator view of case evidence and every state transition (`warn`, `remove_content`, `set_undiscoverable`, `suspend`, `ban`, `restore`, `place_legal_hold`) writes an append-only row to `public.audit_events` recording `actor_id`, `action`, `target_id`, `case_id`, `reason`, and `created_at`.
   - `UPDATE` and `DELETE` privileges on `public.audit_events` are revoked from all application and client roles.
   - *Implementation note (Themis N46-03, open):* a view is audited only when it goes through the console RPC (`moderation_get_case`). Direct table reads by a moderator, and the queue listing, are **not** audited; do not describe every read as audited in any external or counsel-facing text until that is resolved.

---

## 5. RA 11862 Section 9 Statutory Takedown, Preservation & Law Enforcement Reporting Runbook

When a moderator or automated safety rule identifies content or conduct reasonably suspected to involve human trafficking, mail-order marriage brokering, or child exploitation (`P0`):
1. **Step 1 — Immediate Containment & Takedown (Within ≤ 24 Hours of Notice/Knowledge):**
   - Execute `moderation_transition(case_id, 'ban_and_preserve', reason)` to set `profiles.is_suspended = true`, `profiles.is_discoverable = false`, revoke all active `auth.sessions` for the reported account, and block access to the offending content.
2. **Step 2 — Statutory Legal Hold (`1 Year`, Extendable by `1 Year`):**
   - Lock the associated `moderation_cases`, `reports`, relevant `messages`, subscriber registration metadata, and transaction/traffic timestamps against user-initiated deletion (`legal_hold_until = NOW() + INTERVAL '1 year'`).
   - If the DOJ, PNP, NBI, or DICT-CICC issues a formal preservation notice, extend `legal_hold_until` for an additional **one (1) year** per Section 9 of RA 11862.
3. **Step 3 — Law Enforcement Notification (Within ≤ 3 Days / 72 Hours):**
   - Escalate immediately to the **Trust & Safety Lead**, **Product/Owner**, and **Independent Philippine Legal Counsel** to submit the required statutory report of blocked/removed content and relevant subscriber/traffic data to the appropriate Philippine authority (**DOJ Inter-Agency Council Against Trafficking [IACAT]**, **PNP Women and Children Protection Center [WCPC] / ACG**, **NBI**, or **DICT-CICC**).

---

## 6. Open Questions for Independent Philippine Counsel (`GATE-LEGAL-01`)

1. **Exact Scope of "Traffic Data" under RA 11862 Sec. 9:** Confirm which exact database columns in `profiles`, `messages`, `swipes`, and `audit_events` satisfy the 1-year intermediary preservation duty for flagged accounts vs. unflagged accounts.
2. **Law Enforcement Reporting Format:** Provide the exact reporting template, designated agency contact endpoints (DOJ-IACAT / DICT-CICC / PNP-ACG / NBI), and authorization protocol for submitting the 3-day statutory report under Section 9 of RA 11862.
