import React from 'react';
import { Pressable, Text } from 'react-native';
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
    expect(tree.root.findByProps({ testID: 'signin-submit' }).props.disabled).toBe(true);
    expect(tree.root.findByProps({ testID: 'signin-create-account' })).toBeTruthy();
    const disabledStyle = tree.root.findByProps({ testID: 'signin-submit' }).props.style({ pressed: false });
    expect(disabledStyle.backgroundColor).toBe('#FFD600');
    expect(disabledStyle.opacity).toBe(0.5);
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
  test('check-email always uses the same neutral response', () => {
    const tree = mount(<CheckEmailScreen />);
    expect(tree.root.findAllByType(Text).some((node) => textContent(node.children).includes("If this address can be used, we've sent a link."))).toBe(true);
    expect(tree.root.findAllByType(Pressable)).toHaveLength(1);
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
