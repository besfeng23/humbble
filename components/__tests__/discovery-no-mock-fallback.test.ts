// If the legacy DB/userDB fixtures are absent (production: empty arrays) or unavailable,
// discovery must still come only from get_discovery_feed and never fall back to fixtures.
jest.mock('@/DB/userDB', () => { throw new Error('DB/userDB must not be loaded by the production discovery path'); });

const mockRpc = jest.fn();
let mockConfigured = true;
jest.mock('@/lib/supabase', () => ({
  get isSupabaseConfigured() { return mockConfigured; },
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.example/p.jpg' }, error: null }) }) },
  },
}));

import { getDiscoveryPage } from '@/lib/discovery';

const serverRow = {
  profile_id: '00000000-0000-0000-0000-000000000301', display_name: 'Server Person', age: 30, city_region: 'Manila',
  relationship_intention: 'long_term_dating', shared_interests: [], primary_photo_path: 'u/1.jpg', cursor_created_at: '2026-10-22T00:00:00Z',
};

describe('production discovery has no mock-data source', () => {
  beforeEach(() => { mockRpc.mockReset(); mockConfigured = true; });

  test('feed rows come only from get_discovery_feed even when userDB is unavailable', async () => {
    mockRpc.mockResolvedValue({ data: [serverRow], error: null });
    const page = await getDiscoveryPage(null);
    expect(mockRpc).toHaveBeenCalledWith('get_discovery_feed', expect.objectContaining({ p_limit: 20 }));
    expect(page.items.map((i) => i.display_name)).toEqual(['Server Person']);
  });

  test('an empty server response stays empty (no fixture fallback)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await expect(getDiscoveryPage(null)).resolves.toEqual({ items: [], nextCursor: null });
  });

  test('server errors and unconfigured builds surface errors instead of fixtures', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom', code: '42501' } });
    await expect(getDiscoveryPage(null)).rejects.toThrow('boom');
    mockConfigured = false;
    await expect(getDiscoveryPage(null)).rejects.toThrow(/unavailable/);
  });
});
