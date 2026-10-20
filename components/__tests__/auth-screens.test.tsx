import React from 'react';
import { Text } from 'react-native';
import renderer from 'react-test-renderer';
import SigninScreen, { getSignInError } from '@/app/auth/signin';
import SignupScreen from '@/app/auth/signup';
import RecoveryScreen from '@/app/auth/recovery';
import CheckEmailScreen from '@/app/auth/check-email';
import OnboardingVerifyScreen from '@/app/(onboarding)/verify';
import { useAuth } from '@/lib/AuthProvider';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock('@/lib/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: { auth: { signInWithPassword: jest.fn(), signUp: jest.fn(), resetPasswordForEmail: jest.fn() } } }));

beforeEach(() => (useAuth as jest.Mock).mockReturnValue({ authMessage: null, session: null, user: null, signOut: jest.fn() }));
describe('enumeration-safe, unconfigured auth UI', () => {
  test('sign-in shows one neutral unavailable notice and disables submit', () => {
    const tree = renderer.create(<SigninScreen />);
    expect(tree.root.findByProps({ testID: 'auth-unavailable' }).children.join('')).toBe('Sign-in is unavailable in this build');
    expect(tree.root.findByProps({ testID: 'signin-submit' }).props.disabled).toBe(true);
    expect(tree.root.findAllByType(Text).some((node) => /Google|Facebook/.test(node.children.join('')))).toBe(false);
    expect(tree.root.findAll((node) => /signin-(google|facebook)/.test(String(node.props.testID ?? '')))).toHaveLength(0);
  });
  test('sign-up disables submit when Supabase is unconfigured', () => {
    const tree = renderer.create(<SignupScreen />);
    expect(tree.root.findByProps({ testID: 'signup-submit' }).props.disabled).toBe(true);
    expect(tree.root.findAllByType(Text).some((node) => /Google|Facebook/.test(node.children.join('')))).toBe(false);
    expect(tree.root.findAll((node) => /signup-(google|facebook)/.test(String(node.props.testID ?? '')))).toHaveLength(0);
  });
  test('recovery disables submit in an unconfigured build', () => {
    const tree = renderer.create(<RecoveryScreen />);
    expect(tree.root.findByProps({ testID: 'recovery-submit' }).props.disabled).toBe(true);
  });
  test('check-email always uses the same neutral response', () => {
    const tree = renderer.create(<CheckEmailScreen />);
    expect(tree.root.findAllByType(Text).some((node) => node.children.join('').includes("If this address can be used, we've sent a link."))).toBe(true);
  });
  test('verification screen states provider unavailability without a success outcome', () => {
    const tree = renderer.create(<OnboardingVerifyScreen />);
    const visible = tree.root.findAllByType(Text).map((node) => node.children.join('')).join(' ');
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
