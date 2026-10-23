import type { BillingStore } from '../_shared/billingStore.ts';
import { inputFromEvent, processBillingEvent, type ProcessorPayPal } from '../_shared/billingProcessor.ts';
import { json, type PayPalClient, saleIdFromEvent, sha256Hex, subscriptionIdFromEvent } from '../_shared/paypal.ts';

export type WebhookDeps = { paypal: Pick<PayPalClient, 'verifyWebhookSignature'> & ProcessorPayPal; store: BillingStore };

/**
 * PayPal webhook: verify signature with PayPal's verify-webhook-signature API,
 * persist the event idempotently, then reconcile from a fresh REST readback.
 * Entitlement is granted only when the readback is ACTIVE with a matching last payment.
 *
 * Idempotency: only `processed` events short-circuit as duplicates. A `quarantined` event
 * (first-payment race, unresolved refund, ...) is re-evaluated on every redelivery so it can heal.
 */
export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const raw = await req.text();
  let verified = false;
  try { verified = await deps.paypal.verifyWebhookSignature(req.headers, raw); } catch { verified = false; }
  if (!verified) return json(401, { error: 'invalid_signature' });

  let event: { id?: string; event_type?: string; create_time?: string; resource?: Record<string, unknown> };
  try { event = JSON.parse(raw); } catch { return json(400, { error: 'invalid_json' }); }
  if (typeof event.id !== 'string' || typeof event.event_type !== 'string') return json(400, { error: 'invalid_event' });

  // Ledger resource_id is the subscription id when the event carries one, else the sale id (so an
  // unresolved refund stays traceable and the reconciler can retry the sale lookup).
  const recorded = await deps.store.recordEvent({
    id: event.id, type: event.event_type, resourceId: subscriptionIdFromEvent(event) ?? saleIdFromEvent(event), sha256: await sha256Hex(raw), occurredAt: event.create_time ?? null,
  });
  if (!recorded.isNew && recorded.status === 'processed') return json(200, { ok: true, duplicate: true });

  const result = await processBillingEvent(deps, inputFromEvent(recorded.eventId, event));
  if (result.outcome === 'ignored') { await deps.store.finishEvent(recorded.eventId, 'processed'); return json(200, { ok: true, ignored: true }); }
  await deps.store.finishEvent(recorded.eventId, result.quarantined ? 'quarantined' : 'processed');
  // 5xx makes PayPal redeliver (finite schedule); the reconciler heals the same state independently.
  if (result.retryable) return json(503, { error: result.outcome === 'unresolved_refund' ? 'refund_unresolved' : 'settlement_unconfirmed', retry: true });
  return json(200, { ok: true, outcome: result.outcome });
}
