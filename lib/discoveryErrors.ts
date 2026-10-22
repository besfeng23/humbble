/**
 * Maps raw RPC error codes/messages raised by discovery and swipe functions to
 * user-facing copy. Raw database identifiers must never be rendered in the UI.
 */
export type DiscoveryErrorAction = 'verify' | 'retry' | 'none';
export type FriendlyDiscoveryError = { key: string; title: string; message: string; action: DiscoveryErrorAction };

const KNOWN: Record<string, Omit<FriendlyDiscoveryError, 'key'>> = {
  actor_not_eligible: {
    title: 'Finish verification to see people',
    message: 'People becomes available once your profile is verified and complete (two photos and all three prompts). It only takes a few minutes.',
    action: 'verify',
  },
  authentication_required: { title: 'Please sign in again', message: 'Your session has ended. Sign in again to keep discovering.', action: 'none' },
  invalid_discovery_cursor: { title: 'Discovery refreshed', message: 'Your list was out of date, so we refreshed it.', action: 'retry' },
  target_not_eligible: { title: 'Profile no longer available', message: 'This person is no longer available in discovery.', action: 'retry' },
  blocked_pair: { title: 'Profile unavailable', message: 'You can no longer interact with this profile.', action: 'retry' },
  duplicate_swipe_direction_mismatch: { title: 'Already decided', message: 'You already made a decision on this profile.', action: 'retry' },
  quota_exceeded: { title: 'You’re out of likes for today', message: 'Your daily free like limit has been reached.', action: 'none' },
  target_and_direction_required: { title: 'Something went wrong', message: 'That action could not be saved. Please try again.', action: 'retry' },
};

const GENERIC: FriendlyDiscoveryError = { key: 'unknown', title: 'Discovery could not load', message: 'We could not load discovery. Try again.', action: 'retry' };

export function toFriendlyDiscoveryError(raw: unknown): FriendlyDiscoveryError {
  const text = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : '';
  for (const key of Object.keys(KNOWN)) {
    if (new RegExp(`\\b${key}\\b`, 'i').test(text)) return { key, ...KNOWN[key] };
  }
  if (/self-swipes/i.test(text)) return { key: 'self_swipe', title: 'Something went wrong', message: 'That action could not be saved.', action: 'retry' };
  return GENERIC;
}
