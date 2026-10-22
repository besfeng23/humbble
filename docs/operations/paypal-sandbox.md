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
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV=sandbox`, `PAYPAL_PLAN_ID_PH`, `PAYPAL_PLAN_ID_US`,
optional `BILLING_ENABLE_US=true` (US US$29.99 plan; also needs `billing_plans.is_enabled`), `BILLING_RETURN_URL`, `BILLING_CANCEL_URL`. Set with `supabase secrets set` on the staging project only after approval.

## Remaining (not done in this PR)
1. Create sandbox app + two monthly plans (PHP 599.00, USD 29.99) in PayPal developer dashboard.
2. Apply migration `20261023000020` to staging; deploy the three functions.
3. Register webhook URL `<functions-url>/paypal-webhook` for `BILLING.SUBSCRIPTION.*`, `PAYMENT.SALE.COMPLETED|REFUNDED|REVERSED`; set `PAYPAL_WEBHOOK_ID`.
4. Scheduled reconciliation job; counsel review of copy.

## Rollback
See the ROLLBACK block at the end of the migration. Disable checkout first; never delete ledger/audit rows.
