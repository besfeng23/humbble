import { countryHintFromLocale, formatPrice, FREE_STATUS, toPremiumStatus } from '@/lib/billing';

jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: {} }));

describe('billing client boundary', () => {
  it('formats local currencies cleanly', () => {
    const n = (v: string) => v.replace(/\s/g, ' ');
    expect(n(formatPrice(299, 'SEK', 'sv-SE'))).toBe('299 kr');
    expect(formatPrice(23.99, 'GBP', 'en-GB')).toBe('£23.99');
    expect(n(formatPrice(27.99, 'EUR', 'it-IT'))).toBe('27,99 €');
    expect(formatPrice(29.99, 'USD', 'en-US')).toBe('$29.99');
    expect(formatPrice(599, 'PHP', 'en-PH')).toBe('₱599');
  });
  it('derives an advisory country hint from the locale', () => {
    expect(countryHintFromLocale('sv-SE')).toBe('SE');
    expect(countryHintFromLocale('en-GB')).toBe('GB');
    expect(countryHintFromLocale('zh-Hant-TW')).toBe('TW');
    expect(countryHintFromLocale('en')).toBeNull();
  });
  it('missing status fails closed to free', () => {
    expect(toPremiumStatus(undefined)).toEqual(FREE_STATUS);
  });
  it('only an explicit true is premium', () => {
    expect(toPremiumStatus({ is_premium: true, valid_until: 'x', subscription_status: 'active', cancel_at_period_end: false }).isPremium).toBe(true);
    expect(toPremiumStatus({ is_premium: 'true' as unknown as boolean, valid_until: null, subscription_status: null, cancel_at_period_end: false }).isPremium).toBe(false);
  });
  it('unconfigured backend never reports premium', async () => {
    const { getPremiumStatus, getLikedYou } = require('@/lib/billing');
    await expect(getPremiumStatus()).resolves.toEqual(FREE_STATUS);
    await expect(getLikedYou(true)).resolves.toEqual({ count: 0, people: [] });
  });
});

describe('paymentsAreTestOnly (fails closed, mirrors the server live gate)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { paymentsAreTestOnly, PAYMENTS_ARE_TEST_ONLY } = require('@/lib/billing');
  it('is test-only by default and when the environment is unset', () => {
    expect(paymentsAreTestOnly(undefined, undefined)).toBe(true);
    expect(paymentsAreTestOnly('', '')).toBe(true);
    expect(PAYMENTS_ARE_TEST_ONLY).toBe(true);
  });
  it('is test-only for sandbox, typos, and a half-configured live gate', () => {
    expect(paymentsAreTestOnly('sandbox', 'true')).toBe(true);
    expect(paymentsAreTestOnly('production', 'true')).toBe(true);
    expect(paymentsAreTestOnly('live', undefined)).toBe(true);
    expect(paymentsAreTestOnly('live', 'false')).toBe(true);
    expect(paymentsAreTestOnly('live', 'TRUE')).toBe(true);
    expect(paymentsAreTestOnly(undefined, 'true')).toBe(true);
  });
  it('is live only when BOTH are explicitly set, like the server', () => {
    expect(paymentsAreTestOnly('live', 'true')).toBe(false);
    expect(paymentsAreTestOnly(' LIVE ', 'true')).toBe(false);
  });
});
