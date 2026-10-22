// Thin service-role wrapper around the P4 reconciliation RPCs.
import type { DbStatus } from './paypal.ts';

export type ReadbackInput = {
  providerSubscriptionId: string; providerPlanId: string | null; status: DbStatus;
  periodEnd: string | null; lastPaymentAmount: string | null; lastPaymentCurrency: string | null; eventId: string | null;
};
export type BillingStore = {
  recordEvent(e: { id: string; type: string; resourceId: string | null; sha256: string; occurredAt: string | null }): Promise<{ eventId: string; isNew: boolean; status: string }>;
  finishEvent(eventId: string, status: 'processed' | 'quarantined' | 'failed'): Promise<void>;
  applyReadback(input: ReadbackInput): Promise<{ outcome: string; granted: boolean }>;
  registerPending(userId: string, planKey: string, providerSubscriptionId: string, providerPlanId: string): Promise<void>;
  resolvePlan(userId: string, countryHint: string | null): Promise<{ countryCode: string; planKey: string; currency: string; amount: string } | null>;
  latestSubscription(userId: string): Promise<{ provider_subscription_id: string; status: DbStatus } | null>;
};

// deno-lint-ignore no-explicit-any
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>; from: (t: string) => any };

export function supabaseBillingStore(db: Rpc): BillingStore {
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(`${fn}_failed`);
    return data;
  };
  return {
    async recordEvent(e) {
      const rows = await call('billing_record_event', { p_provider_event_id: e.id, p_event_type: e.type, p_resource_id: e.resourceId, p_payload_sha256: e.sha256, p_occurred_at: e.occurredAt });
      const row = rows[0];
      return { eventId: row.event_id, isNew: row.is_new, status: row.event_status };
    },
    async finishEvent(eventId, status) { await call('billing_finish_event', { p_event_id: eventId, p_status: status }); },
    async applyReadback(i) {
      const rows = await call('billing_apply_readback', {
        p_provider_subscription_id: i.providerSubscriptionId, p_provider_plan_id: i.providerPlanId, p_status: i.status,
        p_period_end: i.periodEnd, p_last_payment_amount: i.lastPaymentAmount === null ? null : Number(i.lastPaymentAmount),
        p_last_payment_currency: i.lastPaymentCurrency, p_event_id: i.eventId,
      });
      return { outcome: rows[0].outcome, granted: rows[0].granted };
    },
    async registerPending(userId, planKey, subId, planId) {
      await call('billing_register_pending_subscription', { p_user_id: userId, p_plan_key: planKey, p_provider_subscription_id: subId, p_provider_plan_id: planId });
    },
    async resolvePlan(userId, countryHint) {
      // Profile country first, then validated hint, then PH (resolved in the DB).
      const rows = await call('billing_resolve_plan_for_user', { p_user_id: userId, p_country_hint: countryHint });
      const r = rows?.[0];
      return r ? { countryCode: r.country_code, planKey: r.plan_key, currency: r.currency, amount: String(r.amount) } : null;
    },
    async latestSubscription(userId) {
      const { data, error } = await db.from('subscriptions').select('provider_subscription_id,status').eq('user_id', userId).eq('provider', 'paypal').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error('subscription_lookup_failed');
      return data ?? null;
    },
  };
}
