# PayPal Sandbox billing (P4)

Sandbox only. Live is refused unless `PAYPAL_ENV=live` **and** `PAYPAL_ALLOW_LIVE=true`, and the DB rejects any
`subscriptions.environment <> 'sandbox'` — a live launch needs a separate owner-approved migration.

## Edge Functions
| Function | Auth | Purpose |
|---|---|---|
| `paypal-create-subscription` | Supabase JWT | Body `{market: "PH"\|"US"}` only; price/plan resolved server-side; returns PayPal approval URL; records `approval_pending` row. |
| `paypal-webhook` | PayPal signature (`verify_jwt=false`) | Raw body verified via `POST /v1/notifications/verify-webhook-signature` with `PAYPAL_WEBHOOK_ID`; any error → 401 (fail closed). Event stored by unique `provider_event_id` before side effects; duplicates are no-ops. State is always taken from a fresh `GET /v1/billing/subscriptions/{id}` readback. |
| `paypal-cancel-subscription` | Supabase JWT | Cancels only when readback is `ACTIVE` (never `APPROVAL_PENDING`); premium lasts until period end. |

Entitlement (`public.entitlements`, key `premium`) is granted only by `billing_apply_readback` when readback is ACTIVE **and**
`billing_info.last_payment` exactly matches plan amount/currency and the stored plan ID. Mismatches are quarantined.
Refund/reversal revokes; suspended/expired deactivate.

## Server-only env vars (never `EXPO_PUBLIC_*`, never committed or logged)
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV=sandbox`, `BILLING_RETURN_URL`, `BILLING_CANCEL_URL`,
and one PayPal plan ID per currency: `PAYPAL_PLAN_ID_PHP`, `PAYPAL_PLAN_ID_USD`, `PAYPAL_PLAN_ID_EUR`, `PAYPAL_PLAN_ID_GBP`,
`PAYPAL_PLAN_ID_SEK`, `PAYPAL_PLAN_ID_NOK`, `PAYPAL_PLAN_ID_CAD`, `PAYPAL_PLAN_ID_AUD`, `PAYPAL_PLAN_ID_NZD`
(each PayPal plan must be created in that currency at exactly the `billing_plans.amount`; a currency without a plan ID returns `plan_not_configured`). Set with `supabase secrets set` on the staging project only after approval.

## Remaining (not done in this PR)
1. Create sandbox app + two monthly plans (PHP 599.00, USD 29.99) in PayPal developer dashboard.
2. Apply migration `20261023000020` to staging; deploy the three functions.
3. Register webhook URL `<functions-url>/paypal-webhook` for `BILLING.SUBSCRIPTION.*`, `PAYMENT.SALE.COMPLETED|REFUNDED|REVERSED`; set `PAYPAL_WEBHOOK_ID`.
4. Scheduled reconciliation job; counsel review of copy.

## Rollback
See the ROLLBACK block at the end of the migration. Disable checkout first; never delete ledger/audit rows.

## Local market pricing (OWN-PRICE-01, Oct 23 2026)

Markets are controlled only by DB flags (no env gate; `BILLING_ENABLE_US` is gone):

- `public.billing_plans` — one row per currency (`currency`, `amount`, `is_enabled`). Prices: PHP 599, USD 29.99, EUR 27.99, GBP 23.99, SEK 299, NOK 329, CAD 39.99, AUD 44.99, NZD 49.99.
- `public.billing_markets` — country code → plan (`is_enabled`). Service-role only; clients can't read it.
- Market precedence: `profiles.country_code` (ISO 3166-1 alpha-2, set in onboarding/settings) if it is an enabled market, then the
  client's advisory locale hint if it is an enabled market, then PH. Checkout resolves this server-side for the authenticated user
  (`billing_resolve_plan_for_user`, service_role only). Amount/currency always come from the DB and are re-checked on every webhook readback.

To change a price: add a new migration that `UPDATE`s `billing_plans.amount` **and** create a new PayPal plan at that price, then update
`PAYPAL_PLAN_ID_<CUR>`. Existing subscribers stay on their PayPal plan; readbacks for the old amount will no longer match, so migrate them deliberately.
To switch a country off: `UPDATE public.billing_markets SET is_enabled = false WHERE country_code = 'XX'` (in a migration).
