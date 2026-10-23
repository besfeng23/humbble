import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import SubscriptionBillingScreen from '@/app/(paywall)/billing';
import ReserveUpgradePaywallScreen from '@/app/(paywall)/upgrade';
import PricingScreen from '@/app/(public)/pricing';
import { TEST_PAYMENTS_NOTICE } from '@/lib/billing';
import { toFriendlyMessage } from '@/lib/friendlyErrors';
import { textContent } from '../test-utils/textContent';

jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: {} }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/lib/AuthProvider', () => { const value = { session: { user: { id: 'u1' } } }; return { useAuth: () => value }; });
jest.mock('@/components/layout', () => {
  const { View } = require('react-native');
  const Pass = ({ children }: any) => <View>{children}</View>;
  return { SettingsLayout: Pass, PublicLayout: Pass, AuthGuard: Pass };
});

let mockPremium: Record<string, unknown> = {};
jest.mock('@/hooks/usePremium', () => ({ usePremium: () => ({ loading: false, refresh: jest.fn(async () => undefined), ...mockPremium }) }));

const mockStartCheckout = jest.fn();
jest.mock('@/lib/billing', () => {
  const actual = jest.requireActual('@/lib/billing');
  return {
    ...actual,
    getBillingPlan: jest.fn(async () => ({ countryCode: 'PH', planKey: 'premium_monthly_ph', currency: 'PHP', amount: 599 })),
    startCheckout: (...args: unknown[]) => mockStartCheckout(...args),
    cancelSubscription: jest.fn(async () => ({ ok: true })),
  };
});

// Developer / internal vocabulary that must never reach a member.
const INTERNAL = /sandbox|dev build|plan_key|planKey|premium_monthly|cancel_at_period_end|entitlement|SCR-\d|click \d of \d|todo|fixme|debug|undefined|null|__DEV__|\b[a-z]+_[a-z_]+\b/i;

const trees: renderer.ReactTestRenderer[] = [];
afterEach(() => { while (trees.length) { const t = trees.pop()!; act(() => { t.unmount(); }); } });

async function render(el: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(el); });
  trees.push(tree);
  const items = tree.root.findAllByType(Text).map((n) => textContent(n.children)).filter((t) => t.trim().length > 0);
  return { tree, items, visible: items.join(' | ') };
}

describe('billing screens: member-facing copy', () => {
  it('billing (free) is plain, short and shows no payment notice', async () => {
    mockPremium = { isPremium: false, cancelAtPeriodEnd: false, validUntil: null };
    const { visible, items } = await render(<SubscriptionBillingScreen />);
    expect(visible).not.toMatch(INTERNAL);
    expect(visible).toMatch(/Humbble Free/);
    expect(visible).not.toContain(TEST_PAYMENTS_NOTICE);
    expect(items.length).toBeLessThanOrEqual(6);
  });

  it('billing (active) shows a human status, a plain cancel path and the test-payments notice', async () => {
    mockPremium = { isPremium: true, cancelAtPeriodEnd: false, validUntil: '2026-11-23T00:00:00Z' };
    const { visible, items } = await render(<SubscriptionBillingScreen />);
    expect(visible).not.toMatch(INTERNAL);
    expect(visible).toMatch(/Renews monthly until cancelled/);
    expect(visible).toMatch(/Cancel subscription/);
    expect(visible).toContain(TEST_PAYMENTS_NOTICE);
    expect(items.length).toBeLessThanOrEqual(6);
  });

  it('billing (cancelled) says when access ends', async () => {
    mockPremium = { isPremium: true, cancelAtPeriodEnd: true, validUntil: '2026-11-23T12:00:00Z' };
    const { visible } = await render(<SubscriptionBillingScreen />);
    expect(visible).toMatch(/Active until .*2026.*won’t renew/);
    expect(visible).not.toMatch(INTERNAL);
  });

  it('upgrade uses plain wording and one honest test-payments notice (not tied to __DEV__)', async () => {
    mockPremium = { isPremium: false };
    const { visible, items } = await render(<ReserveUpgradePaywallScreen />);
    expect(visible).not.toMatch(INTERNAL);
    expect(visible).toContain(TEST_PAYMENTS_NOTICE);
    expect(visible.split(TEST_PAYMENTS_NOTICE).length - 1).toBe(1);
    expect(items.length).toBeLessThanOrEqual(8);
  });

  it('upgrade routes checkout failures through the friendly mapper', async () => {
    mockPremium = { isPremium: false };
    mockStartCheckout.mockResolvedValue({ error: 'checkout_unavailable' });
    const { tree } = await render(<ReserveUpgradePaywallScreen />);
    await act(async () => { tree.root.findByProps({ testID: 'scr-20-consent-checkbox' }).props.onPress(); });
    await act(async () => { await tree.root.findByProps({ testID: 'scr-20-checkout-btn' }).props.onPress(); });
    const shown = textContent(tree.root.findByProps({ testID: 'scr-20-message' }).props.children);
    expect(shown).toBe('Checkout is unavailable right now. Please try again.');
    expect(shown).not.toMatch(/checkout_unavailable/);
  });

  it('pricing makes no verification or unbuilt-feature claims and carries the same notice', async () => {
    const { visible } = await render(<PricingScreen />);
    expect(visible).toContain("Cancel anytime from Billing.");
    expect(visible).not.toMatch(/verif|incognito|advanced filters|safety shield|sandbox|plan_key/i);
    expect(visible).toContain(TEST_PAYMENTS_NOTICE);
  });
});

describe('friendly mapper: premium wording', () => {
  it('names the plan consistently with the paywall', () => {
    expect(toFriendlyMessage('premium_required')).toBe('This feature is part of Humbble Premium.');
  });
});
