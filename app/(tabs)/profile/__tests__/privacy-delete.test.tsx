import React from 'react';
import renderer, { act } from 'react-test-renderer';
import PrivacyScreen from '../privacy-delete';

const mockRequest = jest.fn();
const mockLoad = jest.fn();
let mockKeyCounter = 0;
jest.mock('@/lib/rpc', () => ({ requestPrivacyAction: (...a: unknown[]) => mockRequest(...a) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/privacy', () => {
  const actual = jest.requireActual('@/lib/privacy');
  return {
    ...actual,
    loadMyPrivacyRequests: (...a: unknown[]) => mockLoad(...a),
    newPrivacyIdempotencyKey: () => `key-${++mockKeyCounter}`,
  };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
jest.mock('@/hooks/useColorScheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('@/components/layout', () => ({ SettingsLayout: ({ children }: any) => <>{children}</> }));
jest.mock('@/components/state', () => {
  const Native = require('react-native');
  return {
    FormStateView: ({ status, successTitle, successMessage, failureTitle, failureMessage, children }: any) => (
      <Native.View>
        <Native.Text testID="state-status">{status}</Native.Text>
        {status === 'success' && <Native.Text testID="state-text">{`${successTitle} | ${successMessage}`}</Native.Text>}
        {status === 'failure' && <Native.Text testID="state-text">{`${failureTitle} | ${failureMessage}`}</Native.Text>}
        {children}
      </Native.View>
    ),
  };
});
jest.mock('@/components/ui', () => {
  const Native = require('react-native');
  return {
    Card: ({ children, ...p }: any) => <Native.View {...p}>{children}</Native.View>,
    Button: ({ label, onPress, testID, disabled }: any) => (
      <Native.Pressable testID={testID} onPress={disabled ? undefined : onPress} accessibilityState={{ disabled: !!disabled }}>
        <Native.Text>{label}</Native.Text>
      </Native.Pressable>
    ),
    TextField: ({ testID, value, onChangeText }: any) => <Native.TextInput testID={testID} value={value} onChangeText={onChangeText} />,
  };
});

const REF = '9f8e7d6c-1111-4222-8333-444455556666';
const flat = (n: any): string =>
  typeof n === 'string' ? n : Array.isArray(n) ? n.map(flat).join('') : n?.children ? flat(n.children) : '';
const text = (tree: renderer.ReactTestRenderer, id: string) => flat(tree.root.findByProps({ testID: id }).children);

async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<PrivacyScreen />); });
  return tree;
}
const press = (tree: renderer.ReactTestRenderer, id: string) =>
  act(async () => { await tree.root.findByProps({ testID: id }).props.onPress(); });
const typeConfirm = (tree: renderer.ReactTestRenderer, v: string) =>
  act(async () => { tree.root.findByProps({ testID: 'scr-19-confirm-input' }).props.onChangeText(v); });

beforeEach(() => {
  jest.clearAllMocks();
  mockKeyCounter = 0;
  mockLoad.mockResolvedValue([]);
  mockRequest.mockResolvedValue({ data: REF, error: null });
});

describe('SCR-19 privacy request screen (LB-1)', () => {
  test('does not call the RPC and does not claim success when the confirmation phrase is wrong', async () => {
    const tree = await mount();
    await typeConfirm(tree, 'delete');
    await press(tree, 'scr-19-delete-btn');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(text(tree, 'state-status')).toBe('failure');
    expect(text(tree, 'state-text')).toMatch(/exact phrase/);
  });

  test('export press calls request_privacy_action once and reports "recorded", not "exported"', async () => {
    const tree = await mount();
    await press(tree, 'scr-19-export-btn');
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith('export', 'key-1');
    expect(text(tree, 'state-status')).toBe('success');
    const msg = text(tree, 'state-text');
    expect(msg).toMatch(/recorded/i);
    expect(msg).toMatch(/9F8E7D6C/);
    expect(msg).toMatch(/nothing is exported or deleted automatically/i);
    expect(msg).not.toMatch(/queued|sessions are revoked|purged/i);
  });

  test('deletion with the exact phrase calls the RPC with type deletion and says the account stays active', async () => {
    const tree = await mount();
    await typeConfirm(tree, '  DELETE MY ACCOUNT ');
    await press(tree, 'scr-19-delete-btn');
    expect(mockRequest).toHaveBeenCalledWith('deletion', 'key-1');
    expect(text(tree, 'state-text')).toMatch(/account stays active/i);
  });

  test('a network failure keeps the same idempotency key for the retry', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Network request failed'));
    const tree = await mount();
    await press(tree, 'scr-19-export-btn');
    expect(text(tree, 'state-status')).toBe('failure');
    expect(text(tree, 'state-text')).toMatch(/Nothing was changed/);
    await press(tree, 'scr-19-export-btn');
    expect(mockRequest.mock.calls.map((c) => c[1])).toEqual(['key-1', 'key-1']);
    expect(text(tree, 'state-status')).toBe('success');
  });

  test('after a recorded request the next attempt uses a fresh key', async () => {
    const tree = await mount();
    await press(tree, 'scr-19-export-btn');
    mockLoad.mockResolvedValue([]);
    await press(tree, 'scr-19-export-btn');
    expect(mockRequest.mock.calls.map((c) => c[1])).toEqual(['key-1', 'key-2']);
  });

  test('an existing open request blocks a second submit without calling the RPC', async () => {
    mockLoad.mockResolvedValue([{ id: REF, request_type: 'export', status: 'requested', created_at: '2026-10-24T01:00:00Z', completed_at: null }]);
    const tree = await mount();
    expect(text(tree, `scr-19-request-${REF}`)).toMatch(/Data export - Received - not processed yet/);
    await press(tree, 'scr-19-export-btn');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(text(tree, 'state-text')).toMatch(/already have an open request/i);
  });

  test('a database already-open error is shown as such', async () => {
    mockRequest.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'privacy_request_already_open', details: '', hint: '' } });
    const tree = await mount();
    await press(tree, 'scr-19-export-btn');
    expect(text(tree, 'state-text')).toMatch(/already have an open request/i);
  });

  test('an ended session asks the member to sign in again and records nothing', async () => {
    mockRequest.mockResolvedValue({ data: null, error: { code: '42501', message: 'authentication_required', details: '', hint: '' } });
    const tree = await mount();
    await press(tree, 'scr-19-export-btn');
    expect(text(tree, 'state-text')).toMatch(/sign in again/i);
  });

  test('shows an honest message when earlier requests cannot be loaded, and still renders', async () => {
    mockLoad.mockResolvedValue(null);
    const tree = await mount();
    expect(text(tree, 'scr-19-requests-unavailable')).toMatch(/could not be loaded/);
  });

  test('screen copy never claims immediate deletion, session revocation or export delivery', async () => {
    const tree = await mount();
    const all = flat(tree.toJSON() as any);
    expect(all).not.toMatch(/Permanently Delete|immediately disables|revokes active sessions|purges your profile/i);
    expect(all).toMatch(/not automatic yet/i);
  });
});
