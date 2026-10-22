/**
 * General friendly-error mapper. Raw backend identifiers (RPC exception codes,
 * Postgres/PostgREST codes, snake_case tokens) must never be rendered in the UI.
 * Discovery-specific copy lives in ./discoveryErrors and is reused here.
 */
import { toFriendlyDiscoveryError } from './discoveryErrors';

const MESSAGES: Record<string, string> = {
  target_not_found: 'We couldn’t find that profile. It may have been removed.',
  reported_user_not_found: 'We couldn’t find that profile. It may have been removed.',
  invalid_block_target: 'That profile can’t be blocked.',
  invalid_unblock_target: 'That profile is not on your blocked list.',
  invalid_unmatch_target: 'You are no longer matched with this person.',
  self_report_not_allowed: 'You can’t report your own profile.',
  report_rate_limited: 'You’ve sent several reports recently. Please wait a little before sending another.',
  report_context_too_long: 'Your note is too long. Please shorten it and try again.',
  reported_user_and_category_required: 'Choose a reason before sending your report.',
  client_report_id_conflict: 'This report was already sent.',
  conversation_not_sendable: 'You can’t send messages in this conversation anymore.',
  message_length_invalid: 'Messages must be between 1 and 2000 characters.',
  client_message_id_conflict: 'This message was already sent.',
  client_message_id_required: 'Your message could not be sent. Please try again.',
  premium_required: 'This feature is part of Humbble Reserve.',
  privacy_request_already_open: 'You already have an open privacy request. We’ll update you when it’s done.',
  profile_photo_path_must_be_user_scoped: 'That photo could not be saved. Please try again.',
  invalid_push_token: 'Notifications could not be enabled on this device.',
  moderator_required: 'You don’t have access to this page.',
  moderation_case_not_found: 'That case could not be found.',
  moderation_note_too_long: 'That note is too long.',
  invalid_moderation_transition: 'That status change isn’t allowed for this case.',
  invalid_final_status: 'That status change isn’t allowed for this case.',
  user_id_required: 'Please sign in again.',
  duplicate_swipe: 'You already made a decision on this profile.',
};

const DISCOVERY_KEYS = ['actor_not_eligible', 'authentication_required', 'invalid_discovery_cursor', 'target_not_eligible', 'blocked_pair', 'duplicate_swipe_direction_mismatch', 'quota_exceeded', 'target_and_direction_required'];

export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

function textOf(raw: unknown): string {
  if (raw instanceof Error) return raw.message;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && 'message' in raw) return String((raw as { message?: unknown }).message ?? '');
  return '';
}

/** True when text looks like an internal identifier rather than human copy. */
export function looksLikeRawCode(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^[A-Za-z0-9]+(_[A-Za-z0-9]+)+$/.test(t)) return true; // snake_case token
  if (/^(PGRST\d+|\d{5}|P\d{4}|[A-Z0-9]{5})$/.test(t)) return true; // Postgres / PostgREST codes
  if (/\b(violates|constraint|relation|column|function|syntax error|duplicate key|JWT|row-level security|PGRST)\b/i.test(t)) return true;
  return false;
}

/** Returns user-facing copy for any thrown error. Human-written messages pass through. */
export function toFriendlyMessage(raw: unknown, fallback: string = GENERIC_ERROR_MESSAGE): string {
  const text = textOf(raw);
  for (const key of Object.keys(MESSAGES)) {
    if (new RegExp(`\\b${key}\\b`, 'i').test(text)) return MESSAGES[key];
  }
  if (DISCOVERY_KEYS.some((key) => new RegExp(`\\b${key}\\b`, 'i').test(text))) return toFriendlyDiscoveryError(text).message;
  return looksLikeRawCode(text) ? fallback : text;
}
