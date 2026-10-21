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

async function updateJob(job: Job, outcome: 'sent' | 'failed', errorCode?: string) {
  // Failures reuse the tested retry builder so locked_at is cleared and backoff is bounded.
  const update = outcome === 'sent'
    ? { status: 'sent', sent_at: new Date().toISOString(), last_error_code: null, locked_at: null }
    : buildRetryUpdate(job, errorCode ?? 'delivery_error');
  await db.from('notification_jobs').update(update).eq('id', job.id);
}

export function bearerMatches(header: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (header === null || header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function deliver(job: Job) {
  const preferenceColumn = job.notification_type === 'match' ? 'matches_enabled' : 'messages_enabled';
  const { data: preference, error: preferenceError } = await db.from('notification_preferences').select('matches_enabled,messages_enabled').eq('user_id', job.recipient_id).maybeSingle();
  if (preferenceError) { await updateJob(job, 'failed', 'preference_lookup_failed'); return; }
  if (preference && preference[preferenceColumn] === false) { await updateJob(job, 'sent'); return; }
  const { data: tokens, error } = await db.from('push_tokens').select('id,token').eq('user_id', job.recipient_id);
  if (error) { await updateJob(job, 'failed', 'token_lookup_failed'); return; }
  if (!tokens?.length) { await updateJob(job, 'sent'); return; }
  const payloads = tokens.map((token: { id: string; token: string }) => buildExpoPayload(job, token.token));
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'accept-encoding': 'gzip, deflate' },
      body: JSON.stringify(payloads),
    });
    if (!response.ok) { await updateJob(job, 'failed', `expo_http_${response.status}`); return; }
    const result = await response.json() as { data?: ExpoTicket[] };
    const tickets = result.data ?? [];
    let retry = tickets.length !== payloads.length;
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.status === 'ok') continue;
      if (isInvalidDeviceTicket(ticket)) {
        // Never log token values; remove only the exact invalid registration.
        await db.from('push_tokens').delete().eq('id', tokens[i].id);
      } else {
        retry = true;
      }
    }
    await updateJob(job, retry ? 'failed' : 'sent', retry ? 'expo_ticket_error' : undefined);
  } catch {
    await updateJob(job, 'failed', 'expo_network_error');
  }
}

if (import.meta.main) Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: 'server_not_configured' }, { status: 500 });
  if (!bearerMatches(request.headers.get('authorization'), serviceRoleKey)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { data: jobs, error } = await db.rpc('claim_notification_jobs', { p_limit: 100 });
    if (error) return Response.json({ error: 'claim_failed' }, { status: 500 });
    await Promise.all(((jobs ?? []) as Job[]).map(deliver));
    return Response.json({ processed: jobs?.length ?? 0 });
  } catch {
    return Response.json({ error: 'drain_failed' }, { status: 500 });
  }
});
