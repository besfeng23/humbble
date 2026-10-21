import AsyncStorage from '@react-native-async-storage/async-storage';

const mockSubmitReport = jest.fn();
const mockBlockUser = jest.fn();
const mockUnblockUser = jest.fn();
const mockUnmatchUser = jest.fn();
const mockListBlockedUsers = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/lib/rpc', () => ({
  blockUser: (...args: unknown[]) => mockBlockUser(...args),
  unblockUser: (...args: unknown[]) => mockUnblockUser(...args),
  unmatchUser: (...args: unknown[]) => mockUnmatchUser(...args),
  listBlockedUsers: (...args: unknown[]) => mockListBlockedUsers(...args),
  submitReport: (...args: unknown[]) => mockSubmitReport(...args),
}));

import { getQueuedSafetyReportCount, retryQueuedSafetyReports, submitSafetyReport } from '@/lib/safety';

describe('safety report outbox', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  test('queues an offline report and retries using the same idempotency key', async () => {
    mockSubmitReport
      .mockResolvedValueOnce({ data: null, error: { code: '', message: 'Network request failed' } })
      .mockResolvedValueOnce({ data: 'server-report-1', error: null });

    const result = await submitSafetyReport({
      reportedUserId: 'target-1',
      category: 'scam_money_request',
      contextSummary: 'Asked for a money transfer',
    });
    expect(result.status).toBe('queued');
    expect(await getQueuedSafetyReportCount()).toBe(1);
    expect(mockSubmitReport).toHaveBeenNthCalledWith(1, expect.objectContaining({
      reportedUserId: 'target-1', category: 'scam', clientReportId: result.clientReportId,
    }));

    await expect(retryQueuedSafetyReports()).resolves.toEqual({ sent: 1, remaining: 0, dropped: 0 });
    expect(mockSubmitReport).toHaveBeenNthCalledWith(2, expect.objectContaining({ clientReportId: result.clientReportId }));
    expect(await getQueuedSafetyReportCount()).toBe(0);
  });

  test('repeated queueing with one client_report_id does not duplicate the local outbox row', async () => {
    mockSubmitReport.mockResolvedValue({ data: null, error: { code: '', message: 'Failed to fetch' } });
    const input = { reportedUserId: 'target-2', category: 'fake_profile' as const, clientReportId: 'stable-report-key' };
    await submitSafetyReport(input);
    await submitSafetyReport(input);
    expect(await getQueuedSafetyReportCount()).toBe(1);
  });

  test('rejects overlong notes before sending or queueing', async () => {
    await expect(submitSafetyReport({ reportedUserId: 'target-3', category: 'other', contextSummary: 'x'.repeat(501) }))
      .rejects.toThrow('500 characters or fewer');
    expect(mockSubmitReport).not.toHaveBeenCalled();
    expect(await getQueuedSafetyReportCount()).toBe(0);
  });
});

describe('report categories and server rejections', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  test('UI categories map to real database categories', () => {
    const { DATABASE_CATEGORY, REPORT_CATEGORIES } = jest.requireActual('@/lib/safety');
    expect(DATABASE_CATEGORY.explicit_content).toBe('explicit_content');
    expect(DATABASE_CATEGORY.fake_profile).toBe('fake_profile');
    expect(REPORT_CATEGORIES.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining(['explicit_content', 'fake_profile']));
  });

  test('explicit_content and fake_profile reports are sent with their own category', async () => {
    mockSubmitReport.mockResolvedValue({ data: 'id', error: null });
    await submitSafetyReport({ reportedUserId: 't', category: 'explicit_content' });
    await submitSafetyReport({ reportedUserId: 't', category: 'fake_profile' });
    expect(mockSubmitReport.mock.calls.map(call => call[0].category)).toEqual(['explicit_content', 'fake_profile']);
  });

  test('queued reports rejected with a 4xx/validation error are dropped; transient errors stay', async () => {
    mockSubmitReport.mockResolvedValue({ data: null, error: { code: '', message: 'Network request failed' } });
    await submitSafetyReport({ reportedUserId: 'gone', category: 'other', clientReportId: 'k1' });
    await submitSafetyReport({ reportedUserId: 'bad', category: 'other', clientReportId: 'k2' });
    await submitSafetyReport({ reportedUserId: 'later', category: 'other', clientReportId: 'k3' });
    await submitSafetyReport({ reportedUserId: 'limit', category: 'other', clientReportId: 'k4' });
    expect(await getQueuedSafetyReportCount()).toBe(4);

    mockSubmitReport.mockReset();
    mockSubmitReport
      .mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'reported_user_not_found' } })
      .mockResolvedValueOnce({ data: null, error: { status: 400, message: 'Bad Request' } })
      .mockResolvedValueOnce({ data: null, error: { status: 503, message: 'Service Unavailable' } })
      .mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'report_rate_limited' } });
    await expect(retryQueuedSafetyReports()).resolves.toEqual({ sent: 0, remaining: 2, dropped: 2 });
    expect(await getQueuedSafetyReportCount()).toBe(2);
  });

  test('isPermanentRejection classifies errors', () => {
    const { isPermanentRejection } = jest.requireActual('@/lib/safety');
    expect(isPermanentRejection({ code: '23514', message: 'self_report_not_allowed' })).toBe(true);
    expect(isPermanentRejection({ status: 422, message: 'invalid' })).toBe(true);
    expect(isPermanentRejection({ status: 401, message: 'JWT expired' })).toBe(false);
    expect(isPermanentRejection({ status: 429, message: 'Too many' })).toBe(false);
    expect(isPermanentRejection({ code: '42501', message: 'authentication_required' })).toBe(false);
    expect(isPermanentRejection({ message: 'Failed to fetch' })).toBe(false);
  });

  test('describeRetryResult is quiet unless something was dropped', () => {
    const { describeRetryResult } = jest.requireActual('@/lib/safety');
    expect(describeRetryResult({ sent: 2, remaining: 0, dropped: 0 })).toBeNull();
    expect(describeRetryResult({ sent: 0, remaining: 0, dropped: 1 })).toBe('A saved report could not be sent and was removed.');
  });
});
