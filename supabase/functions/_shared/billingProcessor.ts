// Shared apply-path used by the PayPal webhook AND the reconciler, so both grant/revoke under the
// same rules: premium is granted only by billing_apply_readback after a fresh PayPal readback that is
// ACTIVE with a last payment matching the stored plan (amount, currency, plan id).
import type { BillingStore } from './billingStore.ts';
import { isSettlementPending, mapPayPalStatus, type PayPalClient, REFUND_EVENTS, saleIdFromEvent, subscriptionIdFromEvent } from './paypal.ts';

export type ProcessorPayPal = Pick<PayPalClient, 'getSubscription' | 'getSale'>;
export type ProcessDeps = { paypal: ProcessorPayPal; store: BillingStore };

/** Outcomes that mean "do not treat as done": the event stays quarantined and may be re-processed. */
export const QUARANTINE_OUTCOMES = new Set(['unknown_subscription', 'plan_mismatch', 'settlement_mismatch', 'unresolved_refund']);

export type ProcessInput = {
  /** Ledger id (payment_events.id); null for reconciler reads of a bare subscription. */
  eventId: string | null;
  eventType: string;
  /** Subscription id if known (BILLING.SUBSCRIPTION.* resource.id, billing_agreement_id, or an I-… resource_id). */
  subscriptionId: string | null;
  /** Sale id for PAYMENT.SALE.* events that do not carry a billing_agreement_id. */
  saleId: string | null;
};
export type ProcessResult = {
  outcome: string; granted: boolean;
  /** True when the final ledger status should be 'quarantined'. */
  quarantined: boolean;
  /** True for a transient state (first payment not yet visible, unresolved refund) that PayPal should retry. */
  retryable: boolean;
};

/** Derives processing input from a verified webhook body. */
export function inputFromEvent(eventId: string | null, event: { event_type?: string; resource?: Record<string, unknown> }): ProcessInput {
  return { eventId, eventType: event.event_type ?? '', subscriptionId: subscriptionIdFromEvent(event), saleId: saleIdFromEvent(event) };
}

/** Derives processing input from a stored ledger row (the payload itself is not stored; resource_id is). */
export function inputFromLedgerRow(row: { eventId: string; eventType: string; resourceId: string }): ProcessInput {
  const isSubscription = row.resourceId.startsWith('I-') || row.eventType.startsWith('BILLING.SUBSCRIPTION.');
  return { eventId: row.eventId, eventType: row.eventType, subscriptionId: isSubscription ? row.resourceId : null, saleId: isSubscription ? null : row.resourceId };
}

/** Reads PayPal's current subscription state and applies it through the single safe apply path. */
export async function applySubscriptionReadback(deps: ProcessDeps, subscriptionId: string, eventId: string | null) {
  const sub = await deps.paypal.getSubscription(subscriptionId);
  const last = sub.billing_info?.last_payment?.amount;
  const result = await deps.store.applyReadback({
    providerSubscriptionId: subscriptionId, providerPlanId: sub.plan_id ?? null, status: mapPayPalStatus(sub.status),
    periodEnd: sub.billing_info?.next_billing_time ?? null,
    lastPaymentAmount: last?.value ?? null, lastPaymentCurrency: last?.currency_code ?? null, eventId,
  });
  return { ...result, sub };
}

export async function processBillingEvent(deps: ProcessDeps, input: ProcessInput): Promise<ProcessResult> {
  const isRefund = REFUND_EVENTS.has(input.eventType);
  let subscriptionId = input.subscriptionId;

  // G1: refund/payment events may carry only a sale id. Resolve the subscription from PayPal itself.
  if (!subscriptionId && input.saleId && input.eventType.startsWith('PAYMENT.SALE.')) {
    const sale = await deps.paypal.getSale(input.saleId); // transient failures throw -> retry
    const agreement = sale && (sale.id === undefined || sale.id === input.saleId) ? sale.billing_agreement_id : undefined;
    if (typeof agreement === 'string' && agreement) subscriptionId = agreement;
  }

  if (!subscriptionId) {
    if (isRefund) {
      // Fail closed: a refund we cannot tie to a subscription is flagged, never silently ignored.
      if (input.eventId) await deps.store.flagUnresolvedEvent(input.eventId, input.saleId ? 'refund_sale_unresolved' : 'refund_without_sale_or_subscription');
      return { outcome: 'unresolved_refund', granted: false, quarantined: true, retryable: true };
    }
    return { outcome: 'ignored', granted: false, quarantined: false, retryable: false };
  }

  if (isRefund) {
    // Existing entitlement rule: any verified refund/reversal revokes premium for that subscription.
    const sub = await deps.paypal.getSubscription(subscriptionId);
    const r = await deps.store.applyReadback({ providerSubscriptionId: subscriptionId, providerPlanId: sub.plan_id ?? null, status: 'refunded', periodEnd: null, lastPaymentAmount: null, lastPaymentCurrency: null, eventId: input.eventId });
    return { ...r, quarantined: QUARANTINE_OUTCOMES.has(r.outcome), retryable: false };
  }

  // Readback makes processing order-independent: we always apply PayPal's current state.
  const r = await applySubscriptionReadback(deps, subscriptionId, input.eventId);
  // G2: ACTIVE but first payment not visible yet -> quarantine AND ask for a retry.
  const retryable = r.outcome === 'settlement_mismatch' && isSettlementPending(r.sub);
  return { outcome: r.outcome, granted: r.granted, quarantined: QUARANTINE_OUTCOMES.has(r.outcome), retryable };
}
