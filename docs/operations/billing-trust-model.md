# Billing trust model: how a premium entitlement is granted

Migration `20261023000090_security_followups_themis_pr36.sql` (Themis PR #36 review F-01, PR #35 re-review N1).
pgTAP: `supabase/tests/0024_billing_readback_evidence.test.sql` (new behaviour), `0015`, `0022`, `0023` (existing flows, updated).
Deno: `supabase/functions/_shared/billing.test.ts`, `paypalFixes.test.ts`.

## The problem that was fixed (F-01)
`billing_apply_readback(subscription, plan, status, period_end, amount, currency, event)` decided on **parameters its caller supplied**.
Anyone holding the service-role key could call `billing_register_pending_subscription` and then `billing_apply_readback('active', 599.00, 'PHP')`
and receive an active entitlement without PayPal being involved (demonstrated in the review, rolled back). Table DML was already closed; the
function was the hole.

## The model now
A grant needs a **stored readback record** that the database itself checks. There are two steps and the second takes no data from the caller:

1. `billing_record_readback(subscription_id, plan_id, raw_paypal_status, period_end, amount, currency, event_id)` stores one row in
   `public.billing_readbacks` (kind `subscription_read`) and returns its id. It maps the **raw PayPal status string** itself
   (`private.billing_map_paypal_status`, identical to `mapPayPalStatus` in `_shared/paypal.ts`; unknown strings fail closed to `approval_pending`).
   If an `event_id` is cited, it must be an existing, `provider_verified`, `provider = 'paypal'` ledger row for the same subscription
   (`22023 readback_event_not_verified`). `billing_record_refund_readback(...)` does the same for refunds and only accepts a verified
   `PAYMENT.SALE.REFUNDED` / `PAYMENT.SALE.REVERSED` event (`22023 refund_requires_verified_refund_event`).
2. `billing_apply_readback(readback_id)` loads that row and decides. It never accepts status/amount/currency parameters (the old
   7-argument function is dropped). The database enforces, in this order:
   unknown id (`unknown_readback`), already consumed (`readback_already_applied`), unknown subscription, **fresh** (recorded within
   15 minutes, else `readback_stale`), terminal subscription (`terminal_state`), PayPal plan equals the subscription's plan (`plan_mismatch`),
   and for `active`: last payment amount and currency equal `billing_plans` for the subscription's plan **exactly** and the period end lies in
   the future (`settlement_mismatch`). Only then does it return `granted`. A `revoked` status can never come from a readback; only `refunded`
   (via the verified refund path) or the cancellation outcomes can end an entitlement.
3. Every readback is **single use**: applying marks `applied_at` and `apply_outcome`. The table is write-protected: `service_role` has `SELECT` only,
   a row trigger (`ENABLE ALWAYS`) allows only the one `NULL -> value` consume transition (even the owner gets `42501`), `DELETE`/`TRUNCATE` are blocked.

Result: a bare `service_role` call with arbitrary parameters now returns `unknown_readback`; a forged status, amount, currency or plan is judged by
the database against `billing_plans` and recorded as a mismatch, not a grant. pgTAP `0024` asserts each as `service_role`.

## What is still trusted (residual risk, read this before going live)
- `billing_record_event` records `provider_verified = TRUE` on the caller's word. The Edge Function sets it only after PayPal's
  `verify-webhook-signature` succeeds, but the database cannot check that. A holder of the service-role key can still fabricate a verified event and
  then a readback that cites it, and obtain a grant for a correctly priced plan. This closes the "one call mints premium with any amount" path, not
  the "service-role key compromise" path. Recommended before live money: (a) an HMAC attestation computed by the Edge Function with a secret that
  never leaves it and verified inside `billing_record_event`, or (b) a dedicated narrow database role for the billing functions that is not the
  general service-role key. Both are deferred (design decision for the owner).
- The readback fields (status, amount, period end) are still supplied by the Edge Function after it read PayPal; the database verifies **consistency**
  with the price list and the plan, not that PayPal said so. Same mitigation as above.
- A readback stays usable for 15 minutes (replay window). It can be applied once only.
- `billing_register_pending_subscription` is unchanged (service_role). It creates a subscription that cannot be granted without the checks above.

## Deploy order (breaking change)
The migration drops `billing_apply_readback(text,text,subscription_status,timestamptz,numeric,text,uuid)`. Deploy the migration **and** the Edge Functions
`paypal-webhook`, `paypal-reconcile`, `paypal-cancel-subscription` (they call `billing_record_readback`/`billing_record_refund_readback` then
`billing_apply_readback(uuid)`) together. Between the two, a webhook still running the old code fails with a function-not-found error and
PayPal redelivers / the reconciler retries (no data loss, no grant).

## Cancelling a refunded subscription at PayPal (N1 / F-05)
When a subscription becomes `refunded`/`revoked` locally, `billing_apply_readback` sets `subscriptions.provider_cancel_status = 'pending'`
(existing refunded/revoked PayPal rows are back-filled to `pending` once). After the revoke commits, the Edge Function (webhook, reconciler) calls
`attemptProviderCancel`: **sandbox only**; it re-reads PayPal and, only if the subscription is still `ACTIVE`/`SUSPENDED` there, calls the existing
`cancelSubscription`, then records `done` (`billing_record_provider_cancel`). A failure records `failed` and leaves it `pending`; the reconciler lists
`billing_list_pending_provider_cancels` (5-minute back-off, 20 attempts then `failed` plus an alert) and retries. It is idempotent (an already
cancelled subscription is recorded `done`; a late `failed` cannot reopen a `done`) and **never blocks or reverses the premium revoke**.
In `live` environments nothing is cancelled automatically; the row stays `pending` for manual handling.
