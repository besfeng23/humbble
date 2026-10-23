import {
  classifyPrivacyError,
  isOpenPrivacyRequest,
  loadMyPrivacyRequests,
  newPrivacyIdempotencyKey,
  privacyRequestTypeLabel,
  privacyStatusLabel,
  submitPrivacyRequest,
} from '../privacy';
import { isUuidV4 } from '../quizAnalytics';

const mockRpc = jest.fn();
const mockLimit = jest.fn();
const mockOrder = jest.fn(() => ({ limit: mockLimit }));
const mockSelect = jest.fn(() => ({ order: mockOrder }));
const mockFrom = jest.fn((..._args: unknown[]) => ({ select: mockSelect }));
jest.mock('../supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a), from: (...a: unknown[]) => mockFrom(...a) },
}));


const err = (code: string, message: string) => ({ code, message, details: '', hint: '' });

beforeEach(() => jest.clearAllMocks());

describe('privacy request client (LB-1)', () => {
  test('idempotency keys are random v4 UUIDs, different per attempt', () => {
    const a = newPrivacyIdempotencyKey();
    const b = newPrivacyIdempotencyKey();
    expect(isUuidV4(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  test('submit calls request_privacy_action with the type and the key, nothing else', async () => {
    mockRpc.mockResolvedValue({ data: '11111111-2222-4333-8444-555555555555', error: null });
    const out = await submitPrivacyRequest('deletion', 'key-1');
    expect(mockRpc).toHaveBeenCalledWith('request_privacy_action', { p_request_type: 'deletion', p_idempotency_key: 'key-1' });
    expect(out).toEqual({ kind: 'recorded', requestId: '11111111-2222-4333-8444-555555555555' });
  });

  test('maps database errors to member outcomes without leaking database wording', () => {
    expect(classifyPrivacyError(err('P0001', 'privacy_request_already_open'))).toEqual({ kind: 'already_open' });
    expect(classifyPrivacyError(err('42501', 'authentication_required'))).toEqual({ kind: 'sign_in_required' });
    expect(classifyPrivacyError(err('PGRST301', 'JWT expired'))).toEqual({ kind: 'sign_in_required' });
    expect(classifyPrivacyError(err('22023', 'request_type_and_idempotency_key_required'))).toEqual({ kind: 'failed', retryable: false });
    expect(classifyPrivacyError(err('08006', 'connection failure'))).toEqual({ kind: 'failed', retryable: true });
    expect(classifyPrivacyError(null)).toEqual({ kind: 'failed', retryable: true });
  });

  test('a foreign-key error (member has no profiles row) is not a connectivity problem (Themis N45-04)', () => {
    expect(classifyPrivacyError(err('23503', 'insert or update on table "privacy_requests" violates foreign key constraint "privacy_requests_user_id_fkey"'))).toEqual({ kind: 'profile_missing' });
    expect(classifyPrivacyError(err('', 'violates foreign key constraint'))).toEqual({ kind: 'profile_missing' });
  });

  test('the idempotency key comes from the secure generator and never uses Math.random', () => {
    const rnd = jest.spyOn(Math, 'random');
    const ids = new Set(Array.from({ length: 20 }, () => newPrivacyIdempotencyKey()));
    expect(ids.size).toBe(20);
    ids.forEach((id) => expect(isUuidV4(id)).toBe(true));
    expect(rnd).not.toHaveBeenCalled();
    rnd.mockRestore();
  });

  test('with no secure random source the key generator throws instead of falling back to Math.random', () => {
    const g = globalThis as any;
    const realCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const rnd = jest.spyOn(Math, 'random');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'expo', { value: undefined, configurable: true, writable: true });
    try {
      let threw: unknown = null;
      rnd.mockClear();
      try { newPrivacyIdempotencyKey(); } catch (e) { threw = e; }
      const randomCalls = rnd.mock.calls.length;
      expect(randomCalls).toBe(0);
      expect((threw as Error)?.message).toBe('secure_random_unavailable');
    } finally {
      if (realCrypto) Object.defineProperty(globalThis, 'crypto', realCrypto); else delete g.crypto;
      delete g.expo;
      rnd.mockRestore();
    }
  });

  test('a thrown network error is a retryable failure, an empty success is never reported as recorded', async () => {
    mockRpc.mockRejectedValueOnce(new Error('Network request failed'));
    expect(await submitPrivacyRequest('export', 'k')).toEqual({ kind: 'failed', retryable: true });
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await submitPrivacyRequest('export', 'k')).toEqual({ kind: 'failed', retryable: true });
  });

  test('loads only the safe columns, newest first, and returns null when unreadable', async () => {
    const rows = [{ id: 'a', request_type: 'export', status: 'requested', created_at: '2026-10-24T00:00:00Z', completed_at: null }];
    mockLimit.mockResolvedValueOnce({ data: rows, error: null });
    expect(await loadMyPrivacyRequests()).toEqual(rows);
    expect(mockFrom).toHaveBeenCalledWith('privacy_requests');
    expect(mockSelect).toHaveBeenCalledWith('id,request_type,status,created_at,completed_at');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    mockLimit.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    expect(await loadMyPrivacyRequests()).toBeNull();
    mockLimit.mockRejectedValueOnce(new Error('offline'));
    expect(await loadMyPrivacyRequests()).toBeNull();
  });

  test('open = requested or in_progress only', () => {
    expect(isOpenPrivacyRequest({ status: 'requested' })).toBe(true);
    expect(isOpenPrivacyRequest({ status: 'in_progress' })).toBe(true);
    for (const s of ['completed', 'failed', 'cancelled'] as const) expect(isOpenPrivacyRequest({ status: s })).toBe(false);
  });

  test('status copy never claims work that no worker does', () => {
    expect(privacyStatusLabel('requested')).toMatch(/not processed yet/i);
    for (const s of ['requested', 'in_progress', 'failed', 'cancelled'] as const) {
      expect(privacyStatusLabel(s)).not.toMatch(/deleted|exported|removed|purged/i);
    }
    expect(privacyRequestTypeLabel('export')).toBe('Data export');
    expect(privacyRequestTypeLabel('deletion')).toBe('Account deletion');
  });
});
