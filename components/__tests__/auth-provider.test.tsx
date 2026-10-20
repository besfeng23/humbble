import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { AuthProvider, useAuth } from '@/lib/AuthProvider';

jest.mock('@/lib/supabase', () => {
  const listeners: Array<(event: string, session: any) => void> = [];
  const auth = {
    onAuthStateChange: jest.fn((callback: (event: string, session: any) => void) => {
      listeners.push(callback);
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
    getSession: jest.fn(),
    signOut: jest.fn().mockResolvedValue({ error: null }),
  };
  return { isSupabaseConfigured: true, supabase: { auth }, __listeners: listeners };
});

function Probe() {
  const { loading, session, authMessage } = useAuth();
  return <Text>{loading ? 'loading' : session ? `session:${session.user.id}` : `signed-out:${authMessage ?? ''}`}</Text>;
}
const mockSupabase = require('@/lib/supabase');
const fakeSession = { user: { id: 'restored-user', app_metadata: {}, user_metadata: {} } };

beforeEach(() => {
  mockSupabase.__listeners.length = 0;
  mockSupabase.supabase.auth.getSession.mockReset().mockResolvedValue({ data: { session: fakeSession }, error: null });
  mockSupabase.supabase.auth.signOut.mockReset().mockResolvedValue({ error: null });
});

describe('AuthProvider session authority', () => {
  test('restores the persisted session before exposing the app, including after remount', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<AuthProvider><Probe /></AuthProvider>); await Promise.resolve(); await Promise.resolve(); });
    expect(tree.root.findByType(Text).children.join('')).toBe('session:restored-user');
    act(() => tree.unmount());
    await act(async () => { tree = renderer.create(<AuthProvider><Probe /></AuthProvider>); await Promise.resolve(); await Promise.resolve(); });
    expect(tree.root.findByType(Text).children.join('')).toBe('session:restored-user');
  });
  test('clears the local session when hydration reports an expired or invalid session', async () => {
    mockSupabase.supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('expired session') });
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<AuthProvider><Probe /></AuthProvider>); await Promise.resolve(); await Promise.resolve(); });
    expect(mockSupabase.supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(tree.root.findByType(Text).children.join('')).toBe('signed-out:Please sign in again.');
  });
  test('sets a calm reauthentication message after an unexpected sign-out', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<AuthProvider><Probe /></AuthProvider>); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { mockSupabase.__listeners[0]('SIGNED_OUT', null); });
    expect(tree.root.findByType(Text).children.join('')).toBe('signed-out:Please sign in again.');
  });
  test('clears session and does not mark a user-requested sign-out as expired', async () => {
    let tree!: renderer.ReactTestRenderer;
    function SignOutProbe() { const auth = useAuth(); return <Text onPress={() => void auth.signOut()}>{auth.session ? 'signed-in' : `signed-out:${auth.authMessage ?? ''}`}</Text>; }
    await act(async () => { tree = renderer.create(<AuthProvider><SignOutProbe /></AuthProvider>); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { tree.root.findByType(Text).props.onPress(); await Promise.resolve(); });
    expect(tree.root.findByType(Text).children.join('')).toBe('signed-out:');
  });
});
