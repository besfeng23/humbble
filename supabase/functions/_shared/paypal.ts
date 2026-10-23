// PayPal Sandbox client + pure billing logic shared by the P4 Edge Functions.
// Credentials come only from server env vars. Live mode is refused unless
// PAYPAL_ENV=live AND PAYPAL_ALLOW_LIVE=true are both explicitly configured.
// The database cannot see those variables: it separately refuses any non-sandbox
// subscription row (RPC check + chk_subscriptions_environment) until a separate,
// owner-approved live-launch migration. The environment actually in use is recorded
// on every subscription row at checkout (billing_register_pending_subscription).

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type Env = (key: string) => string | undefined;

export type PayPalConfig = {
  baseUrl: string;
  environment: 'sandbox' | 'live';
  /** True only when PAYPAL_ENV=live AND PAYPAL_ALLOW_LIVE=true. Always false for sandbox. */
  liveAllowed: boolean;
  clientId: string;
  clientSecret: string;
  webhookId: string;
  /** One PayPal plan id per currency, from PAYPAL_PLAN_ID_<CUR>. */
  planIds: Partial<Record<Currency, string>>;
};

export const SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';
export const LIVE_BASE_URL = 'https://api-m.paypal.com';

export class ConfigError extends Error {}

export function loadPayPalConfig(env: Env): PayPalConfig {
  const mode = (env('PAYPAL_ENV') ?? 'sandbox').trim().toLowerCase();
  if (mode !== 'sandbox' && mode !== 'live') throw new ConfigError('invalid_paypal_env');
  if (mode === 'live' && env('PAYPAL_ALLOW_LIVE') !== 'true') throw new ConfigError('live_paypal_refused');
  const clientId = env('PAYPAL_CLIENT_ID');
  const clientSecret = env('PAYPAL_CLIENT_SECRET');
  const webhookId = env('PAYPAL_WEBHOOK_ID');
  if (!clientId || !clientSecret || !webhookId) throw new ConfigError('paypal_not_configured');
  return {
    baseUrl: mode === 'live' ? LIVE_BASE_URL : SANDBOX_BASE_URL,
    environment: mode,
    liveAllowed: mode === 'live' && env('PAYPAL_ALLOW_LIVE') === 'true',
    clientId, clientSecret, webhookId,
    planIds: loadPlanIds(env),
  };
}

// Currencies that may carry a PayPal plan. Prices live only in public.billing_plans.
export const CURRENCIES = ['PHP', 'USD', 'EUR', 'GBP', 'SEK', 'NOK', 'CAD', 'AUD', 'NZD'] as const;
export type Currency = typeof CURRENCIES[number];
export function loadPlanIds(env: Env): Partial<Record<Currency, string>> {
  const ids: Partial<Record<Currency, string>> = {};
  for (const c of CURRENCIES) { const v = env(`PAYPAL_PLAN_ID_${c}`)?.trim(); if (v) ids[c] = v; }
  return ids;
}
/** Client country hints are advisory; only a 2-letter code is forwarded, and the DB allowlist decides. */
export function parseCountryHint(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z]{2}$/.test(value.trim()) ? value.trim().toUpperCase() : null;
}

export class PayPalClient {
  private token: { value: string; expiresAt: number } | null = null;
  constructor(private cfg: PayPalConfig, private fetchFn: FetchLike = fetch) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const res = await this.fetchFn(`${this.cfg.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${this.cfg.clientId}:${this.cfg.clientSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`paypal_oauth_failed_${res.status}`);
    const body = await res.json();
    this.token = { value: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 0) * 1000 };
    return this.token.value;
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken();
    return this.fetchFn(`${this.cfg.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  }

  async verifyWebhookSignature(headers: Headers, rawBody: string): Promise<boolean> {
    const h = (k: string) => headers.get(k);
    const required = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'];
    if (required.some((k) => !h(k))) return false;
    // PayPal signs the exact bytes it sent (CRC32 of the raw body), so the body must reach the verify
    // API unmodified. Re-serialising JSON.parse() output can change number formatting / escapes and
    // cause false 401s. We validate that rawBody is a single JSON object, then embed the ORIGINAL text
    // as the webhook_event value (string concatenation; every other field is JSON.stringify-escaped).
    try { const parsed = JSON.parse(rawBody); if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false; } catch { return false; }
    const prefix = JSON.stringify({
      auth_algo: h('paypal-auth-algo'), cert_url: h('paypal-cert-url'),
      transmission_id: h('paypal-transmission-id'), transmission_sig: h('paypal-transmission-sig'),
      transmission_time: h('paypal-transmission-time'), webhook_id: this.cfg.webhookId,
    });
    const res = await this.call('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: `${prefix.slice(0, -1)},"webhook_event":${rawBody}}`,
    });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.verification_status === 'SUCCESS';
  }

  async createSubscription(planId: string, customId: string, returnUrl: string, cancelUrl: string, requestId: string) {
    const res = await this.call('/v1/billing/subscriptions', {
      method: 'POST',
      headers: { 'PayPal-Request-Id': requestId, Prefer: 'return=representation' },
      body: JSON.stringify({ plan_id: planId, custom_id: customId, application_context: { brand_name: 'Humbble', user_action: 'SUBSCRIBE_NOW', return_url: returnUrl, cancel_url: cancelUrl } }),
    });
    if (!res.ok) throw new Error(`paypal_create_failed_${res.status}`);
    const body = await res.json();
    const approve = (body.links ?? []).find((l: { rel: string }) => l.rel === 'approve')?.href as string | undefined;
    if (!body.id || !approve) throw new Error('paypal_create_missing_approval');
    return { id: String(body.id), approvalUrl: approve };
  }

  async getSubscription(id: string): Promise<PayPalSubscription> {
    const res = await this.call(`/v1/billing/subscriptions/${encodeURIComponent(id)}`, { method: 'GET' });
    if (!res.ok) throw new Error(`paypal_read_failed_${res.status}`);
    return await res.json();
  }

  /** Show sale details. Returns null only for a definitive 404; any other failure throws (retryable). */
  async getSale(saleId: string): Promise<PayPalSale | null> {
    const res = await this.call(`/v1/payments/sale/${encodeURIComponent(saleId)}`, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`paypal_sale_read_failed_${res.status}`);
    return await res.json();
  }

  async cancelSubscription(id: string, reason: string): Promise<void> {
    const res = await this.call(`/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
    if (res.status !== 204 && !res.ok) throw new Error(`paypal_cancel_failed_${res.status}`);
  }
}

export type PayPalSubscription = {
  id: string;
  status: 'APPROVAL_PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED' | string;
  plan_id?: string;
  custom_id?: string;
  billing_info?: {
    next_billing_time?: string;
    last_payment?: { amount?: { value?: string; currency_code?: string }; time?: string };
  };
};

export type PayPalSale = {
  id?: string;
  state?: string;
  /** For subscription payments this is the PayPal subscription id (I-...). */
  billing_agreement_id?: string;
  parent_payment?: string;
};

export type DbStatus = 'approval_pending' | 'active' | 'past_due' | 'suspended' | 'cancelled' | 'expired' | 'refunded' | 'revoked';

/** Deterministic PayPal readback -> database state mapping. Unknown states fail closed. */
export function mapPayPalStatus(status: string): DbStatus {
  switch (status) {
    case 'ACTIVE': return 'active';
    case 'SUSPENDED': return 'suspended';
    case 'CANCELLED': return 'cancelled';
    case 'EXPIRED': return 'expired';
    default: return 'approval_pending';
  }
}

/** Extract the subscription id a webhook event refers to. */
export function subscriptionIdFromEvent(event: { event_type?: string; resource?: Record<string, unknown> }): string | null {
  const r = event.resource ?? {};
  if (typeof event.event_type === 'string' && event.event_type.startsWith('BILLING.SUBSCRIPTION.')) return typeof r.id === 'string' ? r.id : null;
  if (typeof r.billing_agreement_id === 'string') return r.billing_agreement_id;
  return null;
}

/**
 * Sale id an event refers to. PAYMENT.SALE.REFUNDED carries the refund object (resource.sale_id and
 * no billing_agreement_id); PAYMENT.SALE.REVERSED/COMPLETED carry the sale itself (resource.id).
 */
export function saleIdFromEvent(event: { event_type?: string; resource?: Record<string, unknown> }): string | null {
  if (typeof event.event_type !== 'string' || !event.event_type.startsWith('PAYMENT.SALE.')) return null;
  const r = event.resource ?? {};
  if (typeof r.sale_id === 'string' && r.sale_id) return r.sale_id;
  // For REFUNDED, resource.id is the refund id (not a sale id), so it is never used as a fallback.
  if (event.event_type !== 'PAYMENT.SALE.REFUNDED' && typeof r.id === 'string' && r.id) return r.id;
  return null;
}

/** ACTIVE readback whose first payment has not been reflected yet: a transient state worth retrying. */
export function isSettlementPending(sub: PayPalSubscription): boolean {
  return sub.status === 'ACTIVE' && (!sub.billing_info?.last_payment?.amount?.value || !sub.billing_info?.next_billing_time);
}

/** Constant-time check of an `Authorization: Bearer <secret>` header (same approach as send-push). */
export function bearerMatches(header: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (header === null || header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const REFUND_EVENTS = new Set(['PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED']);

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
