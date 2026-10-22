import type { BillingStore } from '../_shared/billingStore.ts';
import { json, mapPayPalStatus, type PayPalClient, REFUND_EVENTS, sha256Hex, subscriptionIdFromEvent } from '../_shared/paypal.ts';

export type WebhookDeps = { paypal: Pick<PayPalClient, 'verifyWebhookSignature' | 'getSubscription'>; store: BillingStore };

const QUARANTINE = new Set(['unknown_subscription', 'plan_mismatch', 'settlement_mismatch']);

/**
 * PayPal webhook: verify signature with PayPal's verify-webhook-signature API,
 * persist the event idempotently, then reconcile from a fresh REST readback.
 * Entitlement is granted only when the readback is ACTIVE with a matching last payment.
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

  const subId = subscriptionIdFromEvent(event);
  const recorded = await deps.store.recordEvent({
    id: event.id, type: event.event_type, resourceId: subId, sha256: await sha256Hex(raw), occurredAt: event.create_time ?? null,
  });
  if (!recorded.isNew && (recorded.status === 'processed' || recorded.status === 'quarantined')) {
    return json(200, { ok: true, duplicate: true });
  }
  if (!subId) { await deps.store.finishEvent(recorded.eventId, 'processed'); return json(200, { ok: true, ignored: true }); }

  let result: { outcome: string; granted: boolean };
  if (REFUND_EVENTS.has(event.event_type)) {
    const sub = await deps.paypal.getSubscription(subId);
    result = await deps.store.applyReadback({ providerSubscriptionId: subId, providerPlanId: sub.plan_id ?? null, status: 'refunded', periodEnd: null, lastPaymentAmount: null, lastPaymentCurrency: null, eventId: recorded.eventId });
  } else {
    // Readback makes processing order-independent: we always apply PayPal's current state.
    const sub = await deps.paypal.getSubscription(subId);
    const last = sub.billing_info?.last_payment?.amount;
    result = await deps.store.applyReadback({
      providerSubscriptionId: subId, providerPlanId: sub.plan_id ?? null, status: mapPayPalStatus(sub.status),
      periodEnd: sub.billing_info?.next_billing_time ?? null,
      lastPaymentAmount: last?.value ?? null, lastPaymentCurrency: last?.currency_code ?? null, eventId: recorded.eventId,
    });
  }
  await deps.store.finishEvent(recorded.eventId, QUARANTINE.has(result.outcome) ? 'quarantined' : 'processed');
  return json(200, { ok: true, outcome: result.outcome });
}
