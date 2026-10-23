// Member-controlled "Pause my profile" switch: writes only is_paused (never is_discoverable).
import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockUpdate = jest.fn();
let mockUpdateResult: { error: unknown } = { error: null };
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), useLocalSearchParams: () => ({}), usePathname: () => '/profile/settings' }));
jest.mock('@/lib/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' }, session: {}, signOut: jest.fn() }) }));
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { country_code: 'PH', is_paused: false }, error: null }) }) }),
      update: (payload: Record<string, unknown>) => { mockUpdate(payload); return { eq: async () => mockUpdateResult }; },
    }),
  },
}));
jest.mock('@/constants/Motion', () => ({ MotionTransforms: { pressedOpacity: 0.85 }, getMotionConfig: () => ({ pressedScale: 1 }), useReducedMotion: () => true }));
// eslint-disable-next-line import/first
import SettingsScreen from '@/app/(tabs)/profile/settings';

async function mountSettings() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<SettingsScreen />); await Promise.resolve(); await Promise.resolve(); });
  return tree;
}

describe('pause my profile switch', () => {
  beforeEach(() => { mockUpdate.mockReset(); mockUpdateResult = { error: null }; });

  test('toggling writes is_paused only, never is_discoverable', async () => {
    const tree = await mountSettings();
    const sw = tree.root.findAll((n) => n.props.testID === 'scr-18-pause-switch' && typeof n.props.onValueChange === 'function')[0];
    await act(async () => { sw.props.onValueChange(true); await Promise.resolve(); });
    expect(mockUpdate).toHaveBeenCalledWith({ is_paused: true });
    expect(mockUpdate.mock.calls.every(([p]) => !('is_discoverable' in p))).toBe(true);
    expect(tree.root.findAll((n) => n.props.testID === 'scr-18-pause-switch')[0].props.value).toBe(true);
  });

  test('a failed save reverts the switch and shows a friendly note', async () => {
    mockUpdateResult = { error: { message: 'boom' } };
    const tree = await mountSettings();
    const sw = tree.root.findAll((n) => n.props.testID === 'scr-18-pause-switch' && typeof n.props.onValueChange === 'function')[0];
    await act(async () => { sw.props.onValueChange(true); await Promise.resolve(); });
    expect(tree.root.findAll((n) => n.props.testID === 'scr-18-pause-switch')[0].props.value).toBe(false);
    const note = tree.root.findAll((n) => n.props.testID === 'scr-18-pause-note')[0];
    expect(JSON.stringify(note.props.children)).toMatch(/Could not update your visibility/);
  });
});
