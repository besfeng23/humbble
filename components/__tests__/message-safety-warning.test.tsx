import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { MessageBubble } from '@/components/messaging/MessageBubble';
import type { ChatMessage } from '@/lib/messaging';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

function hasTestId(root: ReactTestInstance, testID: string): boolean {
  return root.findAll(node => node.props.testID === testID).length > 0;
}
describe('message safety warning UX', () => {
  test('shows a visible safety banner above suspicious message text', async () => {
    const message: ChatMessage = { id: 'm1', conversation_id: 'c1', sender_id: 'u1', body: 'Send me money through gift cards', created_at: '2026-10-22T00:00:00Z', client_message_id: 'key-1' };
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<MessageBubble message={message} own={false} />); });
    expect(hasTestId(renderer.root, 'message-safety-warning')).toBe(true);
    expect(renderer.root.findAll(node => node.type === require('react-native').Text && node.props.children === 'Keep your conversation safe')).toHaveLength(1);
    renderer.unmount();
  });
  test('does not show the banner for an ordinary message', async () => {
    const message: ChatMessage = { id: 'm2', conversation_id: 'c1', sender_id: 'u1', body: 'Would you like to try a new coffee shop?', created_at: '2026-10-22T00:00:00Z', client_message_id: 'key-2' };
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<MessageBubble message={message} own={false} />); });
    expect(hasTestId(renderer.root, 'message-safety-warning')).toBe(false);
    renderer.unmount();
  });
});
