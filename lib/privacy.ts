/**
 * Client side of the privacy (export / deletion) request flow (launch blocker LB-1).
 *
 * Honesty contract: `request_privacy_action` only RECORDS a request in
 * `public.privacy_requests`. Until the erasure/export worker exists nothing is exported or
 * deleted automatically, so every string produced here says "recorded" / "received", never
 * "deleted" or "exported". Remove that restriction only when the worker ships (see
 * docs/operations/launch-blockers.md LB-1).
 */
import { secureRandomUuid } from './secureUuid';
import { requestPrivacyAction, type RpcError } from './rpc';
import { supabase } from './supabase';
import type { PrivacyRequestType } from './database.contracts';

export type PrivacyRequestStatus = 'requested' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export type PrivacyRequestRow = {
  id: string;
  request_type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  created_at: string;
  completed_at: string | null;
};

export type SubmitPrivacyOutcome =
  | { kind: 'recorded'; requestId: string }
  | { kind: 'already_open' }
  | { kind: 'sign_in_required' }
  | { kind: 'profile_missing' }
  | { kind: 'failed'; retryable: boolean };

/**
 * Opaque, cryptographically random per-attempt key (v4 UUID from the platform CSPRNG; never Math.random, never the quiz session id).
 * Reuse it for a retry of the SAME attempt so a timed-out commit cannot create a duplicate.
 * Throws SecureRandomUnavailableError when the runtime has no CSPRNG: the caller must fail the request closed.
 */
export function newPrivacyIdempotencyKey(): string {
  return secureRandomUuid();
}

/** Maps the RPC error to a member-facing outcome. Never exposes database wording. */
export function classifyPrivacyError(error: RpcError | null | undefined): SubmitPrivacyOutcome {
  const code = error?.code ?? '';
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`;
  if (/privacy_request_already_open/.test(text)) return { kind: 'already_open' };
  if (code === '42501' || /authentication_required|JWT|not authenticated/i.test(text)) return { kind: 'sign_in_required' };
  // 23503 = foreign key violation: the member has an auth user but no `profiles` row yet, so a request can never be recorded
  // until the profile exists. Not a connectivity problem and retrying cannot help.
  if (code === '23503' || /violates foreign key constraint/i.test(text)) return { kind: 'profile_missing' };
  // 22023 = a client bug (missing argument): retrying the same call cannot succeed.
  if (code === '22023') return { kind: 'failed', retryable: false };
  return { kind: 'failed', retryable: true };
}

export async function submitPrivacyRequest(
  requestType: PrivacyRequestType,
  idempotencyKey: string,
): Promise<SubmitPrivacyOutcome> {
  try {
    const { data, error } = await requestPrivacyAction(requestType, idempotencyKey);
    if (error) return classifyPrivacyError(error);
    if (typeof data !== 'string' || data.length === 0) return { kind: 'failed', retryable: true };
    return { kind: 'recorded', requestId: data };
  } catch {
    // Network failure: the commit may or may not have happened; the caller retries with the same key.
    return { kind: 'failed', retryable: true };
  }
}

/** The member's own requests, newest first (RLS limits rows to the caller). Returns null when they cannot be read. */
export async function loadMyPrivacyRequests(limit = 10): Promise<PrivacyRequestRow[] | null> {
  try {
    const { data, error } = await supabase
      .from('privacy_requests')
      .select('id,request_type,status,created_at,completed_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return null;
    return data as PrivacyRequestRow[];
  } catch {
    return null;
  }
}

export function isOpenPrivacyRequest(row: Pick<PrivacyRequestRow, 'status'>): boolean {
  return row.status === 'requested' || row.status === 'in_progress';
}

export function privacyRequestTypeLabel(type: PrivacyRequestType): string {
  return type === 'export' ? 'Data export' : 'Account deletion';
}

/** Plain, truthful status text. "requested" must never read as "being processed" while no worker exists. */
export function privacyStatusLabel(status: PrivacyRequestStatus): string {
  switch (status) {
    case 'requested':
      return 'Received - not processed yet';
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Could not be completed - contact support';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Unknown';
  }
}
