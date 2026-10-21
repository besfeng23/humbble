import { AppState, Platform, type AppStateStatus } from 'react-native';
import { describeRetryResult, getQueuedSafetyReportCount, retryQueuedSafetyReports } from '@/lib/safety';

/** While reports wait offline, poll this often so a reconnect is noticed without NetInfo. */
export const SAFETY_RETRY_POLL_MS = 60_000;

/**
 * App-wide offline report retry: once on start, whenever the app returns to the
 * foreground, on a browser `online` event, and on a slow poll while anything is
 * still queued. `onNotice` receives a quiet one-line notice (dropped reports only).
 */
export function startSafetyReportRetry(onNotice: (message: string) => void): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (remaining: number) => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!stopped && remaining > 0) timer = setTimeout(() => void run(), SAFETY_RETRY_POLL_MS);
  };

  const run = async () => {
    if (stopped) return;
    try {
      if ((await getQueuedSafetyReportCount()) === 0) { schedule(0); return; }
      const result = await retryQueuedSafetyReports();
      if (stopped) return;
      const notice = describeRetryResult(result);
      if (notice) onNotice(notice);
      schedule(result.remaining);
    } catch {
      schedule(1);
    }
  };

  const appState = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') void run();
  });
  const onlineTarget = Platform.OS === 'web' && typeof window !== 'undefined' ? window : null;
  const onOnline = () => void run();
  onlineTarget?.addEventListener?.('online', onOnline);
  void run();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    appState.remove();
    onlineTarget?.removeEventListener?.('online', onOnline);
  };
}
