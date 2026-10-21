import React from 'react';
import renderer, { act } from 'react-test-renderer';
import SettingsScreen from '../notifications';

const mockLoad = jest.fn();
const mockSave = jest.fn();
const mockEnable = jest.fn();
jest.mock('@/lib/notifications', () => ({
  loadNotificationPreferences: (...args: unknown[]) => mockLoad(...args),
  saveNotificationPreferences: (...args: unknown[]) => mockSave(...args),
  enablePushAndRegister: (...args: unknown[]) => mockEnable(...args),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/hooks/useColorScheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('@/components/layout', () => ({ SettingsLayout: ({ children }: any) => <>{children}</> }));
jest.mock('@/components/state', () => ({ FormStateView: ({ children }: any) => <>{children}</> }));
jest.mock('@/components/ui', () => {
  const Native = require('react-native');
  return {
    Card: ({ children, ...props }: any) => <Native.View {...props}>{children}</Native.View>,
    Button: ({ label, onPress, testID }: any) => <Native.Pressable testID={testID} onPress={onPress}><Native.Text>{label}</Native.Text></Native.Pressable>,
  };
});

describe('push notification settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoad.mockResolvedValue({ matches_enabled: true, messages_enabled: true });
    mockSave.mockResolvedValue(undefined);
    mockEnable.mockResolvedValue(true);
  });

  test('shows separate Matches and Messages switches', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<SettingsScreen />); });
    expect(tree.root.findByProps({ testID: 'scr-18-matches-push-switch' }).props.accessibilityLabel).toBe('Match notifications');
    expect(tree.root.findByProps({ testID: 'scr-18-messages-push-switch' }).props.accessibilityLabel).toBe('Message notifications');
  });

  test('persists each preference independently', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<SettingsScreen />); });
    await act(async () => { tree.root.findByProps({ testID: 'scr-18-matches-push-switch' }).props.onValueChange(false); });
    expect(mockSave).toHaveBeenCalledWith({ matches_enabled: false, messages_enabled: true });
  });

  test('requests device permission only after explicit settings action', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<SettingsScreen />); });
    expect(mockEnable).not.toHaveBeenCalled();
    await act(async () => { tree.root.findByProps({ testID: 'scr-18-enable-device-push' }).props.onPress(); });
    expect(mockEnable).toHaveBeenCalledTimes(1);
  });
});
