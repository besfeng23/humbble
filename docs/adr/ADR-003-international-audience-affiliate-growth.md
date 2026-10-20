DRAFT—COUNSEL REVIEW REQUIRED

# ADR-003: International Paying Audience (US/CA/AU/UK) for Affiliate Growth — Partially Supersedes ADR-002

- **ADR ID:** `ADR-003`
- **Status:** `PROPOSED` (draft). **Not Accepted.** It has no effect on code, product copy, market configuration, discovery ranking or marketing materials until (1) **GATE-LEGAL-02** delivers a written opinion and (2) the Owner signs acceptance, amended as the opinion requires.
- **Date:** 21 October 2026
- **Deciders:**
  - Mark Johnson (Product/Owner): market decision **GATE-OWN-MKT-01 = Option 2**, given 2026-10-21 02:18 PHT.
  - Independent Philippine Legal Counsel: appointed by the Owner; `UNAPPOINTED`, required for GATE-LEGAL-02.
- **Supersedes (partially, on acceptance):** ADR-002 §2.1 (Philippines-only market) and the nationality-pairing positioning restrictions in ADR-002 §2.2, **for the affiliate-growth goal G-AFF-01 only**.
- **Governing references:** `/workspace/humbble-plan/owner-decisions.md` (§2, §4, §6, and the 2026-10-21 addendum); `docs/plan/Humbble_Execution_Build_Plan_v1.3.md` §V1.3 B0, B1, B2, B14, B15; ADR-002.

---

## 1. Context

The Owner has set a commercial goal: a competitive international dating platform connecting men worldwide with genuine Filipina singles, grown through affiliate and performance acquisition, with international men in the US, CA, AU and UK as the target paying audience. ADR-002 currently restricts the initial market to the Philippines and forbids nationality-pairing positioning.

The Owner's decision raises legal exposure that the repository cannot resolve:
- **US IMBRA, 8 U.S.C. § 1375a.** The dating-service exemption in (e)(4)(B)(ii) requires that the principal business is *not* international dating between US persons and foreign nationals, *and* that rates and services are comparable regardless of gender or citizenship. Otherwise broker duties apply: background-information collection, sex-offender registry search, disclosures, and consent before sharing contact details. [PRELIMINARY]
- **Philippine RA 10906 §3.** Prohibits profit-making matching of Filipinos with foreign nationals for marriage, advertising such schemes, and soliciting Filipinos into them. Legitimate shared-interest dating websites are carved out. [PRELIMINARY; summarised in ADR-002]
- **RA 11862** intermediary duties and **RA 10173** privacy and cross-border transfer rules. [PENDING-DEEP-RESEARCH]
- Consumer, auto-renewal, online-safety and affiliate-disclosure rules in each target market. [PENDING-DEEP-RESEARCH]

## 2. Proposed decision (effective only on acceptance)

1. **Target audience and markets.** For G-AFF-01, the target paying audience is international men in **US, CA, AU and UK** seeking genuine Filipina singles. Philippine members remain the supply side, recruited through consent-based, neutral PH channels.
2. **Market enablement order.** Markets are enabled one at a time, by explicit Owner release, after: GATE-LEGAL-02; jurisdiction-specific advice the lawyer directs; GATE-LEGAL-01 and the v1.2 release gates; and DEP-BILL-01 for any paid feature. Before that, non-PH markets stay disabled as in §A5.
3. **Positioning.** Positioning may name the international, cross-cultural nature of the service only in wording the lawyer approves. Marriage-broker, mail-order-spouse and bride-catalogue language stays **prohibited**, as do objectifying copy, guaranteed outcomes, and misleading availability or member counts.
4. **Comparability.** Pricing and features stay symmetric regardless of gender or country of citizenship unless the lawyer advises otherwise. Whether market-specific prices (US$29.99 / ₱599) are compatible with IMBRA comparability is an explicit question for the lawyer.
5. **IMBRA path.** If the lawyer concludes Humbble would be an international marriage broker, the Owner must decide either to (a) implement IMBRA compliance (requiring a separate design ADR, privacy review and budget) or (b) amend this ADR to keep the service within the exemption.
6. **Unchanged guardrails (not superseded):**
   - 18+ gate at UI and DB; vendor-independent verification; no raw selfie or biometric retention.
   - DOB hidden; free mutual messaging; free block/report/unmatch.
   - No fake, seeded or staff-operated profiles; affiliates may not misrepresent availability or outcomes.
   - Sandbox-only billing; ₱10,000/month planning-only ceiling; roles only.
   - RED-APPLE proposed and unverified.

## 3. Consequences

- Discovery ranking, onboarding copy, landing pages, market config and affiliate creatives will need follow-up PRs **after** acceptance. None is authorised by this draft.
- The legal review packet gains the GATE-LEGAL-02 question set (plan §B2, questions 1–9).
- Until acceptance, ADR-002 continues to govern all code and copy.

## 4. Acceptance checklist (all required)

- [ ] Independent Philippine lawyer appointed by the Owner (DEP-LEGAL-01).
- [ ] GATE-LEGAL-02 written opinion received (RA 10906, RA 11862, RA 10173, IMBRA, plus target-market advice as directed).
- [ ] This ADR amended to reflect the opinion.
- [ ] Owner written acceptance, naming the markets and the effective date.
- [ ] ADR-002 status updated to "Partially superseded by ADR-003".
