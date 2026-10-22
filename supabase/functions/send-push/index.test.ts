import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { bearerMatches, buildExpoPayload, deliverJob, type DeliveryStore, buildRetryUpdate, isInvalidDeviceTicket, retryDelaySeconds } from './index.ts';

Deno.test('push payload has no message body or user text', () => {
  const payload = buildExpoPayload({ id: 1, recipient_id: 'user', notification_type: 'message', match_id: null, conversation_id: 'conversation', retry_count: 0 }, 'ExponentPushToken[test]');
  assertEquals(payload.title, 'Humbble');
  assertEquals(payload.body, 'New message');
  assertEquals(payload.data, { type: 'message', conversationId: 'conversation' });
  assert(!('message' in payload) && !('text' in payload));
});

Deno.test('Expo DeviceNotRegistered tickets are identified for token removal', () => {
  assert(isInvalidDeviceTicket({ status: 'error', details: { error: 'DeviceNotRegistered' } }));
  assert(!isInvalidDeviceTicket({ status: 'error', details: { error: 'MessageRateExceeded' } }));
});

Deno.test('retry delay grows exponentially and is capped at one hour', () => {
  assertEquals(retryDelaySeconds(0), 30);
  assertEquals(retryDelaySeconds(3), 240);
  assertEquals(retryDelaySeconds(20), 3600);
});

Deno.test('failed delivery increments retry count and schedules a bounded retry', () => {
  const update = buildRetryUpdate({ id: 7, recipient_id: 'user', notification_type: 'message', match_id: null, conversation_id: 'conversation', retry_count: 2 }, 'expo_network_error', 0);
  assertEquals(update.status, 'failed');
  assertEquals(update.retry_count, 3);
  assertEquals(update.locked_at, null);
  assertEquals(update.last_error_code, 'expo_network_error');
  assertEquals(update.next_attempt_at, new Date(240000).toISOString());
});

Deno.test('match payload carries only the match id and fixed copy', () => {
  const payload = buildExpoPayload({ id: 2, recipient_id: 'user', notification_type: 'match', match_id: 'match-1', conversation_id: null, retry_count: 0 }, 'ExponentPushToken[test]');
  assertEquals(payload.title, 'Humbble');
  assertEquals(payload.body, 'New match');
  assertEquals(payload.data, { type: 'match', matchId: 'match-1' });
});

Deno.test('drain endpoint accepts only the exact service bearer token', () => {
  assert(bearerMatches('Bearer test-secret', 'test-secret'));
  assert(!bearerMatches('Bearer test-secreT', 'test-secret'));
  assert(!bearerMatches('Bearer test', 'test-secret'));
  assert(!bearerMatches(null, 'test-secret'));
});

type Ledger = Map<string, 'sent' | 'failed'>;
function fakeStore(tokens: { id: string; token: string }[], ledger: Ledger = new Map()) {
  const jobUpdates: Record<string, unknown>[] = []; const deleted: string[] = [];
  const store: DeliveryStore = {
    getPreference: async () => ({ matches_enabled: true, messages_enabled: true }),
    getTokens: async () => tokens.filter(t => !deleted.includes(t.id)),
    getSentTokens: async () => [...ledger].filter(([, s]) => s === 'sent').map(([t]) => t),
    recordDeliveries: async (_job, rows) => { for (const r of rows) ledger.set(r.token, r.status); },
    deleteToken: async id => { deleted.push(id); },
    updateJob: async (_id, update) => { jobUpdates.push(update); },
  };
  return { store, ledger, jobUpdates, deleted };
}
function expo(statuses: Record<string, string>, sentTo: string[][]) {
  return async (_url: string, init: RequestInit) => {
    const payloads = JSON.parse(String(init.body)) as { to: string }[];
    sentTo.push(payloads.map(p => p.to));
    return Response.json({ data: payloads.map(p => statuses[p.to] === 'ok' ? { status: 'ok' } : { status: 'error', details: { error: statuses[p.to] } }) });
  };
}
const messageJob = { id: 9, recipient_id: 'user', notification_type: 'message' as const, match_id: null, conversation_id: 'c', retry_count: 0 };
const phoneA = { id: 'a', token: 'ExponentPushToken[phone-a]' };
const phoneB = { id: 'b', token: 'ExponentPushToken[phone-b]' };

Deno.test('retry resends only to the device that failed, never to devices that succeeded', async () => {
  const { store, ledger, jobUpdates } = fakeStore([phoneA, phoneB]);
  const sentTo: string[][] = [];
  assertEquals(await deliverJob(messageJob, store, expo({ [phoneA.token]: 'ok', [phoneB.token]: 'MessageRateExceeded' }, sentTo), 0), 'failed');
  assertEquals(ledger.get(phoneA.token), 'sent');
  assertEquals(ledger.get(phoneB.token), 'failed');
  assertEquals(jobUpdates[0].status, 'failed');
  assertEquals(await deliverJob({ ...messageJob, retry_count: 1 }, store, expo({ [phoneA.token]: 'ok', [phoneB.token]: 'ok' }, sentTo), 0), 'sent');
  assertEquals(sentTo, [[phoneA.token, phoneB.token], [phoneB.token]]);
  assertEquals(ledger.get(phoneB.token), 'sent');
  assertEquals(jobUpdates[1].status, 'sent');
});

Deno.test('a job whose devices all succeeded sends nothing more', async () => {
  const { store } = fakeStore([phoneA], new Map([[phoneA.token, 'sent']]));
  const sentTo: string[][] = [];
  assertEquals(await deliverJob(messageJob, store, expo({}, sentTo)), 'sent');
  assertEquals(sentTo, []);
});

Deno.test('unregistered devices are removed without forcing a retry', async () => {
  const { store, deleted, ledger } = fakeStore([phoneA, phoneB]);
  const sentTo: string[][] = [];
  assertEquals(await deliverJob(messageJob, store, expo({ [phoneA.token]: 'ok', [phoneB.token]: 'DeviceNotRegistered' }, sentTo)), 'sent');
  assertEquals(deleted, ['b']);
  assertEquals(ledger.has(phoneB.token), false);
});

Deno.test('network failure records no device as sent so every device is retried', async () => {
  const { store, ledger, jobUpdates } = fakeStore([phoneA, phoneB]);
  assertEquals(await deliverJob(messageJob, store, async () => { throw new Error('offline'); }), 'failed');
  assertEquals(ledger.size, 0);
  assertEquals(jobUpdates[0].last_error_code, 'expo_network_error');
});

Deno.test('disabled preference completes the job without sending', async () => {
  const { store } = fakeStore([phoneA]);
  store.getPreference = async () => ({ matches_enabled: true, messages_enabled: false });
  const sentTo: string[][] = [];
  assertEquals(await deliverJob(messageJob, store, expo({}, sentTo)), 'sent');
  assertEquals(sentTo, []);
});
