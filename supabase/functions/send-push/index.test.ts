import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { bearerMatches, buildExpoPayload, buildRetryUpdate, isInvalidDeviceTicket, retryDelaySeconds } from './index.ts';

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
