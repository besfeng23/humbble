import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReportCategory } from '@/lib/database.contracts';
import { blockUser, listBlockedUsers, submitReport, unblockUser, unmatchUser } from '@/lib/rpc';

const REPORT_QUEUE_KEY = 'humbble:safety:pending-reports:v1';
export const MAX_REPORT_NOTE_LENGTH = 500;

export type SafetyReportCategory =
  | 'fake_profile'
  | 'scam_money_request'
  | 'harassment'
  | 'underage'
  | 'explicit_content'
  | 'other';

/** Report reasons shown in the Safety picker, in display order. */
export const REPORT_CATEGORIES: { id: SafetyReportCategory; label: string }[] = [
  { id: 'fake_profile', label: 'Fake profile' },
  { id: 'scam_money_request', label: 'Scam or money request' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'underage', label: 'Underage' },
  { id: 'explicit_content', label: 'Explicit content' },
  { id: 'other', label: 'Something else' },
];

export type PendingSafetyReport = {
  clientReportId: string;
  reportedUserId: string;
  category: SafetyReportCategory;
  contextSummary: string | null;
  queuedAt: string;
};

export type SafetyReportSubmitResult = {
  status: 'submitted' | 'queued';
  clientReportId: string;
};

export const DATABASE_CATEGORY: Record<SafetyReportCategory, ReportCategory> = {
  fake_profile: 'fake_profile',
  scam_money_request: 'scam',
  harassment: 'harassment',
  underage: 'underage',
  explicit_content: 'explicit_content',
  other: 'other',
};

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function isConnectionFailure(error: { message?: string; code?: string } | Error | null | undefined): boolean {
  const message = String(error?.message ?? '').toLowerCase();
  const code = String((error as { code?: string } | undefined)?.code ?? '').toLowerCase();
  return ['fetch_error', 'network_error', 'network request failed', 'failed to fetch', 'fetch failed', 'timeout', 'timed out', 'econnreset', 'enotfound', 'offline', 'socket'].some(value =>
    code.includes(value) || message.includes(value),
  );
}

type RpcErrorLike = { message?: string; code?: string; status?: number } | Error | null | undefined;

// Transient server answers stay queued: auth (session refresh), rate limit, timeouts.
const RETRYABLE_SERVER_MESSAGES = ['authentication_required', 'report_rate_limited', 'jwt expired'];

/**
 * True when the server definitively rejected the report (HTTP 4xx or a SQL
 * validation error). Such a report can never succeed, so it leaves the outbox.
 */
export function isPermanentRejection(error: RpcErrorLike): boolean {
  if (!error || isConnectionFailure(error)) return false;
  const message = String(error.message ?? '').toLowerCase();
  if (RETRYABLE_SERVER_MESSAGES.some(value => message.includes(value))) return false;
  const status = Number((error as { status?: number }).status);
  if (Number.isFinite(status) && status > 0) {
    return status >= 400 && status < 500 && ![401, 408, 429].includes(status);
  }
  const code = String((error as { code?: string }).code ?? '').toUpperCase();
  // SQLSTATE 22xxx data exception, 23xxx integrity violation, PGRST1xx/2xx request errors.
  return /^(22|23)[0-9A-Z]{3}$/.test(code) || /^PGRST[12]\d\d$/.test(code);
}

async function readQueue(): Promise<PendingSafetyReport[]> {
  try {
    const raw = await AsyncStorage.getItem(REPORT_QUEUE_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is PendingSafetyReport => Boolean(
      item && typeof item === 'object' &&
      typeof (item as PendingSafetyReport).clientReportId === 'string' &&
      typeof (item as PendingSafetyReport).reportedUserId === 'string' &&
      typeof (item as PendingSafetyReport).category === 'string',
    ));
  } catch {
    return [];
  }
}

async function writeQueue(items: PendingSafetyReport[]): Promise<void> {
  await AsyncStorage.setItem(REPORT_QUEUE_KEY, JSON.stringify(items));
}

function rpcErrorMessage(error: { message?: string } | null): string {
  return error?.message || 'Safety request could not be completed.';
}

export async function blockPerson(targetId: string): Promise<void> {
  const { error } = await blockUser(targetId);
  if (error) throw new Error(rpcErrorMessage(error));
}

export async function unblockPerson(targetId: string): Promise<boolean> {
  const { data, error } = await unblockUser(targetId);
  if (error) throw new Error(rpcErrorMessage(error));
  return Boolean(data);
}

export async function unmatchPerson(targetId: string): Promise<boolean> {
  const { data, error } = await unmatchUser(targetId);
  if (error) throw new Error(rpcErrorMessage(error));
  return Boolean(data);
}

export async function getBlockedPeople() {
  const { data, error } = await listBlockedUsers();
  if (error) throw new Error(rpcErrorMessage(error));
  return data ?? [];
}

export async function submitSafetyReport(input: {
  reportedUserId: string;
  category: SafetyReportCategory;
  contextSummary?: string | null;
  clientReportId?: string;
}): Promise<SafetyReportSubmitResult> {
  const note = String(input.contextSummary ?? '').trim();
  if (!input.reportedUserId) throw new Error('Choose a profile before submitting a report.');
  if (note.length > MAX_REPORT_NOTE_LENGTH) throw new Error(`Notes must be ${MAX_REPORT_NOTE_LENGTH} characters or fewer.`);

  const pending: PendingSafetyReport = {
    clientReportId: input.clientReportId ?? uuid(),
    reportedUserId: input.reportedUserId,
    category: input.category,
    contextSummary: note || null,
    queuedAt: new Date().toISOString(),
  };
  try {
    const { error } = await submitReport({
      reportedUserId: pending.reportedUserId,
      category: DATABASE_CATEGORY[pending.category],
      contextSummary: pending.contextSummary,
      clientReportId: pending.clientReportId,
    });
    if (!error) return { status: 'submitted', clientReportId: pending.clientReportId };
    if (!isConnectionFailure(error)) throw new Error(rpcErrorMessage(error));
  } catch (error) {
    if (!isConnectionFailure(error instanceof Error ? error : undefined)) throw error;
  }

  const queue = await readQueue();
  const alreadyQueued = queue.some(item => item.clientReportId === pending.clientReportId);
  if (!alreadyQueued) queue.push(pending);
  await writeQueue(queue);
  return { status: 'queued', clientReportId: pending.clientReportId };
}

export type SafetyReportRetryResult = { sent: number; remaining: number; dropped: number };

let retryInFlight: Promise<SafetyReportRetryResult> | null = null;

/**
 * Retry with the same idempotency key; a timed-out server commit remains safe.
 * Reports the server rejects permanently (4xx/validation) are dropped.
 */
export function retryQueuedSafetyReports(): Promise<SafetyReportRetryResult> {
  // App foreground, reconnect and the Safety screen can all trigger a retry; share one run.
  if (!retryInFlight) {
    retryInFlight = runRetry().finally(() => { retryInFlight = null; });
  }
  return retryInFlight;
}

async function runRetry(): Promise<SafetyReportRetryResult> {
  const queue = await readQueue();
  if (!queue.length) return { sent: 0, remaining: 0, dropped: 0 };
  const remaining: PendingSafetyReport[] = [];
  let sent = 0;
  let dropped = 0;
  for (const pending of queue) {
    try {
      const { error } = await submitReport({
        reportedUserId: pending.reportedUserId,
        category: DATABASE_CATEGORY[pending.category] ?? 'other',
        contextSummary: pending.contextSummary,
        clientReportId: pending.clientReportId,
      });
      if (!error) sent += 1;
      else if (isPermanentRejection(error)) dropped += 1;
      else remaining.push(pending);
    } catch {
      remaining.push(pending);
    }
  }
  // Re-read so reports queued during this run are not lost.
  const handled = new Set(queue.map(item => item.clientReportId));
  const kept = new Set(remaining.map(item => item.clientReportId));
  const latest = await readQueue();
  await writeQueue(latest.filter(item => !handled.has(item.clientReportId) || kept.has(item.clientReportId)));
  return { sent, remaining: remaining.length + latest.filter(item => !handled.has(item.clientReportId)).length, dropped };
}

/** One quiet line for the app-wide notice, or null when nothing needs saying. */
export function describeRetryResult(result: SafetyReportRetryResult): string | null {
  if (result.dropped > 0) {
    return result.dropped === 1 ? 'A saved report could not be sent and was removed.' : `${result.dropped} saved reports could not be sent and were removed.`;
  }
  return null;
}

export async function getQueuedSafetyReportCount(): Promise<number> {
  return (await readQueue()).length;
}
