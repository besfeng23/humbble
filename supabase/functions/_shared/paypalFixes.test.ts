// Tests for the PayPal sandbox billing gap fixes (G1 refund resolution, G2 quarantine retry,
// G3 reconciler, G4 environment guard, G8 raw-body verification). Pure Deno: no network, no DB.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type BillingStore, supabaseBillingStore } from './billingStore.ts';
import { loadPayPalConfig, PayPalClient, type PayPalSale, type PayPalSubscription, saleIdFromEvent, SANDBOX_BASE_URL } from './paypal.ts';
import { handleWebhook } from '../paypal-webhook/handler.ts';
import { handleCreate } from '../paypal-create-subscription/handler.ts';
import { handleReconcile } from '../paypal-reconcile/handler.ts';

const KEY = 'service-role-key-for-tests';
const FUTURE = new Date(Date.now() + 20 * 86_400_000).toISOString();
const activeSub = (over: Partial<PayPalSubscription> = {}): PayPalSubscription => ({
  id: 'I-1', status: 'ACTIVE', plan_id: 'P-PH',
  billing_info: { next_billing_time: FUTURE, last_payment: { amount: { value: '599.00', currency_code: 'PHP' } } }, ...over,
});

/** In-memory store mirroring the SQL rules of billing_apply_readback / billing_finish_event / billing_flag_unresolved_event. */
function fakeStore(subs: Record<string, { status: string; plan: string; createdMinutesAgo?: number }> = { 'I-1': { status: 'approval_pending', plan: 'P-PH' } }) {
  const events = new Map<string, { eventId: string; providerEventId: string; type: string; resourceId: string | null; status: string }>();
  const premium = new Set<string>(); const flagged: { eventId: string; reason: string }[] = []; const registered: unknown[][] = [];
  const state = { subs: { ...subs } };
  const store: BillingStore = {
    recordEvent: async (e) => {
      const hit = events.get(e.id);
      if (hit) return { eventId: hit.eventId, isNew: false, status: hit.status };
      const row = { eventId: `ev-${events.size}`, providerEventId: e.id, type: e.type, resourceId: e.resourceId, status: 'verified' };
      events.set(e.id, row); return { eventId: row.eventId, isNew: true, status: row.status };
    },
    finishEvent: async (id, status) => {
      for (const v of events.values()) if (v.eventId === id) {
        if (status === 'processed' && ['verified', 'quarantined'].includes(v.status)) v.status = 'processed';
        else if (status !== 'processed' && v.status !== 'processed') v.status = status;
      }
    },
    flagUnresolvedEvent: async (id, reason) => {
      flagged.push({ eventId: id, reason });
      for (const v of events.values()) if (v.eventId === id && v.status !== 'processed') v.status = 'quarantined';
    },
    applyReadback: async (i) => {
      const s = state.subs[i.providerSubscriptionId];
      if (!s) return { outcome: 'unknown_subscription', granted: false };
      if (i.providerPlanId !== s.plan) return { outcome: 'plan_mismatch', granted: false };
      if (i.status === 'active') {
        if (i.lastPaymentAmount !== '599.00' || i.lastPaymentCurrency !== 'PHP' || !i.periodEnd || Date.parse(i.periodEnd) <= Date.now()) return { outcome: 'settlement_mismatch', granted: false };
        s.status = 'active'; premium.add(i.providerSubscriptionId); return { outcome: 'granted', granted: true };
      }
      if (i.status === 'refunded' || i.status === 'revoked' || i.status === 'suspended' || i.status === 'expired') { s.status = i.status; premium.delete(i.providerSubscriptionId); return { outcome: 'revoked', granted: false }; }
      if (i.status === 'cancelled') { s.status = 'cancelled'; return { outcome: 'cancel_at_period_end', granted: false }; }
      return { outcome: 'no_change', granted: false };
    },
    registerPending: async (...a) => { registered.push(a); },
    resolvePlan: async () => ({ countryCode: 'PH', planKey: 'premium_monthly_ph', currency: 'PHP', amount: '599.00' }),
    latestSubscription: async () => null,
    listReconcileSubscriptions: async () => Object.entries(state.subs)
      .filter(([, v]) => ['approval_pending', 'active', 'past_due'].includes(v.status)).map(([id, v]) => ({ providerSubscriptionId: id, reason: v.status })),
    listReprocessableEvents: async () => [...events.values()].filter((e) => e.resourceId && ['quarantined', 'verified'].includes(e.status))
      .map((e) => ({ eventId: e.eventId, providerEventId: e.providerEventId, eventType: e.type, resourceId: e.resourceId!, status: e.status })),
  };
  return { store, events, premium, flagged, registered, state };
}

type PayPalFake = {
  sub?: () => PayPalSubscription | Promise<PayPalSubscription>; sale?: (id: string) => PayPalSale | null | Promise<PayPalSale | null>;
  verify?: boolean;
};
function fakePayPal(f: PayPalFake = {}) {
  const calls = { getSubscription: [] as string[], getSale: [] as string[] };
  return {
    calls,
    paypal: {
      verifyWebhookSignature: async () => f.verify ?? true,
      getSubscription: async (id: string) => { calls.getSubscription.push(id); return await (f.sub ?? (() => activeSub()))(); },
      getSale: async (id: string) => { calls.getSale.push(id); return await (f.sale ?? (() => null))(id); },
    },
  };
}
const post = (body: unknown) => new Request('http://x', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

// Realistic PAYMENT.SALE.REFUNDED shape: resource_type "refund", sale_id, NO billing_agreement_id.
const refundEvent = (id = 'WH-REFUND-1') => ({ id, event_type: 'PAYMENT.SALE.REFUNDED', resource_type: 'refund', resource: { id: 'REFUND-9', sale_id: 'SALE-7', parent_payment: 'PAY-1', state: 'completed', amount: { total: '599.00', currency: 'PHP' } } });

async function grantFirst(m: ReturnType<typeof fakeStore>) {
  const pp = fakePayPal();
  const res = await handleWebhook(post({ id: 'WH-ACT', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-1' } }), { store: m.store, paypal: pp.paypal });
  assertEquals((await res.json()).outcome, 'granted'); assert(m.premium.has('I-1'));
}

// ---------------------------------------------------------------- G1
Deno.test('G1: refund without billing_agreement_id resolves the sale via PayPal and revokes premium', async () => {
  const m = fakeStore(); await grantFirst(m);
  const pp = fakePayPal({ sale: () => ({ id: 'SALE-7', state: 'refunded', billing_agreement_id: 'I-1' }) });
  const res = await handleWebhook(post(refundEvent()), { store: m.store, paypal: pp.paypal });
  assertEquals(res.status, 200); assertEquals((await res.json()).outcome, 'revoked');
  assertEquals(pp.calls.getSale, ['SALE-7']); assertEquals(pp.calls.getSubscription, ['I-1']);
  assert(!m.premium.has('I-1'), 'premium revoked'); assertEquals(m.state.subs['I-1'].status, 'refunded');
  assertEquals(m.events.get('WH-REFUND-1')!.status, 'processed'); assertEquals(m.events.get('WH-REFUND-1')!.resourceId, 'SALE-7');
});

Deno.test('G1: PAYMENT.SALE.REVERSED (sale object, no billing_agreement_id) resolves via resource.id', async () => {
  const m = fakeStore(); await grantFirst(m);
  const pp = fakePayPal({ sale: (id) => ({ id, billing_agreement_id: 'I-1' }) });
  const ev = { id: 'WH-REV', event_type: 'PAYMENT.SALE.REVERSED', resource_type: 'sale', resource: { id: 'SALE-8', state: 'reversed' } };
  assertEquals((await (await handleWebhook(post(ev), { store: m.store, paypal: pp.paypal })).json()).outcome, 'revoked');
  assertEquals(pp.calls.getSale, ['SALE-8']); assert(!m.premium.has('I-1'));
});

Deno.test('G1: refund that already carries billing_agreement_id does not need the sale lookup', async () => {
  const m = fakeStore(); await grantFirst(m);
  const pp = fakePayPal();
  const ev = { id: 'WH-R2', event_type: 'PAYMENT.SALE.REFUNDED', resource: { id: 'R', sale_id: 'S', billing_agreement_id: 'I-1' } };
  assertEquals((await (await handleWebhook(post(ev), { store: m.store, paypal: pp.paypal })).json()).outcome, 'revoked');
  assertEquals(pp.calls.getSale, []);
});

Deno.test('G1: unresolvable refund fails closed: flagged + quarantined + retryable, never "ignored"', async () => {
  for (const sale of [() => null, () => ({ id: 'SALE-7' }), () => ({ id: 'OTHER-SALE', billing_agreement_id: 'I-1' })] as PayPalFake['sale'][]) {
    const m = fakeStore(); await grantFirst(m);
    const pp = fakePayPal({ sale });
    const res = await handleWebhook(post(refundEvent()), { store: m.store, paypal: pp.paypal });
    assertEquals(res.status, 503); assertEquals((await res.json()).error, 'refund_unresolved');
    assertEquals(m.events.get('WH-REFUND-1')!.status, 'quarantined');
    assertEquals(m.flagged.length, 1); assertEquals(m.flagged[0].reason, 'refund_sale_unresolved');
    assertEquals(pp.calls.getSubscription, [], 'no entitlement change from an unresolved sale');
  }
});

Deno.test('G1: refund with neither sale id nor subscription id is flagged, not ignored', async () => {
  const m = fakeStore(); const pp = fakePayPal();
  const res = await handleWebhook(post({ id: 'WH-R3', event_type: 'PAYMENT.SALE.REFUNDED', resource: { id: 'R-only' } }), { store: m.store, paypal: pp.paypal });
  assertEquals(res.status, 503); assertEquals(m.flagged[0].reason, 'refund_without_sale_or_subscription'); assertEquals(pp.calls.getSale, []);
});

Deno.test('G1: transient sale-lookup failure throws so PayPal retries; event stays retryable and resolves later', async () => {
  const m = fakeStore(); await grantFirst(m);
  let down = true;
  const pp = fakePayPal({ sale: () => { if (down) throw new Error('paypal_sale_read_failed_503'); return { id: 'SALE-7', billing_agreement_id: 'I-1' }; } });
  await assertRejects(() => handleWebhook(post(refundEvent()), { store: m.store, paypal: pp.paypal }));
  assertEquals(m.events.get('WH-REFUND-1')!.status, 'verified'); assert(m.premium.has('I-1'));
  down = false;
  assertEquals((await (await handleWebhook(post(refundEvent()), { store: m.store, paypal: pp.paypal })).json()).outcome, 'revoked');
});

Deno.test('G1: non-refund sale event that does not belong to a subscription is ignored (processed), refund of unknown subscription is quarantined', async () => {
  const m = fakeStore(); const pp = fakePayPal({ sale: () => ({ id: 'S-1' }) });
  const res = await handleWebhook(post({ id: 'WH-C', event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'S-1' } }), { store: m.store, paypal: pp.paypal });
  assertEquals((await res.json()).ignored, true); assertEquals(m.events.get('WH-C')!.status, 'processed');
  const pp2 = fakePayPal({ sale: () => ({ id: 'SALE-7', billing_agreement_id: 'I-GHOST' }) });
  const res2 = await handleWebhook(post(refundEvent('WH-R9')), { store: m.store, paypal: pp2.paypal });
  assertEquals((await res2.json()).outcome, 'unknown_subscription'); assertEquals(m.events.get('WH-R9')!.status, 'quarantined');
});

Deno.test('G1: saleIdFromEvent never treats a refund id as a sale id', () => {
  assertEquals(saleIdFromEvent(refundEvent()), 'SALE-7');
  assertEquals(saleIdFromEvent({ event_type: 'PAYMENT.SALE.REFUNDED', resource: { id: 'REFUND-ONLY' } }), null);
  assertEquals(saleIdFromEvent({ event_type: 'PAYMENT.SALE.REVERSED', resource: { id: 'SALE-8' } }), 'SALE-8');
  assertEquals(saleIdFromEvent({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-1' } }), null);
});

// ---------------------------------------------------------------- G2
const activated = { id: 'WH-ACT-2', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-1' } };
const noLastPayment = () => activeSub({ billing_info: { next_billing_time: FUTURE } });

Deno.test('G2: first-payment race is quarantined AND answered 503 so PayPal retries; the retry heals it', async () => {
  const m = fakeStore(); let ready = false;
  const pp = fakePayPal({ sub: () => (ready ? activeSub() : noLastPayment()) });
  const first = await handleWebhook(post(activated), { store: m.store, paypal: pp.paypal });
  assertEquals(first.status, 503); assertEquals((await first.json()).retry, true);
  assertEquals(m.events.get('WH-ACT-2')!.status, 'quarantined'); assert(!m.premium.has('I-1'));
  ready = true; // PayPal now reports the first payment
  const retry = await handleWebhook(post(activated), { store: m.store, paypal: pp.paypal });
  assertEquals(retry.status, 200); assertEquals((await retry.json()).outcome, 'granted', 'not "duplicate" forever');
  assertEquals(m.events.get('WH-ACT-2')!.status, 'processed'); assert(m.premium.has('I-1'));
  assertEquals((await (await handleWebhook(post(activated), { store: m.store, paypal: pp.paypal })).json()).duplicate, true);
});

Deno.test('G2: a genuine amount mismatch stays quarantined with 200 (no retry storm), never grants, and is re-evaluated on redelivery', async () => {
  const m = fakeStore(); let amount = '1.00';
  const pp = fakePayPal({ sub: () => activeSub({ billing_info: { next_billing_time: FUTURE, last_payment: { amount: { value: amount, currency_code: 'PHP' } } } }) });
  const res = await handleWebhook(post(activated), { store: m.store, paypal: pp.paypal });
  assertEquals(res.status, 200); assertEquals((await res.json()).outcome, 'settlement_mismatch');
  assertEquals(m.events.get('WH-ACT-2')!.status, 'quarantined'); assert(!m.premium.has('I-1'));
  const again = await (await handleWebhook(post(activated), { store: m.store, paypal: pp.paypal })).json();
  assertEquals(again.outcome, 'settlement_mismatch'); assertEquals(pp.calls.getSubscription.length, 2);
  amount = '599.00';
  assertEquals((await (await handleWebhook(post(activated), { store: m.store, paypal: pp.paypal })).json()).outcome, 'granted');
});

// ---------------------------------------------------------------- G4
const sandboxCfg = { planIds: { PHP: 'P-PH' }, environment: 'sandbox' as const, liveAllowed: false };
function createDeps(m: ReturnType<typeof fakeStore>, config: { planIds: { PHP: string }; environment: 'sandbox' | 'live'; liveAllowed: boolean }) {
  const created: string[] = [];
  return { created, deps: { store: m.store, config, returnUrl: 'r', cancelUrl: 'c', authenticate: async () => 'user-1',
    paypal: { createSubscription: async (plan: string) => { created.push(plan); return { id: 'I-NEW', approvalUrl: 'https://www.sandbox.paypal.com/approve' }; } } } };
}

Deno.test('G4: checkout records the real environment on the pending subscription', async () => {
  const m = fakeStore(); const { deps } = createDeps(m, sandboxCfg);
  assertEquals((await handleCreate(post({}), deps)).status, 200);
  assertEquals(m.registered[0], ['user-1', 'premium_monthly_ph', 'I-NEW', 'P-PH', 'sandbox']);
});

Deno.test('G4: live environment without PAYPAL_ALLOW_LIVE is refused before any PayPal call or DB write', async () => {
  const m = fakeStore(); const { deps, created } = createDeps(m, { ...sandboxCfg, environment: 'live', liveAllowed: false });
  const res = await handleCreate(post({}), deps);
  assertEquals(res.status, 503); assertEquals((await res.json()).error, 'live_paypal_refused');
  assertEquals(created, []); assertEquals(m.registered, []);
});

Deno.test('G4: live is only "allowed" when PAYPAL_ENV=live AND PAYPAL_ALLOW_LIVE=true', () => {
  const base = { PAYPAL_CLIENT_ID: 'i', PAYPAL_CLIENT_SECRET: 's', PAYPAL_WEBHOOK_ID: 'w' };
  const cfg = (extra: Record<string, string>) => loadPayPalConfig((k) => ({ ...base, ...extra })[k]);
  assertEquals([cfg({}).environment, cfg({}).liveAllowed], ['sandbox', false]);
  const stray = cfg({ PAYPAL_ALLOW_LIVE: 'true' }); // ALLOW_LIVE alone never switches to live
  assertEquals([stray.environment, stray.liveAllowed, stray.baseUrl], ['sandbox', false, SANDBOX_BASE_URL]);
  const live = cfg({ PAYPAL_ENV: 'live', PAYPAL_ALLOW_LIVE: 'true' });
  assertEquals([live.environment, live.liveAllowed], ['live', true]);
  for (const v of [undefined, 'false', 'TRUE', '1']) {
    let threw = false; try { cfg({ PAYPAL_ENV: 'live', ...(v ? { PAYPAL_ALLOW_LIVE: v } : {}) }); } catch { threw = true; }
    assert(threw, `live refused with PAYPAL_ALLOW_LIVE=${v}`);
  }
});

Deno.test('G4: the store passes p_environment to the RPC (DB refuses anything but sandbox)', async () => {
  const seen: { fn: string; args: Record<string, unknown> }[] = [];
  // deno-lint-ignore no-explicit-any
  const db: any = { rpc: async (fn: string, args: Record<string, unknown>) => { seen.push({ fn, args }); return { data: null, error: null }; }, from: () => ({}) };
  await supabaseBillingStore(db).registerPending('u', 'k', 'I-9', 'P-9', 'sandbox');
  assertEquals(seen[0].fn, 'billing_register_pending_subscription'); assertEquals(seen[0].args.p_environment, 'sandbox');
  // deno-lint-ignore no-explicit-any
  const failing: any = { rpc: async () => ({ data: null, error: { message: 'live_environment_refused' } }), from: () => ({}) };
  await assertRejects(() => supabaseBillingStore(failing).registerPending('u', 'k', 'I-9', 'P-9', 'live'));
});

// ---------------------------------------------------------------- G3
const reconReq = (key: string | null, method = 'POST') => new Request('http://x', { method, headers: key === null ? {} : { Authorization: `Bearer ${key}` } });
const noSleep = async () => {};
const reconDeps = (m: ReturnType<typeof fakeStore>, pp: ReturnType<typeof fakePayPal>, over = {}) =>
  ({ store: m.store, paypal: pp.paypal, serviceRoleKey: KEY, environment: 'sandbox' as const, sleep: noSleep, log: () => {}, ...over });

Deno.test('G3: reconciler is server-only: no/forged/anon credentials are rejected before any DB or PayPal access', async () => {
  const m = fakeStore(); const pp = fakePayPal();
  for (const key of [null, '', 'wrong', KEY + 'x', KEY.slice(1)]) {
    assertEquals((await handleReconcile(reconReq(key), reconDeps(m, pp))).status, 401);
  }
  assertEquals((await handleReconcile(reconReq(KEY, 'GET'), reconDeps(m, pp))).status, 405);
  assertEquals((await handleReconcile(reconReq(KEY), reconDeps(m, pp, { serviceRoleKey: undefined }))).status, 500, 'fails closed when not configured');
  assertEquals(pp.calls.getSubscription, []); assert(!m.premium.has('I-1'));
});

Deno.test('G3: reconciler grants a subscription whose webhook never arrived (ACTIVE + matching payment); second run is idempotent', async () => {
  const m = fakeStore(); const pp = fakePayPal();
  const res = await handleReconcile(reconReq(KEY), reconDeps(m, pp));
  assertEquals(res.status, 200); const body = await res.json();
  assertEquals(body.subscriptions.granted, 1); assert(m.premium.has('I-1'));
  assertEquals(m.state.subs['I-1'].status, 'active');
  const again = await (await handleReconcile(reconReq(KEY), reconDeps(m, pp))).json();
  assertEquals(again.subscriptions.granted, 1, 're-applying an ACTIVE readback is a safe no-op'); assertEquals(m.premium.size, 1);
});

Deno.test('G3: reconciler negative cases never grant (pending, wrong amount, wrong currency, wrong plan, past period end)', async () => {
  const cases: [string, PayPalSubscription, string][] = [
    ['pending', activeSub({ status: 'APPROVAL_PENDING' }), 'no_change'],
    ['approved-not-active', activeSub({ status: 'APPROVED' }), 'no_change'],
    ['amount', activeSub({ billing_info: { next_billing_time: FUTURE, last_payment: { amount: { value: '1.00', currency_code: 'PHP' } } } }), 'settlement_mismatch'],
    ['currency', activeSub({ billing_info: { next_billing_time: FUTURE, last_payment: { amount: { value: '599.00', currency_code: 'USD' } } } }), 'settlement_mismatch'],
    ['no payment', activeSub({ billing_info: { next_billing_time: FUTURE } }), 'settlement_mismatch'],
    ['plan', activeSub({ plan_id: 'P-OTHER' }), 'plan_mismatch'],
    ['past period', activeSub({ billing_info: { next_billing_time: '2020-01-01T00:00:00Z', last_payment: { amount: { value: '599.00', currency_code: 'PHP' } } } }), 'settlement_mismatch'],
  ];
  for (const [name, sub, outcome] of cases) {
    const m = fakeStore(); const pp = fakePayPal({ sub: () => sub });
    const body = await (await handleReconcile(reconReq(KEY), reconDeps(m, pp))).json();
    assertEquals(body.subscriptions[outcome], 1, name); assertEquals(m.premium.size, 0, `${name}: no premium`);
  }
});

Deno.test('G3: one failing PayPal read does not stop the run; errors are counted; calls are paced', async () => {
  const m = fakeStore({ 'I-1': { status: 'approval_pending', plan: 'P-PH' }, 'I-2': { status: 'approval_pending', plan: 'P-PH' } });
  const pp = fakePayPal({ sub: () => { if (pp.calls.getSubscription.length === 1) throw new Error('paypal_read_failed_500'); return activeSub(); } });
  const sleeps: number[] = []; const logs: string[] = [];
  const body = await (await handleReconcile(reconReq(KEY), reconDeps(m, pp, { sleep: async (ms: number) => { sleeps.push(ms); }, log: (l: string) => logs.push(l) }))).json();
  assertEquals([body.errors, body.subscriptions.error, body.subscriptions.granted], [1, 1, 1]);
  assertEquals(sleeps, [200]); assertEquals(logs.length, 1);
  assert(!logs[0].includes(KEY) && JSON.parse(logs[0]).event === 'paypal_reconcile');
});

Deno.test('G3: reconciler heals a quarantined first-payment event and marks it processed', async () => {
  const m = fakeStore(); let ready = false;
  const pp = fakePayPal({ sub: () => (ready ? activeSub() : noLastPayment()) });
  await handleWebhook(post(activated), { store: m.store, paypal: pp.paypal });
  assertEquals(m.events.get('WH-ACT-2')!.status, 'quarantined');
  const stillRacing = await (await handleReconcile(reconReq(KEY), reconDeps(m, pp))).json();
  assertEquals(stillRacing.events.settlement_mismatch, 1); assertEquals(m.events.get('WH-ACT-2')!.status, 'quarantined'); assert(!m.premium.has('I-1'));
  ready = true;
  const healed = await (await handleReconcile(reconReq(KEY), reconDeps(m, pp))).json();
  assertEquals(healed.events.granted, 1); assertEquals(m.events.get('WH-ACT-2')!.status, 'processed'); assert(m.premium.has('I-1'));
});

Deno.test('G3: reconciler retries an unresolved refund by sale id and revokes once PayPal resolves it', async () => {
  const m = fakeStore(); await grantFirst(m);
  let resolvable = false;
  const pp = fakePayPal({ sale: () => (resolvable ? { id: 'SALE-7', billing_agreement_id: 'I-1' } : null) });
  await handleWebhook(post(refundEvent()), { store: m.store, paypal: pp.paypal });
  assertEquals(m.events.get('WH-REFUND-1')!.status, 'quarantined');
  const first = await (await handleReconcile(reconReq(KEY), reconDeps(m, pp))).json();
  assertEquals(first.events.unresolved_refund, 1); assert(m.premium.has('I-1'), 'still fail-closed flagged, not silently revoked/ignored');
  resolvable = true;
  const second = await (await handleReconcile(reconReq(KEY), reconDeps(m, pp))).json();
  assertEquals(second.events.revoked, 1); assert(!m.premium.has('I-1')); assertEquals(m.events.get('WH-REFUND-1')!.status, 'processed');
});

Deno.test('G3: a stuck refund event re-applies the refund (does not re-grant from an ACTIVE readback)', async () => {
  const m = fakeStore(); await grantFirst(m);
  const ev = { id: 'WH-R5', event_type: 'PAYMENT.SALE.REFUNDED', resource: { id: 'R', sale_id: 'S', billing_agreement_id: 'I-1' } };
  await m.store.recordEvent({ id: ev.id, type: ev.event_type, resourceId: 'I-1', sha256: 'x', occurredAt: null }); // handler "crashed" after recording
  const pp = fakePayPal({ sub: () => activeSub() }); // PayPal subscription itself is still ACTIVE
  const body = await (await handleReconcile(reconReq(KEY), reconDeps(m, pp))).json();
  assertEquals(body.events.revoked, 1); assert(!m.premium.has('I-1')); assertEquals(m.events.get('WH-R5')!.status, 'processed');
});

// ---------------------------------------------------------------- G8
Deno.test('G8: the original raw body is forwarded verbatim to verify-webhook-signature (no re-serialisation)', async () => {
  const bodies: string[] = [];
  const fake = async (url: string, init?: RequestInit) => {
    if (url.endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 300 }));
    bodies.push(init?.body as string); return new Response(JSON.stringify({ verification_status: 'SUCCESS' }));
  };
  const client = new PayPalClient(loadPayPalConfig((k) => ({ PAYPAL_CLIENT_ID: 'i', PAYPAL_CLIENT_SECRET: 's', PAYPAL_WEBHOOK_ID: 'WH-1' })[k]), fake);
  const headers = new Headers({ 'paypal-auth-algo': 'a', 'paypal-cert-url': 'c', 'paypal-transmission-id': 'i', 'paypal-transmission-sig': 's', 'paypal-transmission-time': 't' });
  // Re-serialising would turn 1.10 into 1.1, \u00e9 into é, 1e2 into 100 and drop the whitespace.
  const raw = '{ "id" : "WH-1",\n "amount": 1.10, "n": 1e2, "name": "caf\\u00e9", "big": 12345678901234567890 }';
  assert(await client.verifyWebhookSignature(headers, raw));
  assert(bodies[0].includes(`"webhook_event":${raw}}`), 'raw text embedded verbatim');
  const parsed = JSON.parse(bodies[0]);
  assertEquals([parsed.webhook_id, parsed.transmission_id, parsed.webhook_event.id], ['WH-1', 'i', 'WH-1']);
});

Deno.test('G8: bodies that are not a single JSON object cannot smuggle extra verify-API fields', async () => {
  let calls = 0;
  const fake = async (url: string) => { calls++; return url.endsWith('/v1/oauth2/token') ? new Response(JSON.stringify({ access_token: 't', expires_in: 300 })) : new Response(JSON.stringify({ verification_status: 'SUCCESS' })); };
  const client = new PayPalClient(loadPayPalConfig((k) => ({ PAYPAL_CLIENT_ID: 'i', PAYPAL_CLIENT_SECRET: 's', PAYPAL_WEBHOOK_ID: 'WH-1' })[k]), fake);
  const headers = new Headers({ 'paypal-auth-algo': 'a', 'paypal-cert-url': 'c', 'paypal-transmission-id': 'i', 'paypal-transmission-sig': 's', 'paypal-transmission-time': 't' });
  for (const bad of ['{"a":1},"webhook_id":"evil"', '[1]', 'null', '"x"', '42', '', '{"a":1', '\ufeff{"a":1}']) assert(!(await client.verifyWebhookSignature(headers, bad)), `rejected: ${bad}`);
  assertEquals(calls, 0, 'rejected without calling PayPal');
});

// ---------------------------------------------------------------- store wrappers
Deno.test('store maps reconciler RPC rows and fails closed on RPC errors', async () => {
  // deno-lint-ignore no-explicit-any
  const db: any = { rpc: async (fn: string) => ({ error: null, data: fn === 'billing_list_reconcile_subscriptions'
    ? [{ provider_subscription_id: 'I-5', reason: 'pending' }]
    : [{ event_id: 'e1', provider_event_id: 'WH-1', event_type: 'PAYMENT.SALE.REFUNDED', resource_id: 'SALE-1', event_status: 'quarantined' }] }), from: () => ({}) };
  const store = supabaseBillingStore(db);
  assertEquals(await store.listReconcileSubscriptions('sandbox', 5), [{ providerSubscriptionId: 'I-5', reason: 'pending' }]);
  assertEquals((await store.listReprocessableEvents(5))[0], { eventId: 'e1', providerEventId: 'WH-1', eventType: 'PAYMENT.SALE.REFUNDED', resourceId: 'SALE-1', status: 'quarantined' });
  // deno-lint-ignore no-explicit-any
  const bad: any = { rpc: async () => ({ data: null, error: { message: 'x' } }), from: () => ({}) };
  await assertRejects(() => supabaseBillingStore(bad).flagUnresolvedEvent('e', 'r'));
});
