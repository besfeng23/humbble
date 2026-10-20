import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import ResetPasswordScreen from '@/app/auth/reset-password';
import { validatePasswordPair } from '@/lib/auth/password';

var mockConfigured = false;
var mockReplace = jest.fn();
var mockUpdateUser = jest.fn();
var mockSignOut = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@/lib/AuthProvider', () => ({ useAuth: () => ({ signOut: (...args: any[]) => mockSignOut(...args) }) }));
jest.mock('@/lib/supabase', () => ({ get isSupabaseConfigured() { return mockConfigured; }, supabase: { auth: { updateUser: (...args: any[]) => mockUpdateUser(...args) } } }));

beforeEach(() => { mockConfigured = false; mockReplace.mockReset(); mockUpdateUser.mockReset().mockResolvedValue({ error: null }); mockSignOut.mockReset().mockResolvedValue(undefined); });
describe('password recovery reset', () => {
  test('rejects too-short passwords', () => expect(validatePasswordPair('12345', '12345')).toBe('too_short'));
  test('rejects mismatched confirmation', () => expect(validatePasswordPair('longpassword', 'different')).toBe('mismatch'));
  test('accepts matching passwords at the configured minimum', () => expect(validatePasswordPair('12345678', '12345678')).toBeNull());
  test('shows the neutral unavailable notice and disables update', () => {
    const tree = renderer.create(<ResetPasswordScreen />);
    expect(tree.root.findByProps({ testID: 'reset-password-submit' }).props.disabled).toBe(true);
    expect(tree.root.findAllByType(Text).some((node) => node.children.join('') === 'Sign-in is unavailable in this build')).toBe(true);
  });
  test('component rejects a short password without calling Supabase', async () => {
    mockConfigured = true;
    const tree = renderer.create(<ResetPasswordScreen />);
    act(() => { tree.root.findByProps({ testID: 'reset-password' }).props.onChangeText('12345'); tree.root.findByProps({ testID: 'reset-password-confirm' }).props.onChangeText('12345'); });
    await act(async () => { tree.root.findByProps({ testID: 'reset-password-submit' }).props.onPress({}); await Promise.resolve(); });
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ testID: 'reset-password-error' }).children.join('')).toContain('at least 8 characters');
  });
  test('component rejects mismatched passwords without calling Supabase', async () => {
    mockConfigured = true;
    const tree = renderer.create(<ResetPasswordScreen />);
    act(() => { tree.root.findByProps({ testID: 'reset-password' }).props.onChangeText('longpassword'); tree.root.findByProps({ testID: 'reset-password-confirm' }).props.onChangeText('different'); });
    await act(async () => { tree.root.findByProps({ testID: 'reset-password-submit' }).props.onPress({}); await Promise.resolve(); });
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ testID: 'reset-password-error' }).children.join('')).toBe('Passwords do not match.');
  });
  test('successful reset signs out and routes to sign-in', async () => {
    mockConfigured = true;
    const tree = renderer.create(<ResetPasswordScreen />);
    act(() => { tree.root.findByProps({ testID: 'reset-password' }).props.onChangeText('new-password'); tree.root.findByProps({ testID: 'reset-password-confirm' }).props.onChangeText('new-password'); });
    await act(async () => { tree.root.findByProps({ testID: 'reset-password-submit' }).props.onPress({}); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'new-password' });
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/auth/signin?reset=complete');
  });
});
