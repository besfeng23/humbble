import type { BillingStore } from '../_shared/billingStore.ts';
import { json, mapPayPalStatus, type PayPalClient } from '../_shared/paypal.ts';

export type CancelDeps = {
  paypal: Pick<PayPalClient, 'getSubscription' | 'cancelSubscription'>; store: BillingStore;
  authenticate(req: Request): Promise<string | null>;
};

/** Cancels renewal only when PayPal readback shows ACTIVE (never APPROVAL_PENDING). */
export async function handleCancel(req: Request, deps: CancelDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const userId = await deps.authenticate(req);
  if (!userId) return json(401, { error: 'authentication_required' });
  const sub = await deps.store.latestSubscription(userId);
  if (!sub) return json(404, { error: 'no_subscription' });
  const remote = await deps.paypal.getSubscription(sub.provider_subscription_id);
  if (remote.status !== 'ACTIVE') return json(409, { error: 'not_active', providerStatus: remote.status });
  await deps.paypal.cancelSubscription(sub.provider_subscription_id, 'Cancelled by user in Humbble');
  const after = await deps.paypal.getSubscription(sub.provider_subscription_id);
  const result = await deps.store.applyReadback({
    providerSubscriptionId: sub.provider_subscription_id, providerPlanId: after.plan_id ?? null, status: mapPayPalStatus(after.status), providerStatus: after.status,
    periodEnd: null, lastPaymentAmount: null, lastPaymentCurrency: null, eventId: null,
  });
  return json(200, { ok: true, outcome: result.outcome });
}
