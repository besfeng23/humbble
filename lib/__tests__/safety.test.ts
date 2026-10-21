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

    await expect(retryQueuedSafetyReports()).resolves.toEqual({ sent: 1, remaining: 0 });
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
