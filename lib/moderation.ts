/**
 * P5-01 Trust & Safety console: view-model helpers (pure, no network). The database is the authority for who may do what; these helpers only
 * decide which controls to *offer* and how to phrase them.
 */
import { toFriendlyMessage } from './friendlyErrors';
import type { ModerationCaseDetailRow, ModerationQueueRow } from './rpc';

export type ModerationFilterId =
  | 'active'
  | 'unopened'
  | 'in_review'
  | 'resolved'
  | 'closed'
  | 'all';

export const MODERATION_FILTERS: readonly { id: ModerationFilterId; label: string }[] = [
  { id: 'active', label: 'Needs attention' },
  { id: 'unopened', label: 'New reports' },
  { id: 'in_review', label: 'In review' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
];

export const MODERATION_PAGE_SIZE = 25;
export const MIN_REASON_LENGTH = 8;
export const MAX_REASON_LENGTH = 2000;

export type ModerationActionId =
  | 'start_review'
  | 'warn'
  | 'suspend'
  | 'dismiss'
  | 'lift_suspension'
  | 'close';

export interface ModerationActionSpec {
  id: ModerationActionId;
  label: string;
  variant: 'primary' | 'secondary' | 'danger' | 'charcoal';
  /** Destructive/consequential actions need a second explicit confirmation. */
  confirm?: string;
  successTitle: string;
}

const ACTIONS: Record<ModerationActionId, ModerationActionSpec> = {
  start_review: { id: 'start_review', label: 'Start review', variant: 'primary', successTitle: 'Review started' },
  warn: {
    id: 'warn',
    label: 'Record warning',
    variant: 'primary',
    confirm: 'Records a warning decision and resolves the case. The member is not notified automatically.',
    successTitle: 'Warning recorded',
  },
  suspend: {
    id: 'suspend',
    label: 'Suspend account',
    variant: 'danger',
    confirm:
      'Suspends the reported member: they leave discovery and cannot swipe or be matched. Existing conversations are not closed automatically.',
    successTitle: 'Account suspended',
  },
  dismiss: {
    id: 'dismiss',
    label: 'Dismiss report',
    variant: 'secondary',
    confirm: 'Closes the case with no action against the member.',
    successTitle: 'Report dismissed',
  },
  lift_suspension: {
    id: 'lift_suspension',
    label: 'Lift suspension',
    variant: 'charcoal',
    confirm: 'Restores the member’s access and closes the case.',
    successTitle: 'Suspension lifted',
  },
  close: { id: 'close', label: 'Close case', variant: 'secondary', successTitle: 'Case closed' },
};

export function actionSpec(id: ModerationActionId): ModerationActionSpec {
  return ACTIONS[id];
}

/** Actions offered for a case in its current state (mirrors moderation_take_action; the database re-validates every transition). */
export function availableActions(detail: Pick<ModerationCaseDetailRow, 'case_id' | 'case_status' | 'reported_is_suspended'>): ModerationActionSpec[] {
  if (!detail.case_id) return [];
  switch (detail.case_status) {
    case 'open':
      return [ACTIONS.start_review];
    case 'in_review':
      return [ACTIONS.suspend, ACTIONS.warn, ACTIONS.dismiss];
    case 'appealed':
      return [ACTIONS.start_review, ...(detail.reported_is_suspended ? [ACTIONS.lift_suspension] : []), ACTIONS.close];
    case 'resolved':
      return [...(detail.reported_is_suspended ? [ACTIONS.lift_suspension] : []), ACTIONS.close];
    default:
      return [];
  }
}

export function validateReason(raw: string): string | null {
  const reason = raw.trim();
  if (reason.length < MIN_REASON_LENGTH) {
    return `Add a reason of at least ${MIN_REASON_LENGTH} characters. It is saved in the audit log.`;
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return `Keep the reason under ${MAX_REASON_LENGTH} characters.`;
  }
  return null;
}

const CATEGORY_LABELS: Record<string, string> = {
  safety: 'Safety concern',
  harassment: 'Harassment',
  scam: 'Scam or money request',
  underage: 'Possible underage member',
  impersonation: 'Impersonation',
  explicit_content: 'Explicit content',
  fake_profile: 'Fake profile',
  other: 'Something else',
};
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? 'Other';
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_review: 'In review',
  resolved: 'Resolved',
  appealed: 'Appealed',
  closed: 'Closed',
};
/** Human label for a case (or, when no case exists yet, the report) state. */
export function statusLabel(caseStatus: string | null | undefined): string {
  if (!caseStatus) return 'New report';
  return STATUS_LABELS[caseStatus] ?? 'Unknown';
}

export function severityLabel(severity: string): string {
  switch (severity) {
    case 'urgent':
      return 'Urgent';
    case 'high':
      return 'High';
    case 'low':
      return 'Low';
    default:
      return 'Standard';
  }
}

/** Triage targets are internal pilot hypotheses (see legal/drafts/moderation-and-sla.md): urgent 4h, everything else 24h. */
export function triageTargetHours(severity: string): number {
  return severity === 'urgent' ? 4 : 24;
}

export function ageLabel(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 'unknown age';
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Remaining time against the triage target while the report has not been picked up; null once it has. */
export function triageClock(row: Pick<ModerationQueueRow, 'severity' | 'case_status' | 'reported_at'>, now: number = Date.now()): string | null {
  if (row.case_status && row.case_status !== 'open') return null;
  const dueAt = new Date(row.reported_at).getTime() + triageTargetHours(row.severity) * 3600_000;
  const remaining = dueAt - now;
  if (!Number.isFinite(remaining)) return null;
  const hours = Math.floor(Math.abs(remaining) / 3600_000);
  const minutes = Math.floor((Math.abs(remaining) % 3600_000) / 60000);
  const span = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return remaining < 0 ? `Triage overdue by ${span}` : `Triage due in ${span}`;
}

/** True when the failure means "you are not a moderator" (SQLSTATE 42501 / moderator_required / authentication_required). */
export function isForbiddenError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const text = `${error.message ?? ''} ${error.code ?? ''}`;
  return /moderator_required|authentication_required|\b42501\b/i.test(text);
}

const GENERIC_MODERATION_ERROR = 'Something went wrong. Please try again.';

/** Known database error codes become friendly copy; anything unrecognised (raw Postgres/PostgREST text) collapses to a generic message. */
export function moderationErrorMessage(error: unknown): string {
  const raw = error && typeof error === 'object' ? String((error as { message?: unknown }).message ?? '') : String(error ?? '');
  const friendly = toFriendlyMessage(error, GENERIC_MODERATION_ERROR);
  return friendly === raw ? GENERIC_MODERATION_ERROR : friendly;
}

export interface AuditHistoryEntry {
  at: string;
  action: string;
  actorId: string | null;
  summary: string;
  reason: string | null;
}

const ACTION_VERBS: Record<string, string> = {
  start_review: 'started review',
  warn: 'recorded a warning',
  suspend: 'suspended the account',
  dismiss: 'dismissed the report',
  lift_suspension: 'lifted the suspension',
  close: 'closed the case',
};

/** Turns the audit_events JSON returned by moderation_get_case into display rows. */
export function parseHistory(history: unknown): AuditHistoryEntry[] {
  if (!Array.isArray(history)) return [];
  const out: AuditHistoryEntry[] = [];
  for (const raw of history) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as { at?: unknown; action?: unknown; actor_id?: unknown; metadata?: unknown };
    const action = typeof item.action === 'string' ? item.action : '';
    const metadata = (item.metadata && typeof item.metadata === 'object' ? item.metadata : {}) as Record<string, unknown>;
    const reason = typeof metadata.reason === 'string' ? metadata.reason : typeof metadata.note === 'string' ? metadata.note : null;
    let summary: string | null = null;
    if (action === 'moderation.action') {
      summary = `Moderator ${ACTION_VERBS[String(metadata.action)] ?? 'took an action'}`;
    } else if (action === 'moderation.case_opened') {
      summary = 'Moderator opened the case';
    } else if (action === 'report.submitted') {
      summary = 'Report submitted';
    } else if (action === 'moderation.case_transition') {
      summary = `Status changed: ${String(metadata.from ?? '?').replace('_', ' ')} → ${String(metadata.to ?? '?').replace('_', ' ')}`;
    } else {
      summary = 'Recorded event';
    }
    out.push({
      at: typeof item.at === 'string' ? item.at : '',
      action,
      actorId: typeof item.actor_id === 'string' ? item.actor_id : null,
      summary,
      reason,
    });
  }
  return out;
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : 'unknown';
}
