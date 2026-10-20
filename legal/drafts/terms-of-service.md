DRAFT—COUNSEL REVIEW REQUIRED

# Humbble — Draft Terms of Service

> **LEGAL NOTICE:** This document is an unapproved engineering and product draft prepared for review by independent Philippine legal counsel (`GATE-LEGAL-01`). It has **not** been approved by counsel and may not be published to real users or relied upon for commercial launch until formal sign-off is obtained and all bracketed `[COUNSEL REVIEW / UNVERIFIED]` fields are resolved.

- **Draft Version:** `0.1.0-draft` (20 October 2026)
- **Target Launch Jurisdiction:** Republic of the Philippines (`PH`) only
- **Deferred Jurisdictions (Disabled at Initial Launch):** United States (`US`), Canada (`CA`), Australia (`AU`), United Kingdom (`UK`)

---

## 1. Contracting Entity & Service Brand (`UNRESOLVED — COUNSEL VERIFICATION REQUIRED`)

1.1 **Proposed Operator Placeholder:** These Terms of Service ("Terms") are drafted for the proposed operator **`[PROPOSED OPERATOR: RED-APPLE TECHNOLOGY AND DIGITAL SERVICES — LEGAL IDENTITY, DTI/SEC REGISTRATION, BIR TIN, REGISTERED ADDRESS, AND CONTRACTING AUTHORITY UNVERIFIED]`** ("Operator", "we", "us", or "our").  
1.2 **Product Brand:** **Humbble** (and technology brand **Banatao Systems**) refers to the web and mobile software application and related dating services covered by these Terms.  
1.3 **Binding Prerequisite:** Neither `RED-APPLE TECHNOLOGY AND DIGITAL SERVICES` nor `Banatao Systems` shall be represented to the public as an established contracting legal entity until the Owner and independent Philippine legal counsel verify its official registration certificates and insert the verified legal name, registration number, and registered principal office address below:
- **Verified Legal Entity Name:** `[TBD BY OWNER & PHILIPPINE COUNSEL]`
- **DTI / SEC Registration No.:** `[TBD BY OWNER & PHILIPPINE COUNSEL]`
- **Principal Office Address:** `[TBD BY OWNER & PHILIPPINE COUNSEL]`
- **Official Support & Legal Notice Email:** `[TBD BY OWNER & PHILIPPINE COUNSEL]`

---

## 2. Nature of the Service & Neutral Shared-Interest Positioning

2.1 **Legitimate Shared-Interest Dating Platform:** Humbble is a neutral, adult personal-connection and dating platform designed to connect consenting adults (`18+`) based on shared interests, personal values, conversation prompts, and mutual compatibility.  
2.2 **Not a Marriage Broker or Mail-Order Spouse Service (RA 10906 Compliance):**
- Humbble is **not** a marriage bureau, matrimonial agency, pen-pal club, or mail-order spouse business within the meaning of **Republic Act No. 10906** (the *Anti-Mail Order Spouse Act*) and its 2022 Implementing Rules and Regulations.
- Humbble does not match, offer, solicit, or introduce Filipino nationals to foreign nationals for marriage or common-law partnership for money, profit, or consideration, nor does it curate profiles as a nationality-based catalogue.
- Users control their own profile discovery, likes, and conversations. Any use of Humbble to operate, advertise, or solicit for a marriage-brokering scheme or commercial introduction agency is strictly prohibited and results in immediate permanent account termination and reporting to Philippine authorities.
2.3 **100% Free Mutual Messaging:** When two eligible users mutually express interest in one another ("Match"), text messaging between those matched users is **free of charge** across all membership tiers. Humbble never charges a pay-to-talk, pay-to-read, or per-introduction fee to unlock basic text communication with a Match.

---

## 3. Geographic Scope & Eligibility (`18+ Only`)

3.1 **Philippines-Only Initial Availability:** During the initial launch and invitation-only pilot phases, Humbble is intended solely for eligible adult residents located in the **Republic of the Philippines (`PH`)**. Access from the United States (`US`), Canada (`CA`), Australia (`AU`), the United Kingdom (`UK`), and other jurisdictions is deferred until separate legal and regulatory approval is completed.  
3.2 **Strict 18+ Age Requirement:** You must be at least **eighteen (18) years of age** to create an account, complete a profile, appear in discovery, or use any feature of Humbble.
- Enforced at signup and in database constraints (`birth_date <= CURRENT_DATE - INTERVAL '18 years'`).
- Your self-reported date of birth is an eligibility declaration and is **not** treated by Humbble as independent proof of verified age.
- Once submitted and confirmed at registration, your `birth_date` is locked against client modification and is never displayed directly to other users (only your calculated age or age range is shown).
3.3 **Personal Use & Legal Capacity:** You warrant that you are registering for your own personal, non-commercial use, have the legal capacity to enter into a binding contract under Philippine law, and are not barred from using the Service under applicable law or a prior safety suspension.

---

## 4. Account Registration, Profile Quality & Verification

4.1 **Account Security:** You are responsible for maintaining the confidentiality of your login credentials. You may maintain only one active account at a time.  
4.2 **Profile Completion Gate:** A newly created account defaults to non-discoverable (`is_discoverable = false`). To participate in discovery and swiping (`record_swipe`), your account must:
- Satisfy the 18+ age requirement;
- Complete required onboarding fields, including at least two (2) and up to six (6) compliant profile photos and three (3) profile prompts;
- Hold a verified status (`verification_status = 'verified'`) where verification is required for cohort participation; and
- Not be suspended (`is_suspended = false`).
4.3 **Age & Liveness Verification:** Humbble uses a vendor-independent verification workflow (`not_started`, `pending`, `verified`, `failed`, `requires_review`) to deter fake accounts, bots, and underage access. Humbble does **not** retain raw selfie images or biometric templates in its database or storage buckets (`Amendment A2`); only verification status metadata is stored. See [`legal/drafts/age-and-verification-flow.md`](./age-and-verification-flow.md).

---

## 5. Community Conduct & Statutory Prohibitions (`RA 10906` & `RA 11862`)

5.1 **Mandatory Compliance with Community Standards:** By using Humbble, you agree to comply with the [Community Standards](./community-standards.md), which are incorporated into these Terms.  
5.2 **Zero Tolerance for Human Trafficking & Exploitation (RA 11862):** In compliance with **Republic Act No. 11862** (*Expanded Anti-Trafficking in Persons Act of 2022*, amending RA 9208), you are strictly prohibited from using Humbble to:
- Recruit, transport, harbor, introduce, or match any person for prostitution, pornography, sexual exploitation, forced labor, slavery, or debt bondage;
- Introduce or match any person for marriage or common-law partnership for money, profit, or exploitation; or
- Upload, solicit, or distribute any Child Sexual Abuse or Exploitation Material (CSAEM / CSAM) or involve any person under 18 in any capacity.
5.3 **No Financial Solicitation or Romance Scams:** Soliciting money, cryptocurrency, gift cards, remittances, financial assistance, or off-platform commercial transactions from other users is strictly prohibited.  
5.4 **Intermediary Takedown & Law Enforcement Reporting Duty:** Pursuant to Section 9 of RA 11862, Humbble reserves the right and statutory duty to block access to or remove unlawful trafficking or exploitation content within **24 hours** of notice or knowledge, preserve relevant subscriber and traffic data as required by law (see [Deletion & Export Schedule](./deletion-and-export.md)), and report unlawful activities to the Department of Justice (DOJ-IACAT), Philippine National Police (PNP), National Bureau of Investigation (NBI), or Cybercrime Investigation and Coordinating Center (DICT-CICC) within **3 days**.

---

## 6. Safety Controls: Blocking, Reporting & Moderation

6.1 **Free Safety Tools for All Users:** Every user, whether on the Free tier or a paid subscription, has unconditional, free access to **Block**, **Report**, and **Unmatch** any other user at any time from any profile or conversation view.  
6.2 **Immediate Effect of Blocking:** Blocking another user immediately terminates any existing match, hides the conversation, and prevents either party from discovering, swiping on, or messaging the other.  
6.3 **Enforcement Actions:** Humbble may issue warnings, remove content, restrict discoverability, or suspend/terminate accounts that violate these Terms or the Community Standards. Users may appeal moderation decisions through the [Complaints Handling Procedure](./complaints-handling.md).

---

## 7. Subscriptions, Pricing & PayPal Sandbox Rules

7.1 **Current Sandbox-Only Mode (`NO LIVE BILLING`):** Until all legal, security, backup/restore, and operational release gates pass and the Owner issues written commercial launch authorization, all subscription checkouts operate strictly in **PayPal Sandbox (test mode)**. No real money may be charged, and no live payment credentials are enabled.  
7.2 **Core Free Features vs. Optional Premium Convenience (`Humbble Reserve`):**
- **Free Tier (`PHP 0.00`):** Profile creation, photo/prompt onboarding, verification, discovery feed, up to 15 outgoing likes per day (baseline planning quota subject to counsel/product confirmation), unlimited mutual-match text messaging, incoming likes count, and all safety tools (Block, Report, Unmatch).
- **Humbble Reserve (Optional Monthly Subscription):** Symmetric convenience features (unlimited daily outgoing likes, viewing the full "Liked You" grid, Incognito mode, and advanced shared-interest/lifestyle filters).
7.3 **Server-Managed Monthly Pricing (No Multi-Month Plans):**
- **Philippines (`PH` Market):** **`PHP 599.00 per month`** (`₱599.00/month`).
- **United States (`US` Market — Deferred/Disabled at Initial Launch):** **`USD 29.99 per month`** (`US$29.99/month`).
- These are separate market-specific monthly prices managed solely on the server—never currency-converted (`FX-converted`) and never determined by client input. Humbble offers **monthly plans only**; there are no 3-month, 6-month, or annual plans.
7.4 **Settlement-Gated Entitlement, Auto-Renewal & Cancellation:**
- Premium entitlements activate **only** after PayPal cryptographically confirms payment settlement (`PAYMENT.SALE.COMPLETED`) matching the exact server-catalogued plan ID, currency, and amount. Returning from a browser redirect alone does not grant premium access.
- When commercial billing is authorized in the future, subscriptions renew monthly until cancelled. You may cancel auto-renewal at any time in-app (`Billing Settings`) or through your PayPal account, and your paid features remain active through the end of the current paid monthly billing period unless revoked due to a payment reversal, refund, or safety ban. Full terms are set out in the [Subscription, Refund & Cancellation Disclosures](./subscription-refund-cancellation-disclosures.md).

---

## 8. User Content, License & Intellectual Property

8.1 **Your Content:** You retain ownership of the photos and prompt responses you upload to Humbble. By uploading content, you grant the Operator a limited, non-exclusive, revocable, royalty-free license to host, store, format, and display that content solely to authenticated users inside the Humbble service in accordance with your privacy settings and until you delete the content or your account.  
8.2 **Open-Source Software & Brand Rights:** The underlying source code repository includes components licensed under the MIT License (`LICENSE`), while the Humbble name, logos, `Banatao Systems` brand marks, and proprietary operational configurations remain reserved.

---

## 9. Account Deletion & Termination

9.1 **Self-Service Account Deletion:** You may delete your account at any time through `Settings -> Privacy & Account Deletion` (`SCR-19`). Upon verified deletion request, active sessions are revoked immediately, your profile is hidden from discovery, and your profile data and photos are purged in accordance with the [Account Deletion, Data Export & Retention Schedule](./deletion-and-export.md), subject only to mandatory statutory preservation holds.

---

## 10. Disclaimers, Limitation of Liability & Governing Law (`COUNSEL REVIEW REQUIRED`)

10.1 **No Guarantee of Matches or Offline Conduct:** Humbble provides an online venue for adults to connect over shared interests. While we implement age gates and verification workflows, we do not conduct criminal background checks on users and make no warranty regarding any user's offline conduct, character, or compatibility. Always follow safe-dating practices when communicating or meeting in person.  
10.2 **Limitation of Liability (`[COUNSEL TO DRAFT PHILIPPINE CIVIL CODE / RA 7394 COMPLIANT CLAUSE]`):** `[COUNSEL REVIEW REQUIRED: Confirm enforceable limitation of liability language under the Civil Code of the Philippines and Republic Act No. 7394, ensuring no waiver of non-waivable statutory consumer or data privacy rights.]`  
10.3 **Governing Law & Venue (`[COUNSEL TO CONFIRM]`):** These Terms shall be governed by and construed in accordance with the laws of the **Republic of the Philippines**, without prejudice to mandatory consumer protection provisions. `[COUNSEL REVIEW REQUIRED: Specify proper municipal/regional trial court venue in the Philippines once the Operator's principal office address is verified.]`
