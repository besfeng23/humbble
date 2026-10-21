import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import SigninScreen from '@/app/auth/signin';
import SignupScreen from '@/app/auth/signup';
import RecoveryScreen from '@/app/auth/recovery';
import { useAuth } from '@/lib/AuthProvider';
import { textContent } from '../test-utils/textContent';

var mockReplace = jest.fn();
var mockSignIn = jest.fn();
var mockSignUp = jest.fn();
var mockRecovery = jest.fn();
var mockGetSession = jest.fn();
var mockFrom = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace }), useLocalSearchParams: () => ({}) }));
jest.mock('@/lib/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/auth/redirects', () => ({ buildAuthRedirectUrl: () => 'humbble://auth/callback' }));
jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { auth: { signInWithPassword: (...args: any[]) => mockSignIn(...args), signUp: (...args: any[]) => mockSignUp(...args), resetPasswordForEmail: (...args: any[]) => mockRecovery(...args), getSession: (...args: any[]) => mockGetSession(...args) }, from: (...args: any[]) => mockFrom(...args) } }));

beforeEach(() => {
  mockReplace.mockReset(); mockSignIn.mockReset(); mockSignUp.mockReset(); mockRecovery.mockReset(); mockGetSession.mockReset(); mockFrom.mockReset();
  (useAuth as jest.Mock).mockReturnValue({ authMessage: null, session: null, user: null, signOut: jest.fn() });
});

describe('auth request flows', () => {
  test('successful sign-in with no profile routes into DOB onboarding', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) });
    const tree = renderer.create(<SigninScreen />);
    act(() => { tree.root.findByProps({ testID: 'signin-email' }).props.onChangeText('person@example.test'); tree.root.findByProps({ testID: 'signin-password' }).props.onChangeText('correct-password'); });
    await act(async () => { tree.root.findByProps({ testID: 'signin-submit' }).props.onPress({}); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/basics');
  });
  test('does not route an unverified or non-discoverable profile to discovery', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-2' } } }, error: null });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'user-2', verification_status: 'not_started', is_discoverable: false }, error: null }) }) }) });
    const tree = renderer.create(<SigninScreen />);
    act(() => { tree.root.findByProps({ testID: 'signin-email' }).props.onChangeText('person@example.test'); tree.root.findByProps({ testID: 'signin-password' }).props.onChangeText('correct-password'); });
    await act(async () => { tree.root.findByProps({ testID: 'signin-submit' }).props.onPress({}); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/verify');
  });
  test('successful sign-up always goes to the neutral check-email state', async () => {
    mockSignUp.mockResolvedValue({ error: null });
    const tree = renderer.create(<SignupScreen />);
    act(() => { tree.root.findByProps({ testID: 'signup-email' }).props.onChangeText('person@example.test'); tree.root.findByProps({ testID: 'signup-password' }).props.onChangeText('safe-password'); });
    await act(async () => { tree.root.findByProps({ testID: 'signup-submit' }).props.onPress({}); await Promise.resolve(); await Promise.resolve(); });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/auth/check-email', params: { flow: 'confirm' } });
  });
  test('sign-in hides provider details for invalid credentials', async () => {
    mockSignIn.mockResolvedValue({ error: { code: 'invalid_credentials', status: 400, message: 'User lookup failed in backend' } });
    const tree = renderer.create(<SigninScreen />);
    act(() => { tree.root.findByProps({ testID: 'signin-email' }).props.onChangeText('person@example.test'); tree.root.findByProps({ testID: 'signin-password' }).props.onChangeText('wrongpassword'); });
    await act(async () => { tree.root.findByProps({ testID: 'signin-submit' }).props.onPress({}); await Promise.resolve(); await Promise.resolve(); });
    expect(textContent(tree.root.findByProps({ testID: 'signin-error' }).children)).toBe('Email or password is incorrect');
  });
  test('sign-up routes a duplicate-email response to the same neutral check-email screen', async () => {
    mockSignUp.mockResolvedValue({ error: { code: 'user_already_exists', status: 400, message: 'User already registered' } });
    const tree = renderer.create(<SignupScreen />);
    act(() => { tree.root.findByProps({ testID: 'signup-email' }).props.onChangeText('person@example.test'); tree.root.findByProps({ testID: 'signup-password' }).props.onChangeText('safe-password'); });
    await act(async () => { tree.root.findByProps({ testID: 'signup-submit' }).props.onPress({}); await Promise.resolve(); await Promise.resolve(); });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/auth/check-email', params: { flow: 'confirm' } });
    expect(tree.root.findAllByType(Text).some((node) => /already registered/i.test(textContent(node.children)))).toBe(false);
  });
  test('recovery still routes to a neutral response when the provider returns an error', async () => {
    mockRecovery.mockRejectedValue(new Error('unknown user')); 
    const tree = renderer.create(<RecoveryScreen />);
    act(() => { tree.root.findByProps({ testID: 'recovery-email' }).props.onChangeText('person@example.test'); });
    await act(async () => { tree.root.findByProps({ testID: 'recovery-submit' }).props.onPress({}); await Promise.resolve(); await Promise.resolve(); });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/auth/check-email', params: { flow: 'recovery' } });
  });
});
