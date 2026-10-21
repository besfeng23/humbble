export const DEFAULT_AUTH_NEXT = '/(onboarding)/basics';
export const AUTH_RESET_NEXT = '/auth/reset-password';

const ALLOWED_NEXT_PATHS = new Set([
  '/(onboarding)/basics',
  '/auth/reset-password',
  '/auth/signin',
  '/(tabs)/people',
]);

/** Returns a strictly allowlisted in-app path, never a URL or protocol-relative path. */
export function validateNextPath(next: unknown): string | null {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) return null;
  if (next.includes('\\') || next.includes('\0') || next.includes('#') || next.includes('?')) return null;
  try {
    const decoded = decodeURIComponent(next);
    if (decoded !== next || decoded.includes('..') || decoded.startsWith('//')) return null;
  } catch {
    return null;
  }
  return ALLOWED_NEXT_PATHS.has(next) ? next : null;
}

/**
 * Accept only the configured app scheme, the exact local callback origin, or the
 * exact callback URL configured for this development build.
 */
export function isAllowedAuthRedirectUrl(
  candidate: string,
  configuredRedirectUrl: string | undefined = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL,
): boolean {
  let parsed: URL;
  try { parsed = new URL(candidate); } catch { return false; }
  if (parsed.username || parsed.password) return false;
  if (parsed.protocol === 'humbble:') return parsed.hostname === 'auth' && parsed.pathname === '/callback';
  if (parsed.protocol === 'http:' && parsed.hostname === 'localhost' && parsed.port === '8081') return parsed.pathname === '/auth/callback';
  if (!configuredRedirectUrl) return false;
  let configured: URL;
  try { configured = new URL(configuredRedirectUrl); } catch { return false; }
  if (configured.username || configured.password || !['http:', 'https:'].includes(configured.protocol)) return false;
  return parsed.origin === configured.origin && parsed.pathname === configured.pathname;
}

export type AuthRedirectPurpose = 'confirm' | 'recovery';

export function buildAuthRedirectUrl(
  purpose: AuthRedirectPurpose,
  options: {
    platform?: 'web' | 'native';
    configuredRedirectUrl?: string;
    browserOrigin?: string;
    next?: string;
  } = {},
): string {
  const configured = options.configuredRedirectUrl ?? process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL;
  let base: string;
  if (configured) {
    if (!isAllowedAuthRedirectUrl(configured, configured)) throw new Error('Invalid auth redirect configuration');
    base = configured;
  } else if (
    options.platform === 'web' &&
    (options.browserOrigin === 'http://localhost:8081' || options.browserOrigin === undefined)
  ) {
    base = 'http://localhost:8081/auth/callback';
  } else {
    base = 'humbble://auth/callback';
  }
  if (!isAllowedAuthRedirectUrl(base, configured)) throw new Error('Auth redirect is not allowlisted');
  const url = new URL(base);
  const next = validateNextPath(options.next) ?? (purpose === 'recovery' ? AUTH_RESET_NEXT : DEFAULT_AUTH_NEXT);
  url.searchParams.set('next', next);
  return url.toString();
}
