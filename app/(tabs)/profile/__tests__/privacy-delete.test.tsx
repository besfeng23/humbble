import React from 'react';
import renderer, { act } from 'react-test-renderer';
import PrivacyScreen from '../privacy-delete';

const mockRequest = jest.fn();
const mockLoad = jest.fn();
let mockKeyCounter = 0;
let mockKeyFactory: (() => string) | null = null;
let mockAuth: { user: { id: string } | null; loading: boolean } = { user: { id: 'user-1' }, loading: false };
jest.mock('@/lib/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/lib/rpc', () => ({ requestPrivacyAction: (...a: unknown[]) => mockRequest(...a) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/privacy', () => {
  const actual = jest.requireActual('@/lib/privacy');
  return {
    ...actual,
    loadMyPrivacyRequests: (...a: unknown[]) => mockLoad(...a),
    newPrivacyIdempotencyKey: () => (mockKeyFactory ? mockKeyFactory() : `key-${++mockKeyCounter}`),
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
  mockKeyFactory = null;
  mockAuth = { user: { id: 'user-1' }, loading: false };
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

// Themis PR #45 review extra tests (N45-05): kill the log-the-key/log-the-error, double-tap, 42501 and auto-retry mutants and guard the copy.
describe('Themis PR #45 extra tests (N45-05)', () => {
  const spies = () => ['log','info','warn','error','debug'].map((m) => jest.spyOn(console, m as any).mockImplementation(() => {}));
  test('concurrent double tap -> one RPC call', async () => {
    let resolve!: (v: any) => void;
    mockRequest.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const tree = await mount();
    const btn = tree.root.findByProps({ testID: 'scr-19-export-btn' });
    await act(async () => { btn.props.onPress(); btn.props.onPress(); });
    await act(async () => { resolve({ data: REF, error: null }); });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
  test('raw server error text/SQLSTATE/key never reach UI nor console, for every outcome', async () => {
    const s = spies();
    const errs = [
      { code: '08006', message: 'SQLSTATE 08006 connection failure at db.internal.example:5432', details: 'password=hunter2', hint: 'x' },
      { code: '42501', message: 'permission denied for function request_privacy_action', details: '', hint: '' },
      { code: 'PGRST301', message: 'JWT expired eyJhbGciOi.secret.token', details: '', hint: '' },
      { code: '22023', message: 'request_type_and_idempotency_key_required', details: '', hint: '' },
      { code: '23505', message: 'duplicate key value violates unique constraint uq_privacy_requests_user_idempotency', details: 'Key (user_id, idempotency_key)=(u, k) already exists.', hint: '' },
    ];
    for (const e of errs) {
      mockRequest.mockResolvedValue({ data: null, error: e });
      const tree = await mount();
      await press(tree, 'scr-19-export-btn');
      expect(flat(tree.toJSON() as any)).not.toMatch(/SQLSTATE|hunter2|eyJ|permission denied|uq_privacy|duplicate key|db\.internal|idempotency|request_privacy_action|key-\d/i);
    }
    for (const sp of s) expect(sp).not.toHaveBeenCalled();
    s.forEach((sp) => sp.mockRestore());
  });
  test('rpc error object keeps key for retry; no automatic retry', async () => {
    mockRequest.mockResolvedValue({ data: null, error: { code: '08006', message: 'x', details: '', hint: '' } });
    const tree = await mount();
    await press(tree, 'scr-19-export-btn');
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    await press(tree, 'scr-19-export-btn');
    expect(mockRequest.mock.calls.map((c) => c[1])).toEqual(['key-1', 'key-1']);
  });
  test('42501 without recognisable message still asks to sign in', async () => {
    mockRequest.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied for function request_privacy_action', details: '', hint: '' } });
    const tree = await mount();
    await press(tree, 'scr-19-export-btn');
    expect(text(tree, 'state-text')).toMatch(/sign in again/i);
  });
  test('no timeline / legal commitment wording on any success copy', async () => {
    const tree = await mount();
    await press(tree, 'scr-19-export-btn');
    await typeConfirm(tree, 'DELETE MY ACCOUNT');
    await press(tree, 'scr-19-delete-btn');
    expect(flat(tree.toJSON() as any)).not.toMatch(/within \d+|\d+ (days|hours)|guarantee|will be (deleted|exported|emailed)/i);
  });
});

describe('SCR-19 hardening (Themis N45-04 / N45-06)', () => {
  test('signed out: no RPC call, no key minted, no list load, and the member is told to sign in', async () => {
    mockAuth = { user: null, loading: false };
    mockKeyFactory = jest.fn(() => 'should-not-be-called');
    const tree = await mount();
    expect(mockLoad).not.toHaveBeenCalled();
    await press(tree, 'scr-19-export-btn');
    await typeConfirm(tree, 'DELETE MY ACCOUNT');
    await press(tree, 'scr-19-delete-btn');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockKeyFactory).not.toHaveBeenCalled();
    expect(text(tree, 'state-status')).toBe('failure');
    expect(text(tree, 'state-text')).toMatch(/Please sign in/);
    expect(text(tree, 'state-text')).toMatch(/Nothing was recorded/);
  });

  test('session still resolving: no RPC call and a "try again in a moment" message', async () => {
    mockAuth = { user: null, loading: true };
    const tree = await mount();
    await press(tree, 'scr-19-export-btn');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(text(tree, 'state-text')).toMatch(/try again in a moment/i);
  });

  test('foreign-key error (no profiles row) is NOT reported as a connection problem and is not retried with the same key', async () => {
    mockRequest.mockResolvedValue({ data: null, error: { code: '23503', message: 'insert or update on table "privacy_requests" violates foreign key constraint "privacy_requests_user_id_fkey"', details: 'Key (user_id)=(u) is not present in table "profiles".', hint: '' } });
    const tree = await mount();
    await press(tree, 'scr-19-export-btn');
    const msg = text(tree, 'state-text');
    expect(msg).toMatch(/profile is not set up yet/i);
    expect(msg).not.toMatch(/connection/i);
    expect(msg).not.toMatch(/foreign key|privacy_requests|profiles"|user_id/i);
    await press(tree, 'scr-19-export-btn');
    expect(mockRequest.mock.calls.map((c) => c[1])).toEqual(['key-1', 'key-2']);
  });

  test('no secure random source: fails closed (RPC never called) with a non-retryable message', async () => {
    mockKeyFactory = () => { throw new Error('secure_random_unavailable'); };
    const tree = await mount();
    await press(tree, 'scr-19-export-btn');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(text(tree, 'state-status')).toBe('failure');
    expect(text(tree, 'state-text')).toMatch(/cannot create a secure request reference/i);
    expect(text(tree, 'state-text')).toMatch(/nothing was recorded/i);
  });
});
