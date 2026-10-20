import { AUTH_RESET_NEXT, DEFAULT_AUTH_NEXT, buildAuthRedirectUrl, isAllowedAuthRedirectUrl, validateNextPath } from '../auth/redirects';

describe('Auth redirect allowlist', () => {
  test('accepts the app scheme callback', () => expect(isAllowedAuthRedirectUrl('humbble://auth/callback?code=abc')).toBe(true));
  test('accepts localhost callback from the Supabase local config', () => expect(isAllowedAuthRedirectUrl('http://localhost:8081/auth/callback?code=abc')).toBe(true));
  test('accepts only the exact configured development callback origin and path', () => {
    expect(isAllowedAuthRedirectUrl('https://preview.example.test/auth/callback?code=x', 'https://preview.example.test/auth/callback')).toBe(true);
    expect(isAllowedAuthRedirectUrl('https://preview.example.test/other?code=x', 'https://preview.example.test/auth/callback')).toBe(false);
  });
  test('rejects a different host or non-callback path on the local host', () => {
    expect(isAllowedAuthRedirectUrl('http://localhost.evil:8081/auth/callback')).toBe(false);
    expect(isAllowedAuthRedirectUrl('http://localhost:8081/other-path')).toBe(false);
    expect(isAllowedAuthRedirectUrl('humbble://evil.example/auth/callback')).toBe(false);
  });
  test('rejects an unexpected scheme', () => expect(isAllowedAuthRedirectUrl('https://evil.example/auth/callback')).toBe(false));
  test('rejects protocol-relative URLs', () => expect(isAllowedAuthRedirectUrl('//evil.example/auth/callback')).toBe(false));
  test('rejects javascript URLs', () => expect(isAllowedAuthRedirectUrl('javascript:alert(1)')).toBe(false));
  test('rejects credentials embedded in URLs', () => expect(isAllowedAuthRedirectUrl('http://user:pass@localhost:8081/auth/callback')).toBe(false));
  test('accepts the exact onboarding next path', () => expect(validateNextPath(DEFAULT_AUTH_NEXT)).toBe(DEFAULT_AUTH_NEXT));
  test('accepts the recovery next path', () => expect(validateNextPath(AUTH_RESET_NEXT)).toBe(AUTH_RESET_NEXT));
  test('rejects external and protocol-relative next paths', () => {
    expect(validateNextPath('https://evil.example')).toBeNull();
    expect(validateNextPath('//evil.example')).toBeNull();
    expect(validateNextPath('/\\\\evil.example')).toBeNull();
  });
  test('rejects traversal, query, hash, and unknown routes', () => {
    expect(validateNextPath('/auth/../signin')).toBeNull();
    expect(validateNextPath('/auth/signin?x=1')).toBeNull();
    expect(validateNextPath('/auth/signin#frag')).toBeNull();
    expect(validateNextPath('/not-allowlisted')).toBeNull();
  });
  test('builds a local web confirmation URL with a safe next path', () => {
    const url = new URL(buildAuthRedirectUrl('confirm', { platform: 'web', browserOrigin: 'http://localhost:8081' }));
    expect(url.origin).toBe('http://localhost:8081');
    expect(url.pathname).toBe('/auth/callback');
    expect(url.searchParams.get('next')).toBe(DEFAULT_AUTH_NEXT);
  });
  test('forces the recovery next path for recovery links', () => {
    const url = new URL(buildAuthRedirectUrl('recovery', { platform: 'native', next: '//evil.example' }));
    expect(url.protocol).toBe('humbble:');
    expect(url.searchParams.get('next')).toBe(AUTH_RESET_NEXT);
  });
});
