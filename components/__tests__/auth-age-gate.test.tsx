import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import OnboardingBasicsScreen from '@/app/(onboarding)/basics';
import { UNDERAGE_MESSAGE } from '@/app/(onboarding)/basics';
import { textContent } from '../test-utils/textContent';

var mockParams: Record<string, string> = {};
var mockReplace = jest.fn();
var mockInsert = jest.fn();
var mockFrom = jest.fn();
var mockAuth = { session: { user: { id: 'user-1' } }, user: { id: 'user-1', user_metadata: { full_name: 'Test Person' } }, authMessage: null, signOut: jest.fn().mockResolvedValue(undefined) };
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }), useLocalSearchParams: () => mockParams }));
jest.mock('@/lib/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { from: (...args: any[]) => mockFrom(...args) } }));

function configureInsert(error: any = null) {
  mockInsert.mockResolvedValue({ error });
  mockFrom.mockImplementation(() => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    return { select: jest.fn().mockReturnValue({ eq }), insert: mockInsert, update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }) };
  });
}
beforeEach(() => { mockParams = {}; mockReplace.mockReset(); mockInsert.mockReset(); mockFrom.mockReset(); configureInsert(); });

describe('18+ onboarding gate', () => {
  test('blocks an under-18 date before any profile read or write', async () => {
    const tree = renderer.create(<OnboardingBasicsScreen />);
    act(() => {
      tree.root.findByProps({ testID: 'birth-date-field' }).props.onChangeText('2010-01-01');
    });
    await act(async () => {
      tree.root.findByProps({ testID: 'birth-date-continue' }).props.onPress({});
      await Promise.resolve();
    });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ testID: 'underage-block-screen' })).toBeDefined();
    expect(tree.root.findAllByType(Text).some((node) => textContent(node.children) === UNDERAGE_MESSAGE)).toBe(true);
  });
  test('writes an adult birth date via profile insert and leaves server-owned fields untouched', async () => {
    const tree = renderer.create(<OnboardingBasicsScreen />);
    act(() => { tree.root.findByProps({ testID: 'birth-date-field' }).props.onChangeText('1990-01-01'); });
    await act(async () => { tree.root.findByProps({ testID: 'birth-date-continue' }).props.onPress({}); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(mockInsert).toHaveBeenCalledWith({ id: 'user-1', display_name: 'Test Person', birth_date: '1990-01-01' });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/verify');
  });
  test('maps a P0001 age-policy rejection to the same blocking state', async () => {
    configureInsert({ code: 'P0001', message: 'age policy' });
    const tree = renderer.create(<OnboardingBasicsScreen />);
    act(() => { tree.root.findByProps({ testID: 'birth-date-field' }).props.onChangeText('1990-01-01'); });
    await act(async () => { tree.root.findByProps({ testID: 'birth-date-continue' }).props.onPress({}); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(tree.root.findAllByType(Text).some((node) => textContent(node.children) === UNDERAGE_MESSAGE)).toBe(true);
  });
  test('maps database age constraint rejection to the same blocking state', async () => {
    configureInsert({ code: '23514', message: 'birth_date age check' });
    const tree = renderer.create(<OnboardingBasicsScreen />);
    act(() => { tree.root.findByProps({ testID: 'birth-date-field' }).props.onChangeText('1990-01-01'); });
    await act(async () => { tree.root.findByProps({ testID: 'birth-date-continue' }).props.onPress({}); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(tree.root.findAllByType(Text).some((node) => textContent(node.children) === UNDERAGE_MESSAGE)).toBe(true);
  });
});
