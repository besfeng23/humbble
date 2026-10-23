import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { BillingStore, ReadbackInput } from './billingStore.ts';
import { loadPayPalConfig, loadPlanIds, mapPayPalStatus, parseCountryHint, PayPalClient, type PayPalSubscription, SANDBOX_BASE_URL } from './paypal.ts';
import { handleWebhook } from '../paypal-webhook/handler.ts';
import { handleCancel } from '../paypal-cancel-subscription/handler.ts';
import { handleCreate } from '../paypal-create-subscription/handler.ts';

const env = (m: Record<string, string>) => (k: string) => m[k];
const creds = { PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'secret', PAYPAL_WEBHOOK_ID: 'WH-1' };

Deno.test('config defaults to sandbox and refuses live unless explicitly allowed', () => {
  assertEquals(loadPayPalConfig(env(creds)).baseUrl, SANDBOX_BASE_URL);
  assertThrows(() => loadPayPalConfig(env({ ...creds, PAYPAL_ENV: 'live' })), Error, 'live_paypal_refused');
  assertThrows(() => loadPayPalConfig(env({ PAYPAL_ENV: 'sandbox' })), Error, 'paypal_not_configured');
});

Deno.test('status mapping fails closed for unknown states', () => {
  assertEquals(mapPayPalStatus('ACTIVE'), 'active');
  assertEquals(mapPayPalStatus('APPROVAL_PENDING'), 'approval_pending');
  assertEquals(mapPayPalStatus('WHATEVER'), 'approval_pending');
});

Deno.test('signature verification posts to PayPal verify-webhook-signature with configured webhook id', async () => {
  const calls: { url: string; body?: string }[] = [];
  const fake = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string });
    if (url.endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 300 }));
    return new Response(JSON.stringify({ verification_status: 'SUCCESS' }));
  };
  const client = new PayPalClient(loadPayPalConfig(env(creds)), fake);
  const headers = new Headers({ 'paypal-auth-algo': 'a', 'paypal-cert-url': 'c', 'paypal-transmission-id': 'i', 'paypal-transmission-sig': 's', 'paypal-transmission-time': 't' });
  assert(await client.verifyWebhookSignature(headers, '{"id":"E"}'));
  assertEquals(calls[1].url, `${SANDBOX_BASE_URL}/v1/notifications/verify-webhook-signature`);
  assertEquals(JSON.parse(calls[1].body!).webhook_id, 'WH-1');
  assert(!(await client.verifyWebhookSignature(new Headers(), '{}')), 'missing headers rejected without calling PayPal');
});

function memoryStore() {
  const events = new Map<string, { eventId: string; status: string }>();
  const applied: ReadbackInput[] = []; let grants = 0;
  const store: BillingStore = {
    recordEvent: async (e) => {
      const hit = events.get(e.id);
      if (hit) return { ...hit, isNew: false };
      const row = { eventId: `ev-${events.size}`, status: 'verified' }; events.set(e.id, row); return { ...row, isNew: true };
    },
    finishEvent: async (id, status) => { for (const v of events.values()) if (v.eventId === id) v.status = status; },
    applyReadback: async (i) => {
      applied.push(i);
      if (i.providerPlanId !== 'P-PH') return { outcome: 'plan_mismatch', granted: false };
      if (i.status === 'active') {
        if (i.lastPaymentAmount !== '599.00' || i.lastPaymentCurrency !== 'PHP') return { outcome: 'settlement_mismatch', granted: false };
        grants++; return { outcome: 'granted', granted: true };
      }
      return { outcome: i.status === 'cancelled' ? 'cancel_at_period_end' : 'no_change', granted: false };
    },
    registerPending: async () => {},
    latestSubscription: async () => ({ provider_subscription_id: 'I-1', status: 'active' }),
    resolvePlan: async () => null,
    flagUnresolvedEvent: async () => {},
    listReconcileSubscriptions: async () => [],
    listReprocessableEvents: async () => [],
  };
  return { store, events, applied, grants: () => grants };
}

const activeSub: PayPalSubscription = { id: 'I-1', status: 'ACTIVE', plan_id: 'P-PH', billing_info: { next_billing_time: '2026-11-23T00:00:00Z', last_payment: { amount: { value: '599.00', currency_code: 'PHP' } } } };
const event = JSON.stringify({ id: 'WH-EVT-1', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-1' } });
const req = (body: string) => new Request('http://x', { method: 'POST', body });

Deno.test('forged signature never reaches the ledger or grants', async () => {
  const m = memoryStore();
  const res = await handleWebhook(req(event), { store: m.store, paypal: { verifyWebhookSignature: async () => false, getSubscription: async () => activeSub, getSale: async () => null } });
  assertEquals(res.status, 401); assertEquals(m.events.size, 0); assertEquals(m.grants(), 0);
});

Deno.test('verified ACTIVE readback grants exactly once; replayed event is a no-op', async () => {
  const m = memoryStore(); let reads = 0;
  const deps = { store: m.store, paypal: { verifyWebhookSignature: async () => true, getSale: async () => null, getSubscription: async () => { reads++; return activeSub; } } };
  assertEquals((await (await handleWebhook(req(event), deps)).json()).outcome, 'granted');
  const dup = await (await handleWebhook(req(event), deps)).json();
  assertEquals(dup.duplicate, true); assertEquals(m.grants(), 1); assertEquals(reads, 1);
});

Deno.test('webhook claiming ACTIVE but readback APPROVAL_PENDING grants nothing', async () => {
  const m = memoryStore();
  const res = await handleWebhook(req(event), { store: m.store, paypal: { verifyWebhookSignature: async () => true, getSale: async () => null, getSubscription: async () => ({ ...activeSub, status: 'APPROVAL_PENDING' }) } });
  assertEquals((await res.json()).outcome, 'no_change'); assertEquals(m.grants(), 0);
});

Deno.test('amount mismatch is quarantined', async () => {
  const m = memoryStore();
  const bad = { ...activeSub, billing_info: { ...activeSub.billing_info, last_payment: { amount: { value: '1.00', currency_code: 'PHP' } } } };
  await handleWebhook(req(event), { store: m.store, paypal: { verifyWebhookSignature: async () => true, getSale: async () => null, getSubscription: async () => bad } });
  assertEquals([...m.events.values()][0].status, 'quarantined'); assertEquals(m.grants(), 0);
});

Deno.test('transient failure leaves the event retryable', async () => {
  const m = memoryStore(); let fail = true;
  const deps = { store: m.store, paypal: { verifyWebhookSignature: async () => true, getSale: async () => null, getSubscription: async () => { if (fail) throw new Error('down'); return activeSub; } } };
  await handleWebhook(req(event), deps).catch(() => null);
  fail = false;
  assertEquals((await (await handleWebhook(req(event), deps)).json()).outcome, 'granted');
});

const authed = async () => 'user-1';
Deno.test('cancel refuses APPROVAL_PENDING and never calls PayPal cancel', async () => {
  const m = memoryStore(); let cancels = 0;
  const res = await handleCancel(req('{}'), { store: m.store, authenticate: authed, paypal: { getSubscription: async () => ({ ...activeSub, status: 'APPROVAL_PENDING' }), cancelSubscription: async () => { cancels++; } } });
  assertEquals(res.status, 409); assertEquals(cancels, 0);
});

Deno.test('cancel of ACTIVE subscription cancels renewal and reconciles', async () => {
  const m = memoryStore(); let state = 'ACTIVE';
  const res = await handleCancel(req('{}'), { store: m.store, authenticate: authed, paypal: { getSubscription: async () => ({ ...activeSub, status: state }), cancelSubscription: async () => { state = 'CANCELLED'; } } });
  assertEquals((await res.json()).outcome, 'cancel_at_period_end');
});

Deno.test('plan ids load per currency from PAYPAL_PLAN_ID_<CUR>', () => {
  const ids = loadPlanIds(env({ PAYPAL_PLAN_ID_SEK: 'P-SEK', PAYPAL_PLAN_ID_EUR: ' P-EUR ', PAYPAL_PLAN_ID_XYZ: 'nope' }));
  assertEquals(ids, { SEK: 'P-SEK', EUR: 'P-EUR' });
});

Deno.test('country hint is sanitised before reaching the server allowlist', () => {
  assertEquals(parseCountryHint('se'), 'SE');
  assertEquals(parseCountryHint('SWE'), null);
  assertEquals(parseCountryHint("S'"), null);
  assertEquals(parseCountryHint(42), null);
});

Deno.test('checkout uses the DB-resolved plan; client amounts are ignored', async () => {
  const m = memoryStore(); m.store.latestSubscription = async () => null;
  const hints: (string | null)[] = [];
  m.store.resolvePlan = async (_uid, hint) => { hints.push(hint); return hint === 'SE' ? { countryCode: 'SE', planKey: 'premium_monthly_sek', currency: 'SEK', amount: '299.00' } : { countryCode: 'PH', planKey: 'premium_monthly_ph', currency: 'PHP', amount: '599.00' }; };
  const registered: string[] = []; m.store.registerPending = async (_u, key, _s, plan) => { registered.push(`${key}:${plan}`); };
  let planUsed = '';
  const deps = { store: m.store, config: { planIds: { SEK: 'P-SEK', PHP: 'P-PH' }, environment: 'sandbox' as const, liveAllowed: false }, returnUrl: 'r', cancelUrl: 'c', authenticate: authed,
    paypal: { createSubscription: async (plan: string) => { planUsed = plan; return { id: 'I-2', approvalUrl: 'https://www.sandbox.paypal.com/approve' }; } } };
  const ok = await (await handleCreate(req(JSON.stringify({ country: 'se', amount: '0.01', currency: 'USD' })), deps)).json();
  assertEquals([ok.currency, ok.amount, planUsed], ['SEK', '299.00', 'P-SEK']);
  assertEquals(registered, ['premium_monthly_sek:P-SEK']);
  await handleCreate(req(JSON.stringify({ country: 'ZZZ' })), deps);
  assertEquals(hints[1], null);
  assertEquals((await handleCreate(req('{}'), { ...deps, config: { planIds: {}, environment: 'sandbox' as const, liveAllowed: false } })).status, 503);
  assertEquals((await handleCreate(req('{}'), { ...deps, authenticate: async () => null })).status, 401);
});

Deno.test('checkout resolves the plan for the authenticated user (profile country first, in DB)', async () => {
  const m = memoryStore(); m.store.latestSubscription = async () => null;
  const seen: [string, string | null][] = [];
  m.store.resolvePlan = async (uid, hint) => { seen.push([uid, hint]); return { countryCode: 'NO', planKey: 'premium_monthly_nok', currency: 'NOK', amount: '329.00' }; };
  const deps = { store: m.store, config: { planIds: { NOK: 'P-NOK' }, environment: 'sandbox' as const, liveAllowed: false }, returnUrl: 'r', cancelUrl: 'c', authenticate: async () => 'user-77',
    paypal: { createSubscription: async () => ({ id: 'I-9', approvalUrl: 'https://www.sandbox.paypal.com/approve' }) } };
  const body = await (await handleCreate(req(JSON.stringify({ country: 'GB' })), deps)).json();
  assertEquals(seen, [['user-77', 'GB']]);
  assertEquals([body.currency, body.amount], ['NOK', '329.00']);
});
