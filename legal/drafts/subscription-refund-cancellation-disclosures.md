DRAFT—COUNSEL REVIEW REQUIRED

# Humbble — Draft Subscription, Auto-Renewal, Refund & Cancellation Disclosures

> **LEGAL NOTICE:** This document is an unapproved draft prepared for review by independent Philippine legal counsel (`GATE-LEGAL-01`) and the Payment Lead (`GATE-BILL-01`). **All billing in Humbble currently operates in PayPal Sandbox (test mode) only.** Live billing and production payment credentials are strictly disabled until the Owner issues written commercial launch authorization after all 12 release gates (`GATE-LEGAL-01` through `GATE-ROLL-01`) pass (`owner-decisions.md` §4; `docs/plan/Humbble_Execution_Build_Plan_v1.2.md` §V1.2 Amendment `A5`, §6).

- **Draft Version:** `0.1.0-draft` (20 October 2026)
- **Binding Plan Authorities:** `owner-decisions.md` §4; `docs/plan/Humbble_Execution_Build_Plan_v1.2.md` §V1.2 Amendment `A5`, §1.2, §3 (`PR P4-01`–`P4-04`), §6 (`GATE-BILL-01`).
- **Statutory Grounding:**
  - **Philippines (Initial Launch Market):** Republic Act No. 7394 (*Consumer Act of the Philippines*), Republic Act No. 11967 (*Internet Transactions Act of 2023*), Republic Act No. 8792 (*E-Commerce Act*), and Republic Act No. 10906 (*Anti-Mail Order Spouse Act* — pricing and feature symmetry);
  - **United States (Deferred Market — Disabled at Initial Launch):** Restore Online Shoppers' Confidence Act (**ROSCA**, 15 U.S.C. §§ 8401–8405), FTC Act Section 5, and applicable state Automatic Renewal Laws (e.g., Cal. Bus. & Prof. Code § 17600 *et seq.*). *(Note: The FTC's 2024 Negative Option / "Click-to-Cancel" Rule was vacated by the U.S. Court of Appeals for the Eighth Circuit on July 8, 2025 in Custom Communications, Inc. v. FTC, No. 24-3137; compliance for any future US launch is anchored in ROSCA, FTC Act § 5, and state ARLs.)*

---

## 1. Current Billing Environment Gate (`PAYPAL SANDBOX ONLY`)

1.1 **No Real Charges or Live Credentials:**
- All checkout endpoints (`/api/paypal/create-subscription`), webhook verifiers (`/api/paypal/webhook`), and billing UI screens (`SCR-02`, `SCR-20`, `SCR-21`) are restricted to **PayPal Subscriptions Sandbox**.
- No real money is charged, no live PayPal client secrets exist in any environment, and any test entitlement created in Sandbox applies only within development/staging test environments.
1.2 **Mandatory Sandbox UI Banner (`SCR-02`, `SCR-20`, `SCR-21`):**
> **SANDBOX TEST MODE ONLY:** Billing is currently running in PayPal Sandbox for non-commercial testing. Do not enter real financial credentials. No live payment is processed.

---

## 2. Server-Managed Monthly Plan Catalogue (`Amendment A5`)

### 2.1 Separate Monthly Market Prices — Never Currency-Converted (`No FX Conversion`)
Per `owner-decisions.md` §4 and `Plan v1.2` §V1.2 Amendment `A5`, Humbble defines **exactly two monthly plans**, stored and resolved **server-side only** by verified market:

| Plan Code | Market / Jurisdiction | Billing Frequency | Server-Authoritative Price & Currency | Launch Status |
|---|---|---|---|---|
| `reserve_ph_1m` | **Republic of the Philippines (`PH`)** | **Monthly (1 month recurring)** | **`PHP 599.00 / month`** (`₱599.00/month`) | **Primary Initial Market** *(Sandbox only until live gate)* |
| `reserve_us_1m` | **United States (`US`)** | **Monthly (1 month recurring)** | **`USD 29.99 / month`** (`US$29.99/month`) | **DEFERRED / DISABLED** at PH-only initial launch (`owner-decisions.md` §2, `Amendment A5`) |

### 2.2 Strict Architectural & Pricing Guardrails (`Amendment A5`)
1. **No Multi-Month Plans:** Earlier v1.1 references to 3-month (`reserve_3m`) or 6-month (`reserve_6m`) bundles are **permanently removed** by `Amendment A5`. Humbble offers **monthly plans only**.
2. **Separate Market Prices, Not FX Conversions:** `PHP 599.00/month` (`PH`) and `USD 29.99/month` (`US`) are independent, fixed regional market prices—never dynamically currency-converted from one another.
3. **Zero Trust in Client Price/Currency Input:** The client never sends a price, currency code, or arbitrary PayPal `plan_id` to `/api/paypal/create-subscription`. The server resolves the plan strictly from the authenticated user's server-verified market configuration. Non-PH markets are rejected at the PH-only initial launch.
4. **Symmetric Features Across All Users (`RA 10906` Guardrail):** Both Free and `Humbble Reserve` tiers apply identically regardless of user gender or nationality. Mutual text messaging between matched users is **100% free** on every tier.

---

## 3. Feature Comparison: Free Membership vs. `Humbble Reserve` (Monthly)

*(Note: Replaces the inaccurate hardcoded `PLANS` array in `app/(tabs)/profile.tsx:17-26` which listed two tiers `Premium+`/`Premium` and unbuilt features such as `"Get exclusive photo insights"` and `"Two compliments a weeks"`.)*

| Feature / Capability | Free Membership (`₱0.00`) | `Humbble Reserve` (`₱599.00 / month` in PH) |
|---|---|---|
| **Account Registration, 3 Prompts, 2–6 Photos & Age/Liveness Verification** | Included (`100% Free`) | Included (`100% Free`) |
| **Mutual Match Real-Time Text Messaging** | **Unlimited & 100% Free** | **Unlimited & 100% Free** |
| **Safety Controls (Block, Report, Unmatch)** | **Always 100% Free** | **Always 100% Free** |
| **Daily Outgoing Likes (`record_swipe`)** | **15 Likes per day** *(baseline planning limit subject to counsel/product confirmation)* | **Unlimited Outgoing Likes** |
| **Incoming Likes ("Liked You" — `SCR-14`)** | Displays truthful count of verified incoming likes | Unlocks full profile grid of users who liked you for instant matching |
| **Discovery Filters (`SCR-13`)** | Core age-range and shared-interest discovery | Advanced compatibility filters (lifestyle, languages spoken, education level) |
| **Incognito Mode (`is_incognito`)** | Not included | Included (your profile is shown in discovery only to people you like first) |

---

## 4. Authoritative Payment Settlement & Entitlement Rules (`Amendment A5` & `Plan v1.2` §6)

1. **No Entitlement on Browser Redirect or Unsettled Status:**
   - Returning from PayPal's checkout approval redirect (`/billing/success`) or receiving a `BILLING.SUBSCRIPTION.CREATED` / `BILLING.SUBSCRIPTION.ACTIVATED` webhook **without** verified payment settlement keeps `subscriptions.status = 'approval_pending'` and grants **zero** entitlement (`TEST-PAY-01`, `TEST-PAY-02`).
2. **Cryptographic Webhook Verification + Exact Plan/Currency/Amount Check (`Amendment A5`):**
   - Every webhook received at `/api/paypal/webhook` is verified cryptographically via PayPal's `POST /v1/notifications/verify-webhook-signature` endpoint using server-side credentials and the configured `PAYPAL_WEBHOOK_ID`.
   - `entitlements.is_active = TRUE` is granted or extended **only** when:
     1. A cryptographically verified `PAYMENT.SALE.COMPLETED` webhook (where `resource.state == 'completed'`) or an authoritative server-side PayPal REST check confirms payment settlement; **AND**
     2. The `provider_event_id` is recorded idempotently in `public.payment_events`; **AND**
     3. The settled **plan ID, currency (`PHP` for PH; `USD` for deferred US), and exact amount (`599.00` for PH; `29.99` for deferred US)** match the server plan catalogue (`Amendment A5`).
   - Any webhook where the plan ID, currency, or settled amount deviates from the server catalogue is routed to **quarantine + operational alert** and **never** grants entitlement (`Amendment A5`).

---

## 5. Subscription Lifecycle, Cancellation & Refund Rules (`COUNSEL REVIEW REQUIRED`)

### 5.1 Pre-Checkout Auto-Renewal Disclosure (`SCR-20` — Draft UI Copy)
> **[DRAFT CHECKOUT DISCLOSURE — `SCR-20` (`app/(paywall)/upgrade.tsx`)]**
>
> **Humbble Reserve — Monthly Subscription (`₱599.00 / month`)**
>
> - **Price & Billing Cycle:** `₱599.00 PHP` billed **monthly** via PayPal *(inclusive of applicable Philippine taxes — `[COUNSEL TO CONFIRM VAT / PERCENTAGE TAX WORDING]`)*. No multi-month commitment.
> - **Automatic Renewal:** When live billing is active, your subscription automatically renews each month at `₱599.00 PHP` unless you cancel at least 24 hours before the end of your current monthly billing period (`current_period_end`).
> - **Easy 2-Click Cancellation:** You can cancel auto-renewal at any time in `Profile -> Billing Settings` (`SCR-21`) or directly in your PayPal account (`Settings -> Payments -> Automatic Payments`).
> - **What Happens When You Cancel:** Cancelling stops all future monthly charges. You will continue to enjoy `Humbble Reserve` features until the end of your current paid monthly period (`current_period_end`), after which your account returns to the Free tier without losing any of your existing matches or conversations.
>
> `[ ] I understand and agree that my Humbble Reserve subscription will automatically renew at ₱599.00 PHP/month until I cancel, and I agree to the Terms of Service and Subscription & Refund Policy.`
>
> **[Continue to PayPal Sandbox]**

### 5.2 Deterministic State Transitions (`Plan v1.2` §6)
| Subscription State | Triggering Event | Entitlement Status (`has_active_entitlement`) | User-Facing Behavior (`SCR-21`) |
|---|---|---|---|
| `approval_pending` | User initiates checkout (`POST /api/paypal/create-subscription`) or returns from redirect before settlement | **`FALSE` (No entitlement)** | Shows `"Confirming payment settlement with PayPal..."` with safe refresh/retry button; expires if abandoned > 24h. |
| `active` | Verified `PAYMENT.SALE.COMPLETED` with exact plan/currency/amount match (`PHP 599.00`) | **`TRUE`** until `current_period_end` | Displays active badge, current period end date, payment receipt history, and `"Cancel Subscription"` button. |
| `past_due` | Verified `BILLING.SUBSCRIPTION.PAYMENT.FAILED` on monthly renewal | **`TRUE` during 5-day grace window** (`[COUNSEL & PRODUCT TO CONFIRM GRACE PERIOD]`) | Displays billing recovery banner prompting user to update payment method in PayPal. |
| `suspended` | Verified `BILLING.SUBSCRIPTION.SUSPENDED` after retry exhaustion | **`FALSE` (Immediately revoked)** | Notifies user that `Humbble Reserve` is paused due to unpaid renewal; basic mutual messaging and matches remain accessible on Free tier. |
| `cancelled` | User cancels in `SCR-21` (`/api/paypal/cancel-subscription`) or via PayPal (`BILLING.SUBSCRIPTION.CANCELLED`) | **`TRUE` until `current_period_end`** (`cancel_at_period_end = true`) | Confirms cancellation of future billing and displays exact timestamp (`current_period_end`) when Reserve access ends. |
| `expired` | `NOW() > current_period_end` on a `cancelled` subscription or `BILLING.SUBSCRIPTION.EXPIRED` | **`FALSE`** | Cleanly downgrades to Free tier; preserves all matches and chat history. |
| `revoked_refunded` | Verified `PAYMENT.SALE.REFUNDED` or `PAYMENT.SALE.REVERSED` (chargeback/reversal) | **`FALSE` (Immediately revoked)** | Immediately revokes premium entitlement (`current_period_end = NOW()`) and logs event to `public.audit_events` (`TEST-PAY-07`). |

### 5.3 Refund Policy (`COUNSEL REVIEW REQUIRED — RA 7394 / RA 11967`)
1. **Sandbox Mode:** No real funds are collected in PayPal Sandbox; refund webhooks are simulated for testing (`TEST-PAY-07`).
2. **Future Commercial Launch Refund Rules (`[COUNSEL TO CONFIRM]`):**
   - **Cancellation of Renewal:** Cancelling a monthly subscription prevents future monthly charges; partial-month prorated refunds are generally not issued for voluntary mid-cycle cancellations because `Humbble Reserve` access remains active through `current_period_end`, **except** where a refund is required under Philippine law (**RA 7394** / **RA 11967**).
   - **Duplicate Charges, Technical Failures, or Unauthorized Billing:** Any verified duplicate charge, billing error caused by platform fault, or statutory refund right under Philippine consumer law will be refunded in full via PayPal upon verification through the [Complaints Handling Procedure](./complaints-handling.md).
   - **Account Termination for Safety Violation:** Accounts permanently banned for violating the [Community Standards](./community-standards.md) or **RA 10906 / RA 11862** forfeit active entitlements without refund, to the extent permitted by Philippine law (`[COUNSEL TO CONFIRM ENFORCEABILITY]`).

---

## 6. Mobile App Store Billing Caveat (`PR P7-02` / `GATE-MOB-01`)

Per `docs/plan/Humbble_Execution_Build_Plan_v1.2.md` §3 (`PR P7-02`) and §8 (`GATE-MOB-01`), **PayPal Sandbox does not constitute mobile app-store billing compliance**. Before any public iOS App Store or Google Play Store release that sells digital subscriptions, Humbble must complete a dedicated Apple App Store Review Guideline `3.1.1` / Google Play Billing policy assessment and implement native In-App Purchase (`StoreKit` / `Google Play Billing`) where required, or keep native builds restricted to internal/closed testing without in-app PayPal checkout links.
