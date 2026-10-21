import {
  createDevVerificationAdapter,
  createUnavailableVerificationAdapter,
  isProfileComplete,
  readProfilePromptAnswers,
  requestVerification,
  selectVerificationAdapter,
  transitionVerificationState,
  validatePhoto,
} from '@/lib/onboarding/profile';

describe('P3-02 profile onboarding guards', () => {
  it('requires three distinct structured answers, an 18+ profile baseline, city, intention, and two photos', () => {
    const complete = { display_name: 'A Member', birth_date: '1990-01-01', city_region: 'Manila', relationship_intention: 'long_term_dating', prompts: [
      { key: 'weekend', answer: 'Coffee' }, { key: 'values', answer: 'Kindness' }, { key: 'relationship_goal', answer: 'A partnership' },
    ] };
    expect(isProfileComplete(complete, 2)).toBe(true);
    expect(isProfileComplete({ ...complete, prompts: [{ key: 'weekend', answer: 'a' }, { key: 'weekend', answer: 'b' }, { key: 'weekend', answer: 'c' }] }, 2)).toBe(false);
    expect(isProfileComplete(complete, 1)).toBe(false);
    expect(isProfileComplete({ ...complete, city_region: '' }, 2)).toBe(false);
  });
  it('validates one shared MIME allowlist and the exact 5 MiB boundary', () => {
    expect(validatePhoto({ type: 'image/heic', size: 5 * 1024 * 1024 }).valid).toBe(true);
    expect(validatePhoto({ type: 'image/webp', size: 1024 }).valid).toBe(true);
    expect(validatePhoto({ type: 'image/gif', size: 1024 }).valid).toBe(false);
    expect(validatePhoto({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }).valid).toBe(false);
    expect(validatePhoto({ type: 'image/jpeg' }, false).valid).toBe(true);
  });
  it('round-trips canonical prompt keys from server JSON', () => {
    expect(readProfilePromptAnswers([{ key: 'weekend', answer: 'Coffee' }, { key: 'values', answer: 'Trust' }, { key: 'relationship_goal', answer: 'Long term' }])).toEqual({ weekend: 'Coffee', values: 'Trust', relationship_goal: 'Long term' });
  });
  it('production never verifies with a dev/test adapter', async () => {
    const adapter = createDevVerificationAdapter(true, 'verified');
    expect(await requestVerification(adapter, 'user-1', true)).toMatchObject({ state: 'pending' });
    expect(await requestVerification(selectVerificationAdapter(true, 'verified'), 'user-1', true)).toMatchObject({ state: 'pending' });
  });
  it('provider outages degrade to pending/retry', async () => {
    const adapter = { request: async () => { throw new Error('offline'); } };
    expect(await requestVerification(adapter, 'user-1', false, 'pending')).toMatchObject({ state: 'pending', reason: expect.stringMatching(/Retry/) });
    expect(await requestVerification(adapter, 'user-1', false, 'verified')).toMatchObject({ state: 'requires_review' });
  });
  it('test adapter cannot issue a verified decision, and invalid transitions route to review', async () => {
    expect(await requestVerification(createDevVerificationAdapter(false, 'verified'), 'user-1', false, 'pending')).toMatchObject({ state: 'requires_review' });
    expect(transitionVerificationState('not_started', 'verified', false)).toBe('requires_review');
    expect(transitionVerificationState('pending', 'verified', true)).toBe('requires_review');
  });
  it('production selector does not select the test result', async () => {
    expect(await selectVerificationAdapter(true, 'failed').request('user-1')).toMatchObject({ state: 'pending' });
    expect(await createUnavailableVerificationAdapter().request('user-1')).toMatchObject({ state: 'pending' });
  });
});
