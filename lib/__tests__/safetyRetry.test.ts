const mockRetry = jest.fn();
const mockCount = jest.fn();
const listeners: ((state: string) => void)[] = [];
const mockRemove = jest.fn();

jest.mock('@/lib/safety', () => ({
  retryQueuedSafetyReports: (...args: unknown[]) => mockRetry(...args),
  getQueuedSafetyReportCount: (...args: unknown[]) => mockCount(...args),
  describeRetryResult: jest.requireActual('@/lib/safety').describeRetryResult,
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: (_: string, cb: (state: string) => void) => { listeners.push(cb); return { remove: mockRemove }; } },
}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/lib/rpc', () => ({}));

import { SAFETY_RETRY_POLL_MS, startSafetyReportRetry } from '@/lib/safetyRetry';

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('app-wide safety report retry', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); listeners.length = 0; });
  afterEach(() => jest.useRealTimers());

  test('retries on start and when the app returns to the foreground', async () => {
    mockCount.mockResolvedValue(1);
    mockRetry.mockResolvedValue({ sent: 1, remaining: 0, dropped: 0 });
    const notice = jest.fn();
    const stop = startSafetyReportRetry(notice);
    await flush();
    expect(mockRetry).toHaveBeenCalledTimes(1);
    listeners[0]('background');
    await flush();
    expect(mockRetry).toHaveBeenCalledTimes(1);
    listeners[0]('active');
    await flush();
    expect(mockRetry).toHaveBeenCalledTimes(2);
    expect(notice).not.toHaveBeenCalled();
    stop();
    expect(mockRemove).toHaveBeenCalled();
  });

  test('does nothing when the outbox is empty', async () => {
    mockCount.mockResolvedValue(0);
    const stop = startSafetyReportRetry(jest.fn());
    await flush();
    expect(mockRetry).not.toHaveBeenCalled();
    stop();
  });

  test('polls while reports remain, so a reconnect is picked up', async () => {
    mockCount.mockResolvedValue(1);
    mockRetry.mockResolvedValueOnce({ sent: 0, remaining: 1, dropped: 0 }).mockResolvedValueOnce({ sent: 1, remaining: 0, dropped: 0 });
    const stop = startSafetyReportRetry(jest.fn());
    await flush();
    jest.advanceTimersByTime(SAFETY_RETRY_POLL_MS);
    await flush();
    expect(mockRetry).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(SAFETY_RETRY_POLL_MS * 2);
    await flush();
    expect(mockRetry).toHaveBeenCalledTimes(2);
    stop();
  });

  test('shows a quiet notice when the server drops a report', async () => {
    mockCount.mockResolvedValue(1);
    mockRetry.mockResolvedValue({ sent: 0, remaining: 0, dropped: 1 });
    const notice = jest.fn();
    const stop = startSafetyReportRetry(notice);
    await flush();
    expect(notice).toHaveBeenCalledWith('A saved report could not be sent and was removed.');
    stop();
  });
});
