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
  const signInWithProfile = async (profile: Record<string, unknown>) => {
    mockSignIn.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-2' } } }, error: null });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'user-2', ...profile }, error: null }) }) }) });
    const tree = renderer.create(<SigninScreen />);
    act(() => { tree.root.findByProps({ testID: 'signin-email' }).props.onChangeText('person@example.test'); tree.root.findByProps({ testID: 'signin-password' }).props.onChangeText('correct-password'); });
    await act(async () => { tree.root.findByProps({ testID: 'signin-submit' }).props.onPress({}); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  };
  test('an incomplete (non-discoverable) profile goes back to finish the profile, never to verification', async () => {
    await signInWithProfile({ is_discoverable: false, is_paused: false });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/photos-prompts');
    expect(mockReplace).not.toHaveBeenCalledWith('/(onboarding)/verify');
  });
  test('a complete, discoverable profile goes to discovery without ID verification', async () => {
    await signInWithProfile({ is_discoverable: true, is_paused: false });
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/people');
  });
  test('a paused member is not pushed back into onboarding', async () => {
    await signInWithProfile({ is_discoverable: false, is_paused: true });
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/people');
  });
  test('successful sign-up always goes to the neutral check-email state', async () => {
    mockSignUp.mockResolvedValue({ error: null });
    const tree = renderer.create(<SignupScreen />);
    act(() => { tree.root.findByProps({ testID: 'signup-display-name' }).props.onChangeText('Sincera Example'); tree.root.findByProps({ testID: 'signup-email' }).props.onChangeText('person@example.test'); tree.root.findByProps({ testID: 'signup-password' }).props.onChangeText('safe-password'); tree.root.findByProps({ testID: 'signup-password-confirm' }).props.onChangeText('safe-password'); tree.root.findByProps({ testID: 'signup-consent-terms' }).props.onToggle(); });
    await act(async () => { tree.root.findByProps({ testID: 'signup-submit' }).props.onPress({}); for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/auth/check-email', params: { flow: 'confirm', email: 'person@example.test' } });
  });
  test('sign-up requires the unticked terms consent and sends marketing opt-out by default', async () => {
    mockSignUp.mockResolvedValue({ error: null });
    const tree = renderer.create(<SignupScreen />);
    expect(tree.root.findByProps({ testID: 'signup-consent-terms' }).props.checked).toBe(false);
    expect(tree.root.findByProps({ testID: 'signup-consent-marketing' }).props.checked).toBe(false);
    act(() => { tree.root.findByProps({ testID: 'signup-display-name' }).props.onChangeText('Sincera Example'); tree.root.findByProps({ testID: 'signup-email' }).props.onChangeText('person@example.test'); tree.root.findByProps({ testID: 'signup-password' }).props.onChangeText('safe-password'); tree.root.findByProps({ testID: 'signup-password-confirm' }).props.onChangeText('safe-password'); });
    await act(async () => { tree.root.findByProps({ testID: 'signup-submit' }).props.onPress({}); for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(Text).some((node) => /agree to the Terms/i.test(textContent(node.children)))).toBe(true);
    act(() => { tree.root.findByProps({ testID: 'signup-consent-terms' }).props.onToggle(); });
    await act(async () => { tree.root.findByProps({ testID: 'signup-submit' }).props.onPress({}); for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(mockSignUp.mock.calls[0][0].options.data.consent).toMatchObject({ terms_privacy: true, marketing: false });
    expect(mockSignUp.mock.calls[0][0].options.data.name).toBe('Sincera Example');
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
    act(() => { tree.root.findByProps({ testID: 'signup-display-name' }).props.onChangeText('Sincera Example'); tree.root.findByProps({ testID: 'signup-email' }).props.onChangeText('person@example.test'); tree.root.findByProps({ testID: 'signup-password' }).props.onChangeText('safe-password'); tree.root.findByProps({ testID: 'signup-password-confirm' }).props.onChangeText('safe-password'); tree.root.findByProps({ testID: 'signup-consent-terms' }).props.onToggle(); });
    await act(async () => { tree.root.findByProps({ testID: 'signup-submit' }).props.onPress({}); for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/auth/check-email', params: { flow: 'confirm', email: 'person@example.test' } });
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
