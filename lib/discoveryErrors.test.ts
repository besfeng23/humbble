import { toFriendlyDiscoveryError } from './discoveryErrors';

describe('toFriendlyDiscoveryError', () => {
  test('actor_not_eligible points to completing the profile (no ID verification) and never leaks the raw code', () => {
    const f = toFriendlyDiscoveryError(Object.assign(new Error('actor_not_eligible'), { code: '42501' }));
    expect(f.action).toBe('complete_profile');
    expect(f.title).toMatch(/complete your profile/i);
    expect(f.message).toMatch(/two photos/i);
    expect(f.message).toMatch(/three prompts/i);
    expect(`${f.title} ${f.message}`).not.toMatch(/finish verification|verify your/i);
    expect(`${f.title} ${f.message}`).not.toMatch(/actor_not_eligible|_/);
  });
  test.each(['authentication_required', 'target_not_eligible', 'blocked_pair', 'duplicate_swipe_direction_mismatch', 'quota_exceeded', 'invalid_discovery_cursor', 'target_and_direction_required'])('%s maps to friendly text', (code) => {
    const f = toFriendlyDiscoveryError(new Error(code));
    expect(f.key).toBe(code);
    expect(`${f.title} ${f.message}`).not.toContain(code);
  });
  test('unknown errors fall back to generic copy without the raw message', () => {
    const f = toFriendlyDiscoveryError(new Error('relation "x" does not exist'));
    expect(f.key).toBe('unknown');
    expect(f.message).not.toMatch(/relation/);
  });
});
