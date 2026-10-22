import type { BillingStore } from '../_shared/billingStore.ts';
import { json, parseMarket, type PayPalClient, type PayPalConfig, PLANS } from '../_shared/paypal.ts';

export type CreateDeps = {
  paypal: Pick<PayPalClient, 'createSubscription'>; store: BillingStore; config: Pick<PayPalConfig, 'planIds'>;
  authenticate(req: Request): Promise<string | null>; returnUrl: string; cancelUrl: string; enableUs?: boolean;
};

/** Starts PayPal Sandbox checkout. Price is resolved server-side from the market only. */
export async function handleCreate(req: Request, deps: CreateDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const userId = await deps.authenticate(req);
  if (!userId) return json(401, { error: 'authentication_required' });
  let body: { market?: unknown } = {};
  try { body = await req.json(); } catch { /* empty body -> PH default */ }
  const market = parseMarket(body.market ?? 'PH');
  if (!market) return json(400, { error: 'unsupported_market' });
  // PH-only launch (Plan A5, OWN-PRICE-01): US needs explicit server opt-in.
  if (market === 'US' && !deps.enableUs) return json(403, { error: 'market_disabled' });
  const planId = deps.config.planIds[market];
  if (!planId) return json(503, { error: 'plan_not_configured' });
  const existing = await deps.store.latestSubscription(userId);
  if (existing && (existing.status === 'active' || existing.status === 'past_due')) return json(409, { error: 'already_subscribed' });
  const created = await deps.paypal.createSubscription(planId, userId, deps.returnUrl, deps.cancelUrl, crypto.randomUUID());
  await deps.store.registerPending(userId, PLANS[market].planKey, created.id, planId);
  // Approval only: entitlement waits for verified webhook + ACTIVE readback.
  return json(200, { approvalUrl: created.approvalUrl, subscriptionId: created.id, status: 'approval_pending' });
}
