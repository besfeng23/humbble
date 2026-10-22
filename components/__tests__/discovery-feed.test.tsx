import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { DiscoveryFeed } from '@/components/discovery/DiscoveryFeed';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

function hasTestId(root: ReactTestInstance, testID: string): boolean {
  return root.findAll((node) => node.props.testID === testID).length > 0;
}

describe('development discovery previews', () => {
  const renderPreview = async (state: 'feed' | 'empty' | 'quota' | 'error' | 'match' | 'ineligible') => {
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<DiscoveryFeed previewState={state} />); });
    return renderer;
  };
  test('renders feed preview without querying production data', async () => {
    const renderer = await renderPreview('feed');
    expect(hasTestId(renderer.root, 'discovery-feed')).toBe(true);
    renderer.unmount();
  });
  test('renders empty, quota, error, and match states', async () => {
    for (const [state, expected] of [
      ['empty', 'discovery-empty'], ['quota', 'discovery-quota'],
      ['error', 'discovery-error'], ['match', 'discovery-match'],
    ] as const) {
      const renderer = await renderPreview(state);
      expect(hasTestId(renderer.root, expected)).toBe(true);
      renderer.unmount();
    }
  });
  test('ineligible actor sees friendly verification copy and a verify button, never the raw RPC code', async () => {
    const renderer = await renderPreview('ineligible');
    expect(hasTestId(renderer.root, 'discovery-verify-btn')).toBe(true);
    const text = renderer.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children).join(' ');
    expect(text).not.toContain('actor_not_eligible');
    expect(text).toMatch(/Finish verification/);
    renderer.unmount();
  });
});
