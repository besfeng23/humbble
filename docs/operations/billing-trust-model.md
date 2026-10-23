# Billing trust model: how a premium entitlement is granted

Migration `20261023000090_security_followups_themis_pr36.sql` (Themis PR #36 review F-01, PR #35 re-review N1).
pgTAP: `supabase/tests/0027_billing_readback_evidence.test.sql` (new behaviour), `0015`, `0022`, `0023` (existing flows, updated).
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
the database against `billing_plans` and recorded as a mismatch, not a grant. pgTAP `0027` asserts each as `service_role`.

## What is still trusted: the service_role key can grant or revoke premium for ANY user (Themis P39-01)
**State this plainly: this change does not make the service-role key harmless.** A holder of the service-role key (project owners/admins, the Edge
Function runtime environment, any CI/CD or secret store that received it) can grant premium to any user with **no ledger event at all and without
PayPal being involved**, using three calls and only the public price list:

1. `billing_register_pending_subscription(user, plan_key, 'I-ANYTHING', 'P-ANYTHING', 'sandbox')` (a `'live'` registration is refused today with `live_environment_refused`, so this path is sandbox-only until the live-billing migration lands; that refusal is a second line of defence, not a fix for the key problem)
2. `billing_record_readback('I-ANYTHING', 'P-ANYTHING', 'ACTIVE', now() + 30 days, <amount and currency copied from public billing_plans>, NULL)`
   (the event id is optional for a status readback, so nothing in `payment_events` is needed)
3. `billing_apply_readback(<id returned by step 2>)` -> `granted`, active `premium` entitlement. `payment_events` has 0 rows for that subscription (verified by Themis).

The same key can **revoke** any user's premium (`billing_record_event('...PAYMENT.SALE.REFUNDED...')` + `billing_record_refund_readback` + apply), or
fabricate a verified ledger event first so the trail looks clean. The price check does bite (wrong amount/currency/plan are rejected), but its inputs are
public. What F-01 closed is the **single unauthenticated-parameter call**; it did not close the **compromised-key** path. The database cannot tell the
Edge Function's honest call from a forged one because both come from the same role with the same arguments.

**Severity:** sandbox/dev MEDIUM (no money). **Live PayPal: HIGH. Billing must stay sandbox-only until BOTH controls below are in place:**
1. **A database-verified control** so a leaked general key is not enough: either (a) an HMAC attestation over (subscription, plan, status, amount, currency,
   period end, event id) computed by the Edge Function with a secret the database verifies (Vault) inside `billing_record_readback` /
   `billing_record_event`, or (b) a narrow billing role/JWT that only the billing functions are granted to, not the general service-role key. Also make
   the event citation mandatory for grants and bind it to a database-resolved subscription (P39-02).
2. **A detective control, cross-checked against PayPal itself**: a scheduled job that alerts on any active PayPal entitlement without a
   provider-verified `payment_events` row for its subscription (and on any revoke without a verified refund event). **On its own this does NOT
   catch a compromised key**: the same key can first write a "verified" ledger event with `billing_record_event` and then grant, and a
   "grant with no verified event" alert sees nothing. The check is only meaningful if it is reconciled against an **independent PayPal-side source**
   (the PayPal Subscriptions/Transactions API or the transaction report, read with credentials the database/service-role key does not hold): every
   active entitlement must correspond to an ACTIVE PayPal subscription and a real payment there. Without that cross-check it detects mistakes and
   unsophisticated abuse, not a key holder.

Neither control exists yet. Other limits: the readback fields (status, amount, period end) come from the Edge Function after it read PayPal, so the
database verifies consistency with the price list and plan, not that PayPal said so; a readback is replayable for 15 minutes (single use);
`billing_register_pending_subscription` is unchanged (service_role).

### What a cited ledger event proves (P39-02)
For a status readback the optional `event_id` is an **audit trail, not authorization**. The check is **event-type prefix-wide, not grants-only**:
a `BILLING.SUBSCRIPTION.CANCELLED`, `SUSPENDED` or `EXPIRED` event can be cited by an ACTIVE readback, and so can `PAYMENT.SALE.DENIED`; only refund/reversal
types and unrelated event families are refused. The recorder checks that it exists, is `provider_verified`, is
for PayPal, is of type `BILLING.SUBSCRIPTION.*` or `PAYMENT.SALE.*` (never a refund/reversal; unrelated types are refused with
`readback_event_type_not_allowed`), and, for subscription events and for any ledger row whose `resource_id` is a subscription id, refers to the same
subscription. A `PAYMENT.SALE.*` event carries a sale id; the Edge Function resolves it to a subscription through PayPal, which the database cannot
re-check, so for those the binding is not enforced. Storing a database-resolved `provider_subscription_id` on `payment_events` is a follow-up.

### Retention of `billing_readbacks` (P39-03)
The table is append-only (one row per webhook/reconciler read), so it grows. Retention policy: keep readbacks for **180 days** (they are evidence for
disputes, mirrored by audit rows), then purge. The only deletion path is `public.billing_purge_readbacks(older_than interval default '180 days')`
(service_role only, `SECURITY DEFINER`): it deletes rows that were already consumed and are older than the interval, **never less than 30 days**
(`22023 retention_too_short`), leaves unconsumed rows, and writes one `billing.readbacks.purged` audit row. The immutability trigger allows the delete
only inside that function (transaction-local flag) and only for consumed rows older than 30 days; any other DELETE, including by the table owner, still
raises `42501`. The migration does **not** schedule it: run it deliberately or from a reviewed cron job.

### Applying the migration (P39-04)
`SET LOCAL lock_timeout = '5s'` only works inside one transaction. Apply through the Supabase CLI (`supabase db push`, `supabase db reset`) or
`psql -1 -f`. Plain `psql -f` prints "SET LOCAL can only be used in transaction blocks" and the lock timeout is not in force.

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
