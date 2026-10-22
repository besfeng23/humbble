import type { Json, VerificationState } from '@/lib/database.contracts';

export const MIN_PHOTOS = 2;
export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export type AcceptedPhotoMime = (typeof ACCEPTED_PHOTO_MIME)[number];

export type ProfilePrompt = { key: 'weekend' | 'values' | 'relationship_goal'; question: string; answer: string };
export type ProfilePromptAnswers = Record<ProfilePrompt['key'], string>;
export const PROFILE_PROMPTS: Omit<ProfilePrompt, 'answer'>[] = [
  { key: 'weekend', question: 'A perfect weekend looks like' },
  { key: 'values', question: 'What I value most in a partner' },
  { key: 'relationship_goal', question: 'The relationship I hope to build' },
];

/** Set requireSize=false only before fetching a picker asset; actual blob bytes are always checked before upload. */
export function validatePhoto(file: { type?: string | null; size?: number | null }, requireSize = true) {
  const mime = (file.type ?? '').toLowerCase();
  if (!ACCEPTED_PHOTO_MIME.includes(mime as AcceptedPhotoMime)) {
    return { valid: false, reason: 'Choose a JPEG, PNG, WebP, or HEIC photo.' } as const;
  }
  if (requireSize && (!Number.isFinite(file.size) || (file.size ?? 0) <= 0 || (file.size ?? Infinity) > MAX_PHOTO_BYTES)) {
    return { valid: false, reason: 'Each photo must be 5 MB or smaller.' } as const;
  }
  if (!requireSize && file.size != null && (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PHOTO_BYTES)) {
    return { valid: false, reason: 'Each photo must be 5 MB or smaller.' } as const;
  }
  return { valid: true } as const;
}

export function readProfilePromptAnswers(value: Json | null | undefined): ProfilePromptAnswers {
  const result: ProfilePromptAnswers = { weekend: '', values: '', relationship_goal: '' };
  if (!Array.isArray(value)) return result;
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as { key?: unknown; answer?: unknown };
    if ((record.key === 'weekend' || record.key === 'values' || record.key === 'relationship_goal') && typeof record.answer === 'string') {
      result[record.key] = record.answer;
    }
  }
  return result;
}

export function toProfilePrompts(answers: ProfilePromptAnswers): ProfilePrompt[] {
  return PROFILE_PROMPTS.map((prompt) => ({ ...prompt, answer: answers[prompt.key].trim() }));
}

export function isProfileComplete(profile: {
  display_name?: string | null; birth_date?: string | null; city_region?: string | null;
  relationship_intention?: string | null; prompts?: Json | null;
}, storedValidPhotoCount: number) {
  const answers = readProfilePromptAnswers(profile.prompts);
  return !!profile.display_name?.trim() && !!profile.birth_date && !!profile.city_region?.trim() && !!profile.relationship_intention
    && PROFILE_PROMPTS.every((prompt) => answers[prompt.key].trim().length > 0) && storedValidPhotoCount >= MIN_PHOTOS;
}

export type { VerificationState };
export interface VerificationResult { state: VerificationState; reason?: string }
export interface VerificationAdapter { request(userId: string): Promise<VerificationResult> }

/** Dev/test only. It is structurally unable to grant a real verification decision in production. */
export function createDevVerificationAdapter(isProduction: boolean, result: VerificationState = 'pending'): VerificationAdapter {
  return { async request() {
    if (isProduction) return { state: 'pending', reason: 'Verification is not available yet.' };
    if (result === 'verified') return { state: 'requires_review', reason: 'Test adapters cannot grant real verification.' };
    if (result === 'not_started') return { state: 'pending', reason: 'Verification is not available yet.' };
    return { state: result };
  } };
}

export function createUnavailableVerificationAdapter(): VerificationAdapter {
  return { async request() { return { state: 'pending', reason: 'Verification is not available yet.' }; } };
}

/**
 * True only when a real ID-verification provider adapter has been wired in.
 * No provider exists yet, so the client must not simulate a pending review.
 */
export function isVerificationProviderConfigured(env: Record<string, string | undefined> = process.env): boolean {
  const provider = (env.EXPO_PUBLIC_VERIFICATION_PROVIDER ?? '').trim();
  return provider.length > 0 && KNOWN_VERIFICATION_PROVIDERS.includes(provider);
}
/** Provider ids with a shipped client adapter. Empty until a vendor is approved. */
export const KNOWN_VERIFICATION_PROVIDERS: readonly string[] = [];

export const VERIFICATION_COMING_SOON = {
  title: 'Verification coming soon',
  message: 'ID verification is not open yet. We will let you know as soon as it is available. You can keep your profile ready in the meantime.',
} as const;

export function selectVerificationAdapter(isProduction: boolean, devResult: VerificationState = 'pending'): VerificationAdapter {
  return isProduction ? createUnavailableVerificationAdapter() : createDevVerificationAdapter(false, devResult);
}

const ALLOWED_TRANSITIONS: Record<VerificationState, readonly VerificationState[]> = {
  not_started: ['pending', 'requires_review'],
  pending: ['pending', 'verified', 'failed', 'requires_review'],
  verified: ['verified', 'requires_review'],
  failed: ['pending', 'failed', 'requires_review'],
  requires_review: ['pending', 'requires_review', 'failed', 'verified'],
};

export function transitionVerificationState(current: VerificationState, next: VerificationState, isProduction: boolean): VerificationState {
  if (isProduction && next === 'verified') return 'requires_review';
  return ALLOWED_TRANSITIONS[current].includes(next) ? next : 'requires_review';
}

export async function requestVerification(adapter: VerificationAdapter, userId: string, isProduction: boolean, current: VerificationState = 'not_started') {
  try {
    const result = await adapter.request(userId);
    const state = transitionVerificationState(current, result.state, isProduction);
    return state === result.state ? result : { state, reason: isProduction && result.state === 'verified' ? 'Production verification requires an authorized provider.' : result.reason };
  } catch {
    const state = transitionVerificationState(current, 'pending', isProduction);
    return { state, reason: 'Verification service unavailable. Retry later or request review.' };
  }
}
