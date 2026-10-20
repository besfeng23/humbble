DRAFT—AWAITING OWNER SIGNATURE (independent legal review WAIVED BY OWNER, 2026-10-21 02:42 PHT; owner risk acceptance, not legal clearance)

# ADR-003: International Paying Audience (US/CA/AU/UK) for Affiliate Growth — Partially Supersedes ADR-002

- **ADR ID:** `ADR-003`
- **Status:** `PROPOSED` (draft). **Acceptance requires only Mark Johnson's signature** (Owner decision, 2026-10-21 02:42 PHT). It has no effect on code, product copy, market configuration, discovery ranking or marketing materials until signed.
- **Date:** 21 October 2026
- **Decider:** Mark Johnson (Product/Owner).
  - **GATE-OWN-MKT-01 = Option 2** (2026-10-21 02:18 PHT).
  - Independent lawyer review (GATE-LEGAL-02 and the lawyer-opinion part of GATE-LEGAL-01) **waived by Owner** (2026-10-21 02:42 PHT).
- **Supersedes (partially, on signature):** ADR-002 §2.1 (Philippines-only market) and the nationality-pairing positioning restrictions in ADR-002 §2.2, **for the affiliate-growth goal G-AFF-01 only**. ADR-002's other guardrails stay in force.
- **Governing references:** `/workspace/humbble-plan/owner-decisions.md` (§2, §4, §6; addendum items 7–8); `docs/plan/Humbble_Execution_Build_Plan_v1.3.md` §V1.3 B0, B1, B2, B13, B14, B15; ADR-002.

---

## 1. Context

The Owner's commercial goal is a competitive international dating platform connecting men worldwide with genuine Filipina singles, grown through affiliate and performance acquisition. The target paying audience is international men in the US, CA, AU and UK.

The Owner has waived independent legal review and **accepts the legal risk personally**. This waiver is not legal clearance. The documented risks remain:
- **US IMBRA, 8 U.S.C. § 1375a.** The dating-service exemption in (e)(4)(B)(ii) requires that the principal business is *not* international dating between US persons and foreign nationals, *and* that rates and services are comparable regardless of gender or citizenship. Otherwise broker duties apply: background-information collection, sex-offender registry search, disclosures, and consent before sharing contact details. [PRELIMINARY]
- **Philippine RA 10906 §3.** Prohibits profit-making matching of Filipinos with foreign nationals for marriage, advertising such schemes, and soliciting Filipinos into them. Legitimate shared-interest dating websites are carved out. The criminal penalties are summarised in ADR-002. [PRELIMINARY]
- **RA 11862** intermediary duties; **RA 10173** privacy and cross-border transfer rules; consumer, auto-renewal, online-safety and affiliate-disclosure rules in each target market. [PENDING-DEEP-RESEARCH]

## 2. Proposed decision (effective only on Mark's signature)

1. **Target audience and markets.** For G-AFF-01, the target paying audience is international men in **US, CA, AU and UK** seeking genuine Filipina singles. Philippine members remain the supply side, recruited through consent-based channels.
2. **Market enablement.** Markets are enabled one at a time by explicit Owner release, after: this ADR is signed; **OWN-PRICE-01** is decided; the v1.2 18+/safety/security/privacy/ops gates pass (the lawyer-opinion part is waived); DEP-BILL-01 for any paid feature; and spend and outreach approvals by Mark. Until then non-PH markets stay disabled (§A5).
3. **Binding mitigations (Owner-mandated, not optional):**
   1. No bride, mail-order, marriage-broker, spouse-catalogue or similar language in product, landers, ads or affiliate creatives. No guaranteed outcomes, objectifying copy, or misleading availability or member counts.
   2. **Identical pricing and features regardless of gender or citizenship.**
   3. 18+ gate at UI and DB; vendor-independent verification; no raw selfie or biometric retention; all safety gates.
   4. No fake, seeded, staff-operated or AI-persona profiles; no fabricated conversations; no deceptive claims by Humbble or affiliates.
4. **OWN-PRICE-01 (open owner decision).** Mitigation 2 conflicts with the current market pricing (US$29.99 vs ₱599/month, plan §A5). Mark must choose: (a) **equalize** pricing across markets, which supports IMBRA comparability and requires a §A5 change; or (b) **keep** market pricing and accept the additional IMBRA-exemption risk. Until decided, non-PH markets stay disabled.
5. **IMBRA broker status** is unreviewed (legal review waived). If the Owner later wants certainty, engaging counsel remains available. If Humbble is treated as a broker, IMBRA compliance would need a separate design ADR, privacy review and budget.
6. **Unchanged guardrails:** DOB hidden; free mutual messaging; free block/report/unmatch; shared-interest discovery signals; ToS prohibition of trafficking and exploitation with a takedown path; Sandbox-only billing until Mark approves live; ₱10,000/month planning-only ceiling; roles only; RED-APPLE proposed and unverified.

## 3. Consequences

- Discovery ranking, onboarding copy, landing pages, market config and affiliate creatives need follow-up PRs **after** signature. None is authorised by this draft.
- Nothing in the repository may call Humbble "legally reviewed", "legally cleared" or "compliant" on the basis of this ADR.
- Until signature, ADR-002 continues to govern all code and copy.

## 4. Acceptance checklist

- [ ] OWN-PRICE-01 decided by Mark (equalize vs accept risk), recorded in this ADR.
- [ ] Mark Johnson's written signature/acceptance, naming the markets and effective date.
- [ ] ADR-002 status updated to "Partially superseded by ADR-003" in the same PR as acceptance.
- [ ] *(Optional)* independent counsel opinion, if the Owner later chooses to obtain one.
