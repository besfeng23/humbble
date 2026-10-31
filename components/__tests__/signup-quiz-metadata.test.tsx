import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SignupScreen from '@/app/auth/signup';
import { captureAttribution, setTrackingConsent } from '@/lib/attribution';
import { saveQuiz } from '@/lib/quiz';

const mockSignUp = jest.fn(async () => ({ error: null }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), useLocalSearchParams: () => mockParams, Redirect: () => null }));
jest.mock('@/lib/AuthProvider', () => ({ useAuth: () => ({ session: null }) }));
jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { auth: { signUp: (...a: unknown[]) => (mockSignUp as any)(...a) } } }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/constants/Motion', () => ({ MotionTransforms: { pressedOpacity: 0.85 }, getMotionConfig: () => ({ pressedScale: 1 }), useReducedMotion: () => true }));

async function submitSignup() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<SignupScreen />); await Promise.resolve(); });
  const byId = (id: string, prop = 'onPress') => tree.root.findAll((n) => n.props.testID === id && typeof n.props[prop] === 'function')[0];
  await act(async () => {
    byId('signup-display-name', 'onChangeText').props.onChangeText('Sincera Example');
    byId('signup-email', 'onChangeText').props.onChangeText('a@example.com');
    byId('signup-password', 'onChangeText').props.onChangeText('correct-horse-battery');
    byId('signup-password-confirm', 'onChangeText').props.onChangeText('correct-horse-battery');
    byId('signup-consent-terms').props.onPress();
  });
  await act(async () => { await byId('signup-submit').props.onPress(); });
  await act(async () => { tree.unmount(); await Promise.resolve(); });
}

beforeEach(async () => { mockSignUp.mockClear(); mockParams = {}; await AsyncStorage.clear(); });

describe('signup receives quiz answers and keeps attribution', () => {
  it('sends quiz metadata (from q_* params, over the local copy) alongside attribution and consent', async () => {
    await setTrackingConsent('allowed');
    await captureAttribution({ click_id: 'abc', utm_source: 'fb' }, '/quiz');
    await saveQuiz({ intent: 'serious', age: '30_39', timing: 'no_rush', country: 'NO' });
    mockParams = { q_intent: 'marriage', q_age: '40_49', q_timing: 'now', q_country: 'SE', click_id: 'abc' };
    await submitSignup();
    expect(mockSignUp).toHaveBeenCalledTimes(1);
    const data = (mockSignUp.mock.calls[0] as any)[0].options.data;
    expect(data.consent).toMatchObject({ terms_privacy: true, marketing: false });
    expect(data.attribution.params).toEqual({ click_id: 'abc', utm_source: 'fb' });
    expect(data.quiz).toMatchObject({ v: 1, completed: true, answers: { intent: 'marriage', age: '40_49', timing: 'now', country: 'SE' } });
  });

  it('omits quiz metadata when the visitor did not take the quiz', async () => {
    await submitSignup();
    expect((mockSignUp.mock.calls[0] as any)[0].options.data.quiz).toBeUndefined();
  });
});
