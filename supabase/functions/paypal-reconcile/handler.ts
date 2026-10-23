import type { BillingStore } from '../_shared/billingStore.ts';
import { applySubscriptionReadback, attemptProviderCancel, inputFromLedgerRow, processBillingEvent, type ProcessorPayPal } from '../_shared/billingProcessor.ts';
import { bearerMatches, json } from '../_shared/paypal.ts';

export type ReconcileDeps = {
  paypal: ProcessorPayPal; store: BillingStore;
  /** SUPABASE_SERVICE_ROLE_KEY. Callers must present it as a Bearer token (same convention as send-push). */
  serviceRoleKey: string | undefined;
  environment: 'sandbox' | 'live';
  /** Max rows per run for each of subscriptions and events. */
  limit?: number;
  /** Pause between PayPal-calling rows (rate limit). */
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
};

type Counts = Record<string, number>;
const bump = (c: Counts, k: string) => { c[k] = (c[k] ?? 0) + 1; };

/**
 * Re-reads PayPal for subscriptions that are pending/active/stale or tied to quarantined/stuck events
 * and applies the SAME safe apply-path as the webhook (readback ACTIVE + last payment amount/currency/plan).
 * Server-only: requires the service-role key as Bearer; fails closed when the key is not configured.
 */
export async function handleReconcile(req: Request, deps: ReconcileDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!deps.serviceRoleKey) return json(500, { error: 'server_not_configured' });
  if (!bearerMatches(req.headers.get('authorization'), deps.serviceRoleKey)) return json(401, { error: 'unauthorized' });

  const limit = deps.limit ?? 50;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = deps.log ?? ((line: string) => console.log(line));
  const subscriptions: Counts = {}; const events: Counts = {}; const providerCancels: Counts = {}; let errors = 0;
  const reconciled = new Set<string>();
  let calls = 0;
  const pace = async () => { if (calls++ > 0) await sleep(200); };

  // 1. Quarantined / stuck events (handles refunds correctly: a refund event re-applies `refunded`).
  let eventRows: Awaited<ReturnType<BillingStore['listReprocessableEvents']>> = [];
  try { eventRows = await deps.store.listReprocessableEvents(limit); } catch { errors++; }
  for (const row of eventRows) {
    try {
      await pace();
      const result = await processBillingEvent(deps, inputFromLedgerRow(row));
      bump(events, result.outcome);
      if (result.outcome === 'ignored' || !result.quarantined) await deps.store.finishEvent(row.eventId, 'processed');
      else await deps.store.finishEvent(row.eventId, 'quarantined');
      if (row.resourceId.startsWith('I-')) reconciled.add(row.resourceId);
    } catch { errors++; bump(events, 'error'); }
  }

  // 2. Subscriptions by state (pending approval, active/past_due staleness).
  let subRows: Awaited<ReturnType<BillingStore['listReconcileSubscriptions']>> = [];
  try { subRows = await deps.store.listReconcileSubscriptions(deps.environment, limit); } catch { errors++; }
  for (const row of subRows) {
    if (reconciled.has(row.providerSubscriptionId)) { bump(subscriptions, 'covered_by_event'); continue; }
    try {
      await pace();
      const r = await applySubscriptionReadback(deps, row.providerSubscriptionId, null);
      bump(subscriptions, r.outcome);
    } catch { errors++; bump(subscriptions, 'error'); }
  }

  // 3. F-05/N1: refunded/revoked subscriptions that may still be billing at PayPal (sandbox only; failures stay pending and retry).
  let cancelRows: Awaited<ReturnType<BillingStore['listPendingProviderCancels']>> = [];
  try { cancelRows = await deps.store.listPendingProviderCancels(deps.environment, limit); } catch { errors++; }
  for (const row of cancelRows) {
    await pace();
    bump(providerCancels, await attemptProviderCancel(deps, row.providerSubscriptionId, null));
  }

  const alert = (providerCancels.failed ?? 0) + (subscriptions.settlement_mismatch ?? 0) + (subscriptions.plan_mismatch ?? 0) + (events.settlement_mismatch ?? 0) + (events.plan_mismatch ?? 0) + (events.unresolved_refund ?? 0);
  // One structured line per run; counts only (no ids, no secrets).
  log(JSON.stringify({ event: 'paypal_reconcile', level: alert > 0 ? 'warn' : 'info', environment: deps.environment, subscriptions, events, providerCancels, errors }));
  return json(200, { ok: true, subscriptions, events, providerCancels, errors });
}
