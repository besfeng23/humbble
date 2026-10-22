import { looksLikeRawCode, toFriendlyMessage } from '@/lib/friendlyErrors';
import { isConversationId, isUnknownUrlMatch } from '@/lib/routeMatching';
import { isVerificationProviderConfigured, VERIFICATION_COMING_SOON } from '@/lib/onboarding/profile';

describe('friendly error mapper (D5)', () => {
  test.each(['target_not_found', 'reported_user_not_found', 'ERROR: target_not_found', 'new row violates row-level security policy', 'PGRST116', '42501', 'some_unknown_code'])('never renders raw code %s', (raw) => {
    const msg = toFriendlyMessage(new Error(raw));
    expect(msg).not.toMatch(/[a-z]+_[a-z_]+/);
    expect(msg).not.toMatch(/PGRST|42501|row-level/);
  });
  test('maps known codes to specific copy', () => {
    expect(toFriendlyMessage({ message: 'target_not_found' })).toMatch(/couldn’t find that profile/);
    expect(toFriendlyMessage('actor_not_eligible')).toMatch(/verified/);
  });
  test('human copy passes through; fallback is used for raw codes', () => {
    expect(toFriendlyMessage(new Error('Notes must be 500 characters or fewer.'))).toBe('Notes must be 500 characters or fewer.');
    expect(toFriendlyMessage(new Error('weird_code'), 'Try again.')).toBe('Try again.');
    expect(looksLikeRawCode('Choose a profile before submitting a report.')).toBe(false);
  });
});

describe('unknown URL detection (D8)', () => {
  test('non-UUID matches of the root-level chat route are unknown URLs', () => {
    expect(isUnknownUrlMatch(['(tabs)', '(chats)', '[conversationId]'], 'nonexistent-route')).toBe(true);
    expect(isUnknownUrlMatch(['(tabs)', '(chats)', '[conversationId]'], '6f1c2b0a-1e2d-4c3b-9a8f-0123456789ab')).toBe(false);
    expect(isUnknownUrlMatch(['(tabs)', 'people'], undefined)).toBe(false);
    expect(isConversationId(undefined)).toBe(false);
  });
});

describe('verification provider (D2)', () => {
  test('no provider configured means coming soon, never pending', () => {
    expect(isVerificationProviderConfigured({})).toBe(false);
    expect(isVerificationProviderConfigured({ EXPO_PUBLIC_VERIFICATION_PROVIDER: 'made-up' })).toBe(false);
    expect(VERIFICATION_COMING_SOON.title).toBe('Verification coming soon');
    expect(`${VERIFICATION_COMING_SOON.title} ${VERIFICATION_COMING_SOON.message}`).not.toMatch(/pending/i);
  });
});
