import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import ConversionLandingScreen from '@/app/(public)/index';
import { textContent } from '../test-utils/textContent';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), useLocalSearchParams: () => ({}), Redirect: () => null }));
jest.mock('@/lib/AuthProvider', () => ({ useAuth: () => ({ session: null }) }));
jest.mock('@/lib/attribution', () => ({ captureAttribution: jest.fn(async () => null), readTrackingConsent: jest.fn(async () => null), setTrackingConsent: jest.fn(async () => true) }));
jest.mock('@/components/layout', () => { const { View } = require('react-native'); return { PublicLayout: ({ children }: any) => <View>{children}</View> }; });

describe('landing copy', () => {
  it('makes no verification, liveness, count or testimonial claims and has one primary CTA', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<ConversionLandingScreen />); await Promise.resolve(); await Promise.resolve(); });
    const visible = tree.root.findAllByType(Text).map((n) => textContent(n.children)).join(' ');
    expect(visible).not.toMatch(/verif|liveness|biometric|\d[\d,]*\+?\s*(members|users|singles|couples)|testimonial/i);
    expect(visible).toMatch(/never ask you for money/i);
    expect(tree.root.findAllByProps({ testID: 'scr-01-start-cta' }).length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => /compare-pricing|signin-cta|pricing-callout/.test(String(n.props.testID ?? '')))).toHaveLength(0);
    await act(async () => { tree.unmount(); await Promise.resolve(); });
  });
});
