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

const DATABASE_CATEGORY: Record<SafetyReportCategory, ReportCategory> = {
  fake_profile: 'impersonation',
  scam_money_request: 'scam',
  harassment: 'harassment',
  underage: 'underage',
  // The current schema has a broad safety category for explicit-content reports.
  explicit_content: 'safety',
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

/** Retry with the same idempotency key; a timed-out server commit remains safe. */
export async function retryQueuedSafetyReports(): Promise<{ sent: number; remaining: number }> {
  const queue = await readQueue();
  if (!queue.length) return { sent: 0, remaining: 0 };
  const remaining: PendingSafetyReport[] = [];
  let sent = 0;
  for (const pending of queue) {
    try {
      const { error } = await submitReport({
        reportedUserId: pending.reportedUserId,
        category: DATABASE_CATEGORY[pending.category],
        contextSummary: pending.contextSummary,
        clientReportId: pending.clientReportId,
      });
      if (error) {
        remaining.push(pending);
      } else {
        sent += 1;
      }
    } catch {
      remaining.push(pending);
    }
  }
  await writeQueue(remaining);
  return { sent, remaining: remaining.length };
}

export async function getQueuedSafetyReportCount(): Promise<number> {
  return (await readQueue()).length;
}
