import React from 'react';
import { Text } from 'react-native';
import renderer from 'react-test-renderer';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { useAuth } from '@/lib/AuthProvider';
import { textContent } from '../test-utils/textContent';

jest.mock('expo-router', () => { const Native = require('react-native'); return { Redirect: ({ href }: { href: string }) => <Native.Text testID="redirect-to">{href}</Native.Text>, useRouter: () => ({ canGoBack: () => false, back: jest.fn(), replace: jest.fn(), push: jest.fn() }) }; });
jest.mock('@/lib/AuthProvider', () => ({ useAuth: jest.fn() }));
const mockUseAuth = useAuth as jest.Mock;

beforeEach(() => mockUseAuth.mockReset());
describe('AuthGuard', () => {
  test('renders pending instead of protected children during session loading', () => {
    mockUseAuth.mockReturnValue({ loading: true, session: null, user: null, authMessage: null });
    const tree = renderer.create(<AuthGuard><Text>protected-secret</Text></AuthGuard>);
    expect(tree.root.findByProps({ testID: 'auth-guard-loading' })).toBeTruthy();
    expect(tree.root.findAllByType(Text).some((node) => node.children.includes('protected-secret'))).toBe(false);
  });
  test('redirects an unauthenticated visitor to sign in', () => {
    mockUseAuth.mockReturnValue({ loading: false, session: null, user: null, authMessage: null });
    const tree = renderer.create(<AuthGuard><Text>protected-secret</Text></AuthGuard>);
    expect(textContent(tree.root.findByProps({ testID: 'redirect-to' }).children)).toBe('/auth/signin');
  });
  test('adds the calm reauthentication reason after a refresh failure', () => {
    mockUseAuth.mockReturnValue({ loading: false, session: null, user: null, authMessage: 'Please sign in again.' });
    const tree = renderer.create(<AuthGuard><Text>protected-secret</Text></AuthGuard>);
    expect(textContent(tree.root.findByProps({ testID: 'redirect-to' }).children)).toBe('/auth/signin?reason=reauth');
  });
  test('renders protected content for a restored session', () => {
    mockUseAuth.mockReturnValue({ loading: false, session: { user: { id: 'u' } }, user: { id: 'u' }, authMessage: null });
    const tree = renderer.create(<AuthGuard><Text>protected-content</Text></AuthGuard>);
    expect(tree.root.findAllByType(Text).some((node) => node.children.includes('protected-content'))).toBe(true);
  });
});
