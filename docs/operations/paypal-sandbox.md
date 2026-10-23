# PayPal Sandbox billing (P4)

Sandbox only. Two independent guards keep live billing off (they are different layers; do not conflate them):

1. **Edge function guard (fail closed).** `paypal-create-subscription` refuses every non-sandbox environment
   (`503 live_paypal_refused`) **before plan resolution and before any PayPal call**, even when `PAYPAL_ENV=live` and
   `PAYPAL_ALLOW_LIVE=true` (`loadPayPalConfig` itself already refuses `live` unless both are set). `PAYPAL_ENV` defaults to
   `sandbox`. Enabling live later needs a reviewed code change to this check *and* the database guard below.
2. **Database guard (unconditional).** `billing_register_pending_subscription(..., p_environment)` records the *real*
   environment (`sandbox`|`live`) and raises `live_environment_refused` for anything but `sandbox`; the
   `subscriptions.environment` CHECK also rejects `live`. Even with both env vars set, a live launch still needs a separate,
   owner-approved migration that relaxes these two DB checks. Because the function now refuses before calling PayPal, no orphaned live subscription can be created.

## Edge Functions
| Function | Auth | Purpose |
|---|---|---|
| `paypal-create-subscription` | Supabase JWT | Body `{country?: "<ISO 3166-1 alpha-2>"}` (advisory hint only; empty body allowed); market, plan and price are resolved server-side (profile country, then validated hint, then PH); returns PayPal approval URL; records `approval_pending` row. |
| `paypal-webhook` | PayPal signature (`verify_jwt=false`) | Raw body verified via `POST /v1/notifications/verify-webhook-signature` with `PAYPAL_WEBHOOK_ID`; any error → 401 (fail closed). Event stored by unique `provider_event_id` before side effects; duplicates are no-ops. State is always taken from a fresh `GET /v1/billing/subscriptions/{id}` readback. |
| `paypal-reconcile` | `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (constant-time compare; `verify_jwt = true` in `config.toml`, which applies to CLI deploys only — a deploy through the MCP/API/dashboard must pass `verify_jwt=true` explicitly; 401/500 before any config or PayPal call) | Scheduled safety net. Re-processes quarantined/stuck ledger events, then re-reads PayPal for pending/active/stale subscriptions through the same apply path as the webhook. Also retries pending PayPal-side cancels of refunded/revoked subscriptions (sandbox only). Never grants on its own; premium still needs readback ACTIVE + matching last payment. |
| `paypal-cancel-subscription` | Supabase JWT | Cancels only when readback is `ACTIVE` (never `APPROVAL_PENDING`); premium lasts until period end. |

Entitlement (`public.entitlements`, key `premium`) is granted only by `billing_apply_readback` when readback is ACTIVE **and**
`billing_info.last_payment` exactly matches plan amount/currency and the stored plan ID. Mismatches are quarantined.
Refund/reversal revokes; suspended/expired deactivate.

### Ledger privileges (F1) and terminal state (F3)
- `public.payment_events` is write-protected by **privileges**, not only by the update trigger: migration `...0051` revokes everything
  from `PUBLIC`, `anon`, `authenticated` and `service_role`, then grants `service_role` only `SELECT`, `INSERT` and column-level
  `UPDATE (status, provider_verified, processed_at, legal_hold)` (`retention_until` removed by `...0060`; **all** UPDATE columns removed by `...0090`, so `service_role` has `SELECT`, `INSERT` only, see
  `docs/operations/privilege-hardening.md`, which also applies this pattern to `audit_events`, `consent_records`, `privacy_requests`,
  `subscriptions` and `entitlements`). `DELETE`, `TRUNCATE`, table-level `UPDATE`,
  `REFERENCES` and `TRIGGER` are gone (Supabase default privileges had granted them). The Edge Functions only use the
  SECURITY DEFINER `billing_*` RPCs, which run as `postgres`. pgTAP `0022` asserts this **as `service_role`** and checks the error is a
  permission error, not the trigger. After deploying, confirm on the project:
  `select has_table_privilege('service_role','public.payment_events', p) from unnest(array['DELETE','TRUNCATE','UPDATE']) p;` → all false.
- A `refunded`/`revoked` subscription is terminal: `billing_apply_readback` returns `terminal_state` (no change, audited once per event) for any
  non-terminal readback, so a stale ACTIVATED event or a still-ACTIVE PayPal subscription cannot re-grant premium. The reconciler does not
  re-read events or subscriptions of terminal subscriptions (refund/reversal events are still retried). A new purchase is a new
  subscription and grants normally. A refunded/revoked subscription that is still ACTIVE at PayPal is cancelled there (sandbox only, idempotent, retried by the reconciler, never blocks the revoke): see `docs/operations/billing-trust-model.md`.

### Sale-only events (G1) and retryable quarantine (G2)
`PAYMENT.SALE.REFUNDED` carries `resource.sale_id` and no `billing_agreement_id` (and `PAYMENT.SALE.REVERSED` carries the sale as
`resource.id`). When no subscription ID is present the function calls `GET /v1/payments/sale/{id}` and uses the returned
`billing_agreement_id` to find the subscription, then applies the normal refund/reversal rule. If the sale cannot be fetched or
carries no agreement ID the event is **not** dropped: it is quarantined, flagged `refund_unresolved` in `audit_events`, and the
webhook returns 503 so PayPal redelivers; the reconciler also retries it for 72 h. Check these in the audit log after tests.

A `settlement_mismatch` / `settlement_unconfirmed` quarantine is no longer terminal. The ledger guard allows
`quarantined -> processing`, so PayPal redelivery or the reconciler re-evaluates the event once PayPal settles (a PayPal sale can
read `PENDING` for a while). Only `processed` short-circuits as a duplicate. Genuine mismatches stay quarantined and are
re-checked for 72 h, then left for manual review.

## Server-only env vars (never `EXPO_PUBLIC_*`, never committed or logged)
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV=sandbox`, `BILLING_RETURN_URL`, `BILLING_CANCEL_URL`,
and one PayPal plan ID per currency: `PAYPAL_PLAN_ID_PHP`, `PAYPAL_PLAN_ID_USD`, `PAYPAL_PLAN_ID_EUR`, `PAYPAL_PLAN_ID_GBP`,
`PAYPAL_PLAN_ID_SEK`, `PAYPAL_PLAN_ID_NOK`, `PAYPAL_PLAN_ID_CAD`, `PAYPAL_PLAN_ID_AUD`, `PAYPAL_PLAN_ID_NZD`
(each PayPal plan must be created in that currency at exactly the `billing_plans.amount`; a currency without a plan ID returns `plan_not_configured`). Set with `supabase secrets set` on the staging project only after approval.

## Reconciler schedule (documented only — nothing is scheduled by any migration)
`paypal-reconcile` is meant to run every 10 minutes. No cron job is created by the repo. After the function is deployed to
staging **and** an owner approves, schedule it from the SQL editor (needs `pg_cron` + `pg_net`, with the project URL and service-role
key stored in Vault, never in SQL text or git):

```sql
select cron.schedule(
  'paypal-reconcile', '*/10 * * * *',
  $$ select net.http_post(
       url     := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_url') || '/paypal-reconcile',
       headers := jsonb_build_object('Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
       body    := '{}'::jsonb) $$);
-- remove: select cron.unschedule('paypal-reconcile');
```
It paces PayPal calls (200 ms), processes at most 50 events and 50 subscriptions per run, and logs one JSON line of counts
(never payloads or secrets). Alternatives with the same Bearer header: a GitHub Actions cron or any external scheduler.
It does **not** yet list PayPal transactions to detect refunds that never produced a webhook (follow-up).

## Sandbox test steps
1. Unit tests: `cd supabase/functions && deno test --node-modules-dir=none --allow-env --allow-net send-push/ _shared/`.
2. DB tests: `supabase test db` (`0015`, `0016`, `0021` cover the billing RPCs, environment guard and quarantine healing).
3. In the sandbox, subscribe with a sandbox buyer. Expect `approval_pending` → `active` + premium after the webhook/readback.
   Verify the `payment_events` row is `processed`.
4. Refund the sale in the sandbox dashboard. Expect the refund webhook (sale-only shape) → premium revoked, event `processed`;
   if the sale lookup fails expect a quarantined event plus a `refund_unresolved` audit row and a 503 to PayPal.
5. Call the reconciler by hand: `curl -X POST -H "Authorization: Bearer $SERVICE_ROLE_KEY" <functions-url>/paypal-reconcile`
   and check the returned counts. A request without the Bearer returns 401.
6. Webhook verification (G8): the signature check forwards the exact raw body to `verify-webhook-signature`. Confirm a real
   sandbox delivery verifies (this has not been exercised against PayPal in CI).

## Remaining before sandbox is usable
1. Create sandbox app + nine monthly plans (one per `billing_plans` currency) in the PayPal developer dashboard.
2. Apply migrations through `20261023000090` to staging **and deploy `paypal-create-subscription` and `paypal-webhook` together with
   it** (the 4-argument `billing_register_pending_subscription` is dropped); deploy `paypal-reconcile`. Migration `...0090` also drops the 7-argument `billing_apply_readback`: deploy `paypal-webhook`, `paypal-reconcile` and `paypal-cancel-subscription` **together** with it (see `docs/operations/billing-trust-model.md`).
3. Register webhook URL `<functions-url>/paypal-webhook` for `BILLING.SUBSCRIPTION.*`, `PAYMENT.SALE.COMPLETED|REFUNDED|REVERSED`; set `PAYPAL_WEBHOOK_ID`.
4. Owner-approved schedule for the reconciler (above); counsel review of copy.

## Rollback
See the ROLLBACK block at the end of the migration. Disable checkout first; never delete ledger/audit rows.

## Local market pricing (OWN-PRICE-01, Oct 23 2026)

Markets are controlled only by DB flags (no env gate; `BILLING_ENABLE_US` is gone). Country is looked up through the
`{country}` market mapping in `billing_markets` (`country_code` → `plan_key`), seeded for the nine currencies below:

- `public.billing_plans` — one row per currency (`currency`, `amount`, `is_enabled`). Prices: PHP 599, USD 29.99, EUR 27.99, GBP 23.99, SEK 299, NOK 329, CAD 39.99, AUD 44.99, NZD 49.99.
- `public.billing_markets` — country code → plan (`is_enabled`). Service-role only; clients can't read it.
- Market precedence: `profiles.country_code` (ISO 3166-1 alpha-2, set in onboarding/settings) if it is an enabled market, then the
  client's advisory locale hint if it is an enabled market, then PH. Checkout resolves this server-side for the authenticated user
  (`billing_resolve_plan_for_user`, service_role only). Amount/currency always come from the DB and are re-checked on every webhook readback.

To change a price: add a new migration that `UPDATE`s `billing_plans.amount` **and** create a new PayPal plan at that price, then update
`PAYPAL_PLAN_ID_<CUR>`. Existing subscribers stay on their PayPal plan; readbacks for the old amount will no longer match, so migrate them deliberately.
To switch a country off: `UPDATE public.billing_markets SET is_enabled = false WHERE country_code = 'XX'` (in a migration).
