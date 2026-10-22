import type { BillingStore } from '../_shared/billingStore.ts';
import { type Currency, json, parseCountryHint, type PayPalClient, type PayPalConfig } from '../_shared/paypal.ts';

export type CreateDeps = {
  paypal: Pick<PayPalClient, 'createSubscription'>; store: BillingStore; config: Pick<PayPalConfig, 'planIds'>;
  authenticate(req: Request): Promise<string | null>; returnUrl: string; cancelUrl: string;
};

/**
 * Starts PayPal Sandbox checkout. The client may send only a country hint; the
 * database resolves (profile country > validated hint > PH) market, plan and price (allowlist + per-market DB flags).
 */
export async function handleCreate(req: Request, deps: CreateDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const userId = await deps.authenticate(req);
  if (!userId) return json(401, { error: 'authentication_required' });
  let body: { country?: unknown } = {};
  try { body = await req.json(); } catch { /* empty body -> server default market */ }
  const plan = await deps.store.resolvePlan(userId, parseCountryHint(body.country));
  if (!plan) return json(503, { error: 'no_enabled_plan' });
  const planId = deps.config.planIds[plan.currency as Currency];
  if (!planId) return json(503, { error: 'plan_not_configured' });
  const existing = await deps.store.latestSubscription(userId);
  if (existing && (existing.status === 'active' || existing.status === 'past_due')) return json(409, { error: 'already_subscribed' });
  const created = await deps.paypal.createSubscription(planId, userId, deps.returnUrl, deps.cancelUrl, crypto.randomUUID());
  await deps.store.registerPending(userId, plan.planKey, created.id, planId);
  // Approval only: entitlement waits for verified webhook + ACTIVE readback with matching amount.
  return json(200, { approvalUrl: created.approvalUrl, subscriptionId: created.id, status: 'approval_pending', currency: plan.currency, amount: plan.amount });
}
