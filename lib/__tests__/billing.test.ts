import { FREE_STATUS, PRICE_LABEL, toPremiumStatus } from '@/lib/billing';

jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: {} }));

describe('billing client boundary', () => {
  it('prices are the two approved monthly plans', () => {
    expect(PRICE_LABEL).toEqual({ PH: '₱599 / month', US: 'US$29.99 / month' });
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
