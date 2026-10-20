/**
 * Typed wrappers for the reviewed P2-05 PostgreSQL RPC boundary.
 * Actor identity is intentionally never accepted from callers; the database
 * derives it from the authenticated Supabase session. Database grants/RLS and
 * RPC validation remain authoritative.
 */
import { supabase } from './supabase';
import type {
  Database,
  ModerationCaseStatus,
  PrivacyRequestType,
  ReportCategory,
  SwipeDirection,
} from './database.types';

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
}): Promise<RpcResult<string>> {
  return typedResult<string>(
    supabase.rpc('submit_report', {
      p_reported_user_id: input.reportedUserId,
      p_category: input.category,
      p_context_summary: input.contextSummary ?? null,
    }),
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
