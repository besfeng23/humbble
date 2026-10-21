import React from 'react';
import { StyleSheet, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import AuthCallbackScreen from '@/app/auth/callback';
import { textContent } from '../test-utils/textContent';

var mockConfigured = false;
var mockParams: Record<string, string> = {};
var mockReplace = jest.fn();
var mockGetSession = jest.fn();
var mockExchange = jest.fn();
var mockVerifyOtp = jest.fn();
var mockResend = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }), useLocalSearchParams: () => mockParams }));
jest.mock('expo-linking', () => ({ useURL: () => 'http://localhost:8081/auth/callback' }));
jest.mock('@/lib/auth/redirects', () => ({
  validateNextPath: (value: string | undefined) => value && value.startsWith('/') && !value.startsWith('//') ? value : null,
  isAllowedAuthRedirectUrl: () => true,
  buildAuthRedirectUrl: () => 'http://localhost:8081/auth/callback',
  DEFAULT_AUTH_NEXT: '/(onboarding)/basics',
  AUTH_RESET_NEXT: '/auth/reset-password',
}));
jest.mock('@/lib/supabase', () => ({ get isSupabaseConfigured() { return mockConfigured; }, supabase: { auth: { getSession: (...args: any[]) => mockGetSession(...args), exchangeCodeForSession: (...args: any[]) => mockExchange(...args), verifyOtp: (...args: any[]) => mockVerifyOtp(...args), resend: (...args: any[]) => mockResend(...args) } } }));

beforeEach(() => { mockConfigured = false; mockParams = {}; mockReplace.mockReset(); mockGetSession.mockReset(); mockExchange.mockReset(); mockVerifyOtp.mockReset(); mockResend.mockReset(); });
describe('auth callback', () => {
  test('invalid or unconfigured callback shows retry path without exposing tokens', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<AuthCallbackScreen />); await Promise.resolve(); });
    expect(tree.root.findAllByType(Text).some((node) => textContent(node.children).includes('This link can’t be used'))).toBe(true);
    expect(tree.root.findByProps({ testID: 'callback-resend' })).toBeTruthy();
    const action = tree.root.findAll((node) => node.props.testID === 'callback-resend' && node.props.style != null)[0];
    const rawStyle = action.props.style;
    const actionStyle = StyleSheet.flatten(typeof rawStyle === 'function' ? rawStyle({ pressed: false }) : rawStyle);
    expect(actionStyle.backgroundColor).toBe('#FFD600');
    expect(tree.root.findAllByType(Text).some((node) => /token_hash|access_token|code=/.test(textContent(node.children)))).toBe(false);
  });
  test('verifies a recovery token hash then routes only to password reset', async () => {
    mockConfigured = true;
    mockParams = { token_hash: 'opaque-hash', type: 'recovery', next: '/auth/reset-password' };
    mockVerifyOtp.mockResolvedValue({ error: null });
    await act(async () => { renderer.create(<AuthCallbackScreen />); await Promise.resolve(); await Promise.resolve(); });
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'opaque-hash', type: 'recovery' });
    expect(mockReplace).toHaveBeenCalledWith('/auth/reset-password');
  });
  test('exchanges a valid PKCE code then routes to the allowlisted onboarding path', async () => {
    mockConfigured = true;
    mockParams = { code: 'opaque-code', next: '/(onboarding)/basics' };
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockExchange.mockResolvedValue({ error: null });
    await act(async () => { renderer.create(<AuthCallbackScreen />); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(mockExchange).toHaveBeenCalledWith('opaque-code');
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/basics');
  });
});
