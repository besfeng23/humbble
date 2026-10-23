/**
 * Typed wrappers for the reviewed P2-05 PostgreSQL RPC boundary.
 * Actor identity is intentionally never accepted from callers; the database
 * derives it from the authenticated Supabase session. Database grants/RLS and
 * RPC validation remain authoritative.
 */
import { supabase } from './supabase';
import type { Database } from './database.types';
import type { ModerationActionId } from './moderation';
import type {
  ModerationCaseStatus,
  PrivacyRequestType,
  ReportCategory,
  SwipeDirection,
} from './database.contracts';

export type RpcError = {
  message: string;
  code: string;
  details: string;
  hint: string;
};

export type RpcResult<T> = {
  data: T | null;
  error: RpcError | null;
};

export type DiscoveryProfile =
  Database['public']['Functions']['get_discovery_feed']['Returns'][number];
export type RecordSwipeResult =
  Database['public']['Functions']['record_swipe']['Returns'][number];

async function typedResult<T>(
  request: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<RpcResult<T>> {
  const { data, error } = await request;
  return {
    data: (data as T | null) ?? null,
    error: (error as RpcError | null) ?? null,
  };
}

export function getDiscoveryFeed(options?: {
  limit?: number;
  cursor?: string | null;
}): Promise<RpcResult<DiscoveryProfile[]>> {
  return typedResult<DiscoveryProfile[]>(
    supabase.rpc('get_discovery_feed', {
      p_limit: options?.limit ?? 20,
      p_cursor: options?.cursor ?? null,
    }),
  );
}

export function recordSwipe(
  targetId: string,
  direction: SwipeDirection,
): Promise<RpcResult<RecordSwipeResult[]>> {
  return typedResult<RecordSwipeResult[]>(
    supabase.rpc('record_swipe', {
      p_target_id: targetId,
      p_direction: direction,
    }),
  );
}

/** Cross-user probes return false for authenticated callers. */
export function hasActiveEntitlement(userId: string): Promise<RpcResult<boolean>> {
  return typedResult<boolean>(
    supabase.rpc('has_active_entitlement', { p_user_id: userId }),
  );
}

/** Returns the target UUID; repeated calls are idempotent. */
export function blockUser(targetId: string): Promise<RpcResult<string>> {
  return typedResult<string>(supabase.rpc('block_user', { p_target_id: targetId }));
}

/** Returns true only when this call removed the caller's block row. */
export function unblockUser(targetId: string): Promise<RpcResult<boolean>> {
  return typedResult<boolean>(
    supabase.rpc('unblock_user', { p_target_id: targetId }),
  );
}

export function submitReport(input: {
  reportedUserId: string;
  category: ReportCategory;
  contextSummary?: string | null;
  clientReportId?: string;
}): Promise<RpcResult<string>> {
  return typedResult<string>(
    supabase.rpc('submit_report', {
      p_reported_user_id: input.reportedUserId,
      p_category: input.category,
      p_context_summary: input.contextSummary ?? '',
      p_client_report_id: input.clientReportId,
    }),
  );
}

/** Ends an active match for both participants; never deletes the conversation. */
export function unmatchUser(targetId: string): Promise<RpcResult<boolean>> {
  return typedResult<boolean>(supabase.rpc('unmatch', { p_target_id: targetId }));
}

/** Returns only blocks placed by the current authenticated user. */
export function listBlockedUsers(): Promise<RpcResult<Database['public']['Functions']['list_blocked_users']['Returns']>> {
  return typedResult<Database['public']['Functions']['list_blocked_users']['Returns']>(
    supabase.rpc('list_blocked_users'),
  );
}

export function requestPrivacyAction(
  requestType: PrivacyRequestType,
  idempotencyKey: string,
): Promise<RpcResult<string>> {
  return typedResult<string>(
    supabase.rpc('request_privacy_action', {
      p_request_type: requestType,
      p_idempotency_key: idempotencyKey,
    }),
  );
}

export function moderationTransitionCase(input: {
  caseId: string;
  newStatus: ModerationCaseStatus;
  note?: string | null;
}): Promise<RpcResult<undefined>> {
  return typedResult<undefined>(
    supabase.rpc('moderation_transition_case', {
      p_case_id: input.caseId,
      p_new_status: input.newStatus,
      p_note: input.note ?? null,
    }),
  );
}

// ---- P5-01 moderation console (migration 20261024000130). Authorization is enforced by the database: each RPC requires a
// trusted app_metadata moderator claim and rejects everyone else with `moderator_required`. These wrappers never accept an actor id.
export type ModerationQueueRow =
  Database['public']['Functions']['moderation_list_queue']['Returns'][number];
export type ModerationCaseDetailRow =
  Database['public']['Functions']['moderation_get_case']['Returns'][number];
export type ModerationActionResult =
  Database['public']['Functions']['moderation_take_action']['Returns'][number];

export function moderationListQueue(options?: {
  filter?: string;
  limit?: number;
  offset?: number;
}): Promise<RpcResult<ModerationQueueRow[]>> {
  return typedResult<ModerationQueueRow[]>(
    supabase.rpc('moderation_list_queue', {
      p_filter: options?.filter ?? 'active',
      p_limit: options?.limit ?? 50,
      p_offset: options?.offset ?? 0,
    }),
  );
}

/** Reading a case is itself recorded in audit_events (who looked at which report, when). */
export function moderationGetCase(
  reportId: string,
): Promise<RpcResult<ModerationCaseDetailRow[]>> {
  return typedResult<ModerationCaseDetailRow[]>(
    supabase.rpc('moderation_get_case', { p_report_id: reportId }),
  );
}

/** Idempotent: returns the existing case id when the report already has a case. */
export function moderationOpenCase(input: {
  reportId: string;
  reason: string;
}): Promise<RpcResult<string>> {
  return typedResult<string>(
    supabase.rpc('moderation_open_case', {
      p_report_id: input.reportId,
      p_reason: input.reason,
    }),
  );
}

export function moderationTakeAction(input: {
  caseId: string;
  action: ModerationActionId;
  reason: string;
}): Promise<RpcResult<ModerationActionResult[]>> {
  return typedResult<ModerationActionResult[]>(
    supabase.rpc('moderation_take_action', {
      p_case_id: input.caseId,
      p_action: input.action,
      p_reason: input.reason,
    }),
  );
}
