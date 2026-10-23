import React from 'react';
import renderer, { act } from 'react-test-renderer';
import LegalDocumentScreen from '../[slug]';

let mockSlug = 'privacy-notice';
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ slug: mockSlug }),
}));
jest.mock('@/hooks/useColorScheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('@/components/layout', () => ({ PublicLayout: ({ children }: any) => <>{children}</> }));
jest.mock('@/components/state', () => ({ EmptyState: () => null }));
jest.mock('@/components/ui', () => {
  const Native = require('react-native');
  return {
    Card: ({ children, ...p }: any) => <Native.View {...p}>{children}</Native.View>,
    Button: ({ label }: any) => <Native.Text>{label}</Native.Text>,
  };
});

const flat = (n: any): string =>
  typeof n === 'string' ? n : Array.isArray(n) ? n.map(flat).join(' ') : n?.children ? flat(n.children) : '';

async function render() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<LegalDocumentScreen />); });
  return flat(tree.toJSON() as any);
}

describe('in-app Privacy Notice data-request section (Themis N45-02)', () => {
  beforeEach(() => { mockSlug = 'privacy-notice'; });

  test('no longer promises self-service / permanent deletion "at any time"', async () => {
    const text = await render();
    expect(text).not.toMatch(/self-service/i);
    expect(text).not.toMatch(/at any time/i);
    expect(text).not.toMatch(/permanent account deletion/i);
    expect(text).not.toMatch(/portable data export/i);
  });

  test('says requests are recorded and handled manually, not automatic, account stays active, no timeline', async () => {
    const text = await render();
    expect(text).toMatch(/recorded in the app and handled manually/i);
    expect(text).toMatch(/not automatic yet/i);
    expect(text).toMatch(/account stays active until a request has been processed/i);
    expect(text).not.toMatch(/within \d+|\d+ (days|hours)|immediately|guarantee/i);
  });
});
