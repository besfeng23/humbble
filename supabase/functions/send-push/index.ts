import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const db = createClient(supabaseUrl ?? 'https://unconfigured.invalid', serviceRoleKey ?? 'missing-service-role-key', { auth: { persistSession: false, autoRefreshToken: false } });

type Job = { id: number; recipient_id: string; notification_type: 'match' | 'message'; match_id: string | null; conversation_id: string | null; retry_count: number };
type ExpoTicket = { status?: string; id?: string; message?: string; details?: { error?: string } };

export function retryDelaySeconds(retryCount: number): number { return Math.min(3600, 30 * (2 ** Math.min(retryCount, 7))); }
export function buildExpoPayload(job: Job, token: string) {
  return { to: token, sound: 'default', title: 'Humbble', body: job.notification_type === 'match' ? 'New match' : 'New message',
    data: job.notification_type === 'match' ? { type: 'match', matchId: job.match_id } : { type: 'message', conversationId: job.conversation_id } };
}
export function isInvalidDeviceTicket(ticket: ExpoTicket): boolean { return ticket.details?.error === 'DeviceNotRegistered'; }
export function buildRetryUpdate(job: Job, errorCode: string, now = Date.now()) {
  const retryCount = job.retry_count + 1;
  return { status: 'failed', locked_at: null, retry_count: retryCount,
    next_attempt_at: new Date(now + retryDelaySeconds(retryCount) * 1000).toISOString(),
    last_error_code: errorCode };
}

export function bearerMatches(header: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (header === null || header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

type TokenRow = { id: string; token: string };
type DeliveryRecord = { token: string; status: 'sent' | 'failed'; last_error_code: string | null };
export type DeliveryStore = {
  getPreference(userId: string): Promise<{ matches_enabled: boolean; messages_enabled: boolean } | null>;
  getTokens(userId: string): Promise<TokenRow[]>;
  getSentTokens(jobId: number): Promise<string[]>;
  recordDeliveries(jobId: number, rows: DeliveryRecord[]): Promise<void>;
  deleteToken(id: string): Promise<void>;
  updateJob(jobId: number, update: Record<string, unknown>): Promise<void>;
};
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function jobUpdate(job: Job, outcome: 'sent' | 'failed', errorCode?: string, now = Date.now()) {
  // Failures reuse the tested retry builder so locked_at is cleared and backoff is bounded.
  return outcome === 'sent'
    ? { status: 'sent', sent_at: new Date(now).toISOString(), last_error_code: null, locked_at: null }
    : buildRetryUpdate(job, errorCode ?? 'delivery_error', now);
}

// Delivery is tracked per (job, token): a retry only resends to devices that
// have not yet succeeded for this job, so successful devices never get duplicates.
export async function deliverJob(job: Job, store: DeliveryStore, fetchFn: FetchLike = fetch, now = Date.now()): Promise<'sent' | 'failed'> {
  const finish = async (outcome: 'sent' | 'failed', errorCode?: string) => { await store.updateJob(job.id, jobUpdate(job, outcome, errorCode, now)); return outcome; };
  let tokens: TokenRow[]; let sent: Set<string>;
  try {
    const preference = await store.getPreference(job.recipient_id);
    const column = job.notification_type === 'match' ? 'matches_enabled' : 'messages_enabled';
    if (preference && preference[column] === false) return finish('sent');
  } catch { return finish('failed', 'preference_lookup_failed'); }
  try {
    tokens = await store.getTokens(job.recipient_id);
    sent = new Set(await store.getSentTokens(job.id));
  } catch { return finish('failed', 'token_lookup_failed'); }
  const pending = tokens.filter(token => !sent.has(token.token));
  if (!pending.length) return finish('sent');
  const payloads = pending.map(token => buildExpoPayload(job, token.token));
  let tickets: ExpoTicket[];
  try {
    const response = await fetchFn(EXPO_PUSH_URL, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'accept-encoding': 'gzip, deflate' },
      body: JSON.stringify(payloads),
    });
    if (!response.ok) return finish('failed', `expo_http_${response.status}`);
    tickets = ((await response.json()) as { data?: ExpoTicket[] }).data ?? [];
  } catch { return finish('failed', 'expo_network_error'); }
  const records: DeliveryRecord[] = [];
  let retry = false;
  for (let i = 0; i < pending.length; i++) {
    const ticket = tickets[i];
    if (ticket?.status === 'ok') { records.push({ token: pending[i].token, status: 'sent', last_error_code: null }); continue; }
    if (ticket && isInvalidDeviceTicket(ticket)) {
      // Never log token values; remove only the exact invalid registration.
      await store.deleteToken(pending[i].id);
      continue;
    }
    retry = true;
    records.push({ token: pending[i].token, status: 'failed', last_error_code: ticket?.details?.error ?? 'expo_ticket_missing' });
  }
  try { if (records.length) await store.recordDeliveries(job.id, records); }
  catch { return finish('failed', 'delivery_record_failed'); }
  return finish(retry ? 'failed' : 'sent', retry ? 'expo_ticket_error' : undefined);
}

const supabaseStore: DeliveryStore = {
  async getPreference(userId) {
    const { data, error } = await db.from('notification_preferences').select('matches_enabled,messages_enabled').eq('user_id', userId).maybeSingle();
    if (error) throw error; return data;
  },
  async getTokens(userId) {
    const { data, error } = await db.from('push_tokens').select('id,token').eq('user_id', userId);
    if (error) throw error; return data ?? [];
  },
  async getSentTokens(jobId) {
    const { data, error } = await db.from('notification_deliveries').select('token').eq('job_id', jobId).eq('status', 'sent');
    if (error) throw error; return (data ?? []).map((row: { token: string }) => row.token);
  },
  async recordDeliveries(jobId, rows) {
    const { error } = await db.from('notification_deliveries').upsert(rows.map(row => ({ job_id: jobId, ...row, updated_at: new Date().toISOString() })), { onConflict: 'job_id,token' });
    if (error) throw error;
  },
  async deleteToken(id) { await db.from('push_tokens').delete().eq('id', id); },
  async updateJob(jobId, update) { await db.from('notification_jobs').update(update).eq('id', jobId); },
};

if (import.meta.main) Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: 'server_not_configured' }, { status: 500 });
  if (!bearerMatches(request.headers.get('authorization'), serviceRoleKey)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { data: jobs, error } = await db.rpc('claim_notification_jobs', { p_limit: 100 });
    if (error) return Response.json({ error: 'claim_failed' }, { status: 500 });
    await Promise.all(((jobs ?? []) as Job[]).map(job => deliverJob(job, supabaseStore)));
    return Response.json({ processed: jobs?.length ?? 0 });
  } catch {
    return Response.json({ error: 'drain_failed' }, { status: 500 });
  }
});
