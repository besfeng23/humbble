import type { DiscoveryProfile, GetDiscoveryFeedArgs, RecordSwipeResult, SwipeDirection } from './database.contracts';
import { isSupabaseConfigured, supabase } from './supabase';

export const DISCOVERY_PAGE_SIZE = 20;
export const DISCOVERY_PHOTO_BUCKET = 'profile_photos';
export const DISCOVERY_SIGNED_URL_SECONDS = 15 * 60;

export type DiscoveryCard = DiscoveryProfile & {
  imageUrl: string | null;
  cursorCreatedAt: string;
};
export type DiscoveryPage = { items: DiscoveryCard[]; nextCursor: string | null };
export type SwipeOutcome = RecordSwipeResult;

export function appendUniqueProfiles(items: DiscoveryCard[], seenIds: Set<string>): DiscoveryCard[] {
  const unique: DiscoveryCard[] = [];
  for (const item of items) {
    if (seenIds.has(item.profile_id)) continue;
    seenIds.add(item.profile_id);
    unique.push(item);
  }
  return unique;
}

export class DiscoveryError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) { super(message); this.name = 'DiscoveryError'; this.code = code; }
}

function asError(error: { message?: string; code?: string } | null | undefined): DiscoveryError {
  return new DiscoveryError(error?.message || 'Discovery is temporarily unavailable.', error?.code);
}

/**
 * Reads the caller's own profile flags before calling get_discovery_feed. The
 * RPC rejects ineligible members with a 403, which browsers always log as a
 * console error, so we short-circuit to the same friendly 'actor_not_eligible'
 * state without the network round trip. Returns null when eligibility cannot
 * be determined locally; the server remains the source of truth.
 */
export async function checkOwnDiscoveryEligibility(): Promise<boolean | null> {
  try {
    const client = supabase as unknown as { auth?: { getSession?: () => Promise<{ data: { session: { user?: { id?: string } } | null } }> }; from?: typeof supabase.from };
    if (typeof client.auth?.getSession !== 'function' || typeof client.from !== 'function') return null;
    const { data: { session } } = await client.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return null;
    const { data, error } = await supabase.from('profiles')
      .select('verification_status, is_discoverable, is_suspended')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    // No profile row yet means onboarding is unfinished, so the member cannot be eligible.
    if (!data) return false;
    const row = data as { verification_status?: string | null; is_discoverable?: boolean | null; is_suspended?: boolean | null };
    return row.verification_status === 'verified' && row.is_discoverable === true && row.is_suspended !== true;
  } catch {
    return null;
  }
}

/** Production data path. Mock data is intentionally not accepted as a fallback. */
export async function getDiscoveryPage(cursor: string | null, limit = DISCOVERY_PAGE_SIZE): Promise<DiscoveryPage> {
  if (!isSupabaseConfigured) throw new DiscoveryError('Discovery is unavailable in this build.');
  if (!cursor && (await checkOwnDiscoveryEligibility()) === false) throw new DiscoveryError('actor_not_eligible', '42501');
  const args: GetDiscoveryFeedArgs = { p_limit: Math.max(1, Math.min(50, limit)), ...(cursor ? { p_cursor: cursor } : {}) };
  const { data, error } = await supabase.rpc('get_discovery_feed', args);
  if (error) throw asError(error);
  const rows = (data ?? []) as (DiscoveryProfile & { cursor_created_at: string })[];
  const items = await Promise.all(rows.map(async (row) => {
    let imageUrl: string | null = null;
    if (row.primary_photo_path) {
      const { data: signed, error: signError } = await supabase.storage
        .from(DISCOVERY_PHOTO_BUCKET)
        .createSignedUrl(row.primary_photo_path, DISCOVERY_SIGNED_URL_SECONDS);
      if (!signError) imageUrl = signed?.signedUrl ?? null;
    }
    return { ...row, imageUrl, cursorCreatedAt: row.cursor_created_at };
  }));
  const nextCursor = rows.length === args.p_limit ? rows[rows.length - 1]?.cursor_created_at ?? null : null;
  return { items, nextCursor };
}

export async function recordSwipe(targetId: string, direction: SwipeDirection): Promise<SwipeOutcome> {
  if (!isSupabaseConfigured) throw new DiscoveryError('Discovery is unavailable in this build.');
  const { data, error } = await supabase.rpc('record_swipe', {
    p_target_id: targetId,
    p_direction: direction,
  });
  if (error) throw asError(error);
  const result = data?.[0];
  if (!result) throw new DiscoveryError('The swipe was not confirmed by the server.');
  return result;
}

export async function saveDiscoveryAgePreferences(minAge: number, maxAge: number): Promise<void> {
  if (!isSupabaseConfigured) throw new DiscoveryError('Preferences are unavailable in this build.');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new DiscoveryError('Please sign in again.');
  const { error } = await supabase.from('user_preferences').upsert({
    user_id: user.id,
    min_age: minAge,
    max_age: maxAge,
  }, { onConflict: 'user_id' });
  if (error) throw asError(error);
}

export function isQuotaError(error: unknown): boolean {
  return error instanceof DiscoveryError && (error.code === 'P0001' || /quota_exceeded/i.test(error.message));
}
