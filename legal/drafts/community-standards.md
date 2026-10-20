DRAFT—COUNSEL REVIEW REQUIRED

# Humbble — Draft Community Standards & Safety Guidelines

> **LEGAL NOTICE:** This document is an unapproved draft prepared for review by independent Philippine legal counsel (`GATE-LEGAL-01`) and the Trust & Safety Lead (`GATE-SAFE-01`). It must not be treated as approved public copy until counsel review is completed.

- **Draft Version:** `0.1.0-draft` (20 October 2026)
- **Target Launch Jurisdiction:** Republic of the Philippines (`PH`) only
- **Statutory Grounding:** Republic Act No. 10906 (*Anti-Mail Order Spouse Act*), Republic Act No. 11862 (*Expanded Anti-Trafficking in Persons Act of 2022*), Republic Act No. 11313 (*Safe Spaces Act / Bawal Bastos Law*), Republic Act No. 9995 (*Anti-Photo and Video Voyeurism Act*), and Republic Act No. 10175 (*Cybercrime Prevention Act of 2012*).

---

## 1. Core Principle: Mutual Respect, Adult Autonomy & Shared Interests

Humbble is a community for consenting adults (`18+`) in the Philippines to meet and connect around shared interests, conversation prompts, and personal compatibility. Every member—regardless of gender, background, or subscription tier—is entitled to dignity, autonomy, and free access to safety tools.

---

## 2. Strict Zero-Tolerance Prohibitions (Immediate Account Termination & Law Enforcement Referral)

Violations of the following rules result in immediate account suspension/ban, content removal within **24 hours** of notice or knowledge, preservation of relevant account/traffic logs for **1 year** (extendable by 1 year upon law-enforcement notice), and mandatory referral to Philippine authorities (**DOJ-IACAT**, **PNP**, **NBI**, or **DICT-CICC**) within **3 days** where required by **Section 9 of RA 11862**:

### 2.1 Zero Tolerance for Underage Users & Child Exploitation (`18+ Only`)
- You must be **at least 18 years old** to register or use Humbble.
- Profiles depicting, impersonating, or seeking anyone under 18 are immediately banned.
- Uploading, sharing, soliciting, or referencing Child Sexual Abuse or Exploitation Material (CSAEM / CSAM) under **RA 11930** (*Anti-Online Sexual Abuse or Exploitation of Children [OSAEC] and Anti-Child Sexual Abuse or Exploitation Materials [CSAEM] Act*) and **RA 11862** triggers immediate account lockdown, evidence preservation, and emergency reporting to law enforcement.
- Profile photos containing unaccompanied minors are prohibited; if a photo includes a child alongside an adult, it must be removed or obscured per moderation policy. `[COUNSEL REVIEW REQUIRED: Confirm whether any depiction of minors in user profile photos should be strictly prohibited even when accompanied by a parent.]`

### 2.2 Zero Tolerance for Human Trafficking, Prostitution & Exploitation (`RA 11862`)
- Recruiting, transporting, harboring, introducing, or matching any person for prostitution, sexual exploitation, pornography, forced labor, slavery, involuntary servitude, or debt bondage is strictly prohibited.
- Commercial sex work, escorting, sugar-dating arrangements involving financial exchange for intimacy, or compensated companionship solicitation is prohibited on Humbble.

### 2.3 Zero Tolerance for Mail-Order Spouse & Marriage-Broker Schemes (`RA 10906`)
- Humbble is a neutral, self-directed dating platform connecting individuals with shared interests.
- Operating, advertising, recruiting for, or participating in any business, club, agency, or scheme that matches or offers Filipino nationals to foreign nationals for marriage or common-law partnership for money, profit, or economic consideration (**Republic Act No. 10906**, Section 3) is strictly prohibited.
- Third-party matchmakers, introduction agencies, catalogue operators, and profile brokers are forbidden from creating or managing accounts on behalf of others.

---

## 3. Prohibited Conduct on Profiles & in Conversations

### 3.1 Financial Solicitation, Romance Scams & Off-Platform Fraud
- **Never ask for or send money:** Soliciting cash, bank transfers, GCash/Maya transfers, remittances, cryptocurrency, gift cards, load, loans, medical/emergency funds, visa/travel fees, or investment schemes from other users is strictly prohibited.
- **Commercial Spam:** Promoting external websites, Telegram/WhatsApp groups for commercial purposes, affiliate links, or paid content platforms is prohibited.
- **In-Chat Safety Warnings:** Humbble displays proactive anti-scam warnings when early off-platform contact or financial-solicitation patterns are detected (processed without exposing private message text to third-party analytics).

### 3.2 Harassment, Gender-Based Online Sexual Harassment & Hate Speech (`RA 11313`)
- Bullying, stalking, threats of violence, doxxing (publishing private contact details, workplace, or home address), blackmail, or extortion is strictly forbidden.
- Unwanted sexual remarks, non-consensual sexual explicitness, misogynistic or racist slurs, or gender-based online sexual harassment prohibited under the **Safe Spaces Act (RA 11313)** will result in suspension or permanent removal.

### 3.3 Non-Consensual Intimate Images & Voyeurism (`RA 9995`)
- Uploading, sharing, or threatening to share intimate, nude, or sexually explicit photos or videos without consent (violating **RA 9995**) is strictly prohibited and will be reported to authorities.
- All profile photos must be appropriate for a public adult dating discovery feed: nudity, sexually explicit acts, graphic violence, and weapons are prohibited.

### 3.4 Impersonation, Catfishing & Misrepresentation
- You must use your own authentic, recent photos and represent your identity truthfully.
- Impersonating another person, using stolen or AI-generated deceptive portraits to mislead other users, creating multiple accounts, or attempting to bypass age/liveness verification (`verification_requests`) is prohibited.

---

## 4. Profile Quality & Relationship Intention Guardrails

4.1 **Required Profile Elements:** Before a profile can become discoverable (`is_discoverable = true`), it must include:
- A valid `display_name` (2–40 characters, no contact handles or URLs);
- Between **two (2) and six (6) approved profile photos** clearly showing the account holder;
- **Three (3) completed conversation prompts** reflecting authentic personal interests;
- A verified age/liveness status (`verification_status = 'verified'`) when required by cohort rules.
4.2 **Neutral Relationship Intentions Only (`ADR-002`):**
- Profiles express dating goals using neutral, shared-interest categories: `'serious_relationship'`, `'long_term_dating'`, or `'cultural_connection_and_dating'`.
- Explicit `'marriage'` or `'international_spouse'` filter tags and nationality-catalogue filtering are excluded from the platform by design.

---

## 5. Reporting, Blocking & Enforcement Ladder

5.1 **Unconditional Free Safety Controls:**
- Any user (Free or `Humbble Reserve`) can **Block**, **Report**, or **Unmatch** another user in one tap from any profile (`SCR-12`) or chat conversation (`SCR-16`, `SCR-22`).
- Blocking immediately severs any match and prevents future discovery or messaging in both directions (`block_user` RPC).
- Reporting opens a confidential ticket (`submit_report` RPC) visible only to the submitting reporter and authorized Trust & Safety personnel (`Amendment A1`).

5.2 **Enforcement Ladder:**
Depending on severity and prior history, Trust & Safety moderators (`SCR-23`, `SCR-24`) may take the following audited actions (logged immutably to `public.audit_events`):
1. **Content Removal & Warning:** Removal of a non-compliant photo or prompt with a written explanation.
2. **Temporary Discoverability Hold (`is_discoverable = false`):** Profile hidden until non-compliant content is corrected or verification is completed (`requires_review`).
3. **Account Suspension (`is_suspended = true`):** Immediate revocation of discovery, swiping, and messaging privileges pending investigation or for a fixed suspension period.
4. **Permanent Ban & Statutory Reporting:** Immediate permanent account termination, session revocation, and—where required under **RA 11862**, **RA 11930**, or **RA 10906**—preservation of evidence and reporting to Philippine law enforcement.

5.3 **Right to Appeal:** Except where disclosure is prohibited by law or an active law-enforcement investigation, users notified of an enforcement action may submit an appeal through the [Complaints Handling Procedure](./complaints-handling.md).
