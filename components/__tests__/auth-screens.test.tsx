import React from 'react';
import { StyleSheet, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import SigninScreen, { getSignInError } from '@/app/auth/signin';
import SignupScreen from '@/app/auth/signup';
import RecoveryScreen from '@/app/auth/recovery';
import CheckEmailScreen from '@/app/auth/check-email';
import OnboardingVerifyScreen from '@/app/(onboarding)/verify';
import { useAuth } from '@/lib/AuthProvider';
import { textContent } from '../test-utils/textContent';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock('@/lib/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: { auth: { signInWithPassword: jest.fn(), signUp: jest.fn(), resetPasswordForEmail: jest.fn() } } }));

jest.mock('@/constants/Motion', () => ({ MotionTransforms: { pressedOpacity: 0.85 }, getMotionConfig: () => ({ pressedScale: 1 }), useReducedMotion: () => true }));

const mountedTrees: renderer.ReactTestRenderer[] = [];
function mount(element: React.ReactElement): renderer.ReactTestRenderer {
  const tree = renderer.create(element);
  mountedTrees.push(tree);
  return tree;
}
afterEach(async () => {
  await act(async () => {
    for (const tree of mountedTrees.splice(0)) tree.unmount();
    await Promise.resolve();
  });
});

beforeEach(() => (useAuth as jest.Mock).mockReturnValue({ authMessage: null, session: null, user: null, signOut: jest.fn() }));
describe('enumeration-safe, unconfigured auth UI', () => {
  test('sign-in shows one neutral unavailable notice and disables submit', () => {
    const tree = mount(<SigninScreen />);
    expect(textContent(tree.root.findByProps({ testID: 'auth-unavailable' }).children)).toBe('Sign-in is unavailable in this build');
    const noticeBox = StyleSheet.flatten(tree.root.findByProps({ testID: 'auth-unavailable-notice' }).props.style);
    expect(noticeBox.borderWidth).toBe(1);
    expect(noticeBox.borderColor).toBeTruthy();
    const noticeText = tree.root.findAllByType(Text).find((node) => node.props.testID === 'auth-unavailable');
    expect(StyleSheet.flatten(noticeText?.props.style)?.fontSize).toBe(16);
    expect(tree.root.findByProps({ testID: 'signin-submit' }).props.disabled).toBe(true);
    expect(tree.root.findByProps({ testID: 'signin-create-account' })).toBeTruthy();
    expect(tree.root.findAll((node) => Array.isArray(node.props.edges) && node.props.edges.includes('top') && node.props.edges.includes('bottom'))).toHaveLength(1);
    const submitButton = tree.root.findAll((node) => node.props.testID === 'signin-submit' && node.props.style != null)[0];
    const rawStyle = submitButton.props.style;
    const disabledStyle = StyleSheet.flatten(typeof rawStyle === 'function' ? rawStyle({ pressed: false }) : rawStyle);
    expect(disabledStyle.backgroundColor).toBe('#FFD600');
    // Keep the label at full contrast; the overlay dims only the primary fill.
    expect(disabledStyle.opacity).toBe(1);
    expect(tree.root.findByProps({ testID: 'signin-submit-disabled-overlay' })).toBeTruthy();
    const signInLabel = submitButton.findAllByType(Text).find((node) => textContent(node.children) === 'Sign in');
    expect(StyleSheet.flatten(signInLabel?.props.style)?.color).toBe('#1A1A1A');
    expect(tree.root.findAllByType(Text).some((node) => /Google|Facebook/.test(textContent(node.children)))).toBe(false);
    expect(tree.root.findAll((node) => /signin-(google|facebook)/.test(String(node.props.testID ?? '')))).toHaveLength(0);
  });
  test('sign-up disables submit when Supabase is unconfigured', () => {
    const tree = mount(<SignupScreen />);
    expect(tree.root.findByProps({ testID: 'signup-submit' }).props.disabled).toBe(true);
    expect(tree.root.findAllByType(Text).some((node) => /Google|Facebook/.test(textContent(node.children)))).toBe(false);
    expect(tree.root.findAll((node) => /signup-(google|facebook)/.test(String(node.props.testID ?? '')))).toHaveLength(0);
  });
  test('recovery disables submit in an unconfigured build', () => {
    const tree = mount(<RecoveryScreen />);
    expect(tree.root.findByProps({ testID: 'recovery-submit' }).props.disabled).toBe(true);
  });
  test('check-email keeps its single primary action in the shared colour family', () => {
    const tree = mount(<CheckEmailScreen />);
    expect(tree.root.findAllByType(Text).some((node) => textContent(node.children).includes("If this address can be used, we've sent a link."))).toBe(true);
    // Primary: open mail app. Secondary text link: return to sign in.
    expect(tree.root.findAllByProps({ testID: 'check-email-signin' }).length).toBeGreaterThan(0);
    const action = tree.root.findAll((node) => node.props.testID === 'check-email-open-mail' && node.props.style != null)[0];
    const rawStyle = action.props.style;
    const buttonStyle = StyleSheet.flatten(typeof rawStyle === 'function' ? rawStyle({ pressed: false }) : rawStyle);
    expect(buttonStyle.backgroundColor).toBe('#FFD600');
  });
  test('verification screen states provider unavailability without a success outcome', () => {
    const tree = mount(<OnboardingVerifyScreen />);
    const visible = tree.root.findAllByType(Text).map((node) => textContent(node.children)).join(' ');
    expect(visible).toContain('Verification not available yet.');
    expect(visible).not.toMatch(/verified successfully|verification complete|success/i);
  });
  test('wrong credentials and unknown accounts map to the same message; unconfirmed email is distinct', () => {
    expect(getSignInError({ message: 'Invalid login credentials' })).toBe('Email or password is incorrect');
    expect(getSignInError({ message: 'User not found' })).toBe('Email or password is incorrect');
    expect(getSignInError({ code: 'email_not_confirmed' })).toBe('Please confirm your email before signing in.');
    expect(getSignInError({ status: 429 })).toBe('Sign-in is temporarily unavailable. Try again.');
  });
});
