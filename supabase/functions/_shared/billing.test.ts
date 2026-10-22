import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { BillingStore, ReadbackInput } from './billingStore.ts';
import { loadPayPalConfig, mapPayPalStatus, PayPalClient, type PayPalSubscription, SANDBOX_BASE_URL } from './paypal.ts';
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
  };
  return { store, events, applied, grants: () => grants };
}

const activeSub: PayPalSubscription = { id: 'I-1', status: 'ACTIVE', plan_id: 'P-PH', billing_info: { next_billing_time: '2026-11-23T00:00:00Z', last_payment: { amount: { value: '599.00', currency_code: 'PHP' } } } };
const event = JSON.stringify({ id: 'WH-EVT-1', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-1' } });
const req = (body: string) => new Request('http://x', { method: 'POST', body });

Deno.test('forged signature never reaches the ledger or grants', async () => {
  const m = memoryStore();
  const res = await handleWebhook(req(event), { store: m.store, paypal: { verifyWebhookSignature: async () => false, getSubscription: async () => activeSub } });
  assertEquals(res.status, 401); assertEquals(m.events.size, 0); assertEquals(m.grants(), 0);
});

Deno.test('verified ACTIVE readback grants exactly once; replayed event is a no-op', async () => {
  const m = memoryStore(); let reads = 0;
  const deps = { store: m.store, paypal: { verifyWebhookSignature: async () => true, getSubscription: async () => { reads++; return activeSub; } } };
  assertEquals((await (await handleWebhook(req(event), deps)).json()).outcome, 'granted');
  const dup = await (await handleWebhook(req(event), deps)).json();
  assertEquals(dup.duplicate, true); assertEquals(m.grants(), 1); assertEquals(reads, 1);
});

Deno.test('webhook claiming ACTIVE but readback APPROVAL_PENDING grants nothing', async () => {
  const m = memoryStore();
  const res = await handleWebhook(req(event), { store: m.store, paypal: { verifyWebhookSignature: async () => true, getSubscription: async () => ({ ...activeSub, status: 'APPROVAL_PENDING' }) } });
  assertEquals((await res.json()).outcome, 'no_change'); assertEquals(m.grants(), 0);
});

Deno.test('amount mismatch is quarantined', async () => {
  const m = memoryStore();
  const bad = { ...activeSub, billing_info: { ...activeSub.billing_info, last_payment: { amount: { value: '1.00', currency_code: 'PHP' } } } };
  await handleWebhook(req(event), { store: m.store, paypal: { verifyWebhookSignature: async () => true, getSubscription: async () => bad } });
  assertEquals([...m.events.values()][0].status, 'quarantined'); assertEquals(m.grants(), 0);
});

Deno.test('transient failure leaves the event retryable', async () => {
  const m = memoryStore(); let fail = true;
  const deps = { store: m.store, paypal: { verifyWebhookSignature: async () => true, getSubscription: async () => { if (fail) throw new Error('down'); return activeSub; } } };
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

Deno.test('checkout resolves price server-side and requires auth', async () => {
  const m = memoryStore(); m.store.latestSubscription = async () => null;
  let planUsed = '';
  const deps = { store: m.store, config: { planIds: { PH: 'P-PH' } }, returnUrl: 'r', cancelUrl: 'c', authenticate: authed,
    paypal: { createSubscription: async (plan: string) => { planUsed = plan; return { id: 'I-2', approvalUrl: 'https://www.sandbox.paypal.com/approve' }; } } };
  const ok = await handleCreate(req(JSON.stringify({ market: 'PH', amount: '0.01' })), deps);
  assertEquals((await ok.json()).approvalUrl, 'https://www.sandbox.paypal.com/approve'); assertEquals(planUsed, 'P-PH');
  assertEquals((await handleCreate(req('{"market":"US"}'), deps)).status, 403);
  assertEquals((await handleCreate(req('{"market":"US"}'), { ...deps, enableUs: true })).status, 503);
  assertEquals((await handleCreate(req('{}'), { ...deps, authenticate: async () => null })).status, 401);
});
