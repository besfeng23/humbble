// PayPal Sandbox client + pure billing logic shared by the P4 Edge Functions.
// Credentials come only from server env vars. Live mode is refused unless
// PAYPAL_ENV=live AND PAYPAL_ALLOW_LIVE=true are both explicitly configured
// (and the database additionally rejects non-sandbox subscription rows).

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type Env = (key: string) => string | undefined;

export type PayPalConfig = {
  baseUrl: string;
  environment: 'sandbox' | 'live';
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
    let event: unknown;
    try { event = JSON.parse(rawBody); } catch { return false; }
    const res = await this.call('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: JSON.stringify({
        auth_algo: h('paypal-auth-algo'), cert_url: h('paypal-cert-url'),
        transmission_id: h('paypal-transmission-id'), transmission_sig: h('paypal-transmission-sig'),
        transmission_time: h('paypal-transmission-time'), webhook_id: this.cfg.webhookId, webhook_event: event,
      }),
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

export const REFUND_EVENTS = new Set(['PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED']);

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
