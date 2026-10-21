import { appendUniqueProfiles, getDiscoveryPage, type DiscoveryCard } from './discovery';
import { supabase } from './supabase';

jest.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: jest.fn(),
    storage: { from: jest.fn(() => ({ createSignedUrl: jest.fn(async (path: string) => ({ data: { signedUrl: `signed:${path}` }, error: null })) })) },
  },
}));

const row = (id: string, cursor: string) => ({
  profile_id: id, display_name: id, age: 25, city_region: 'Manila',
  relationship_intention: 'serious_relationship', shared_interests: [],
  primary_photo_path: `${id}/main.jpg`, cursor_created_at: cursor,
});

describe('getDiscoveryPage', () => {
  beforeEach(() => jest.clearAllMocks());
  test('uses the server cursor and maps private object paths to signed URLs', async () => {
    (supabase.rpc as jest.Mock)
      .mockResolvedValueOnce({ data: [row('a', '2026-10-20T00:00:00Z'), row('b', '2026-10-19T00:00:00Z')], error: null })
      .mockResolvedValueOnce({ data: [row('c', '2026-10-18T00:00:00Z')], error: null });
    const first = await getDiscoveryPage(null, 2);
    const second = await getDiscoveryPage(first.nextCursor, 2);
    expect(first.items.map((item) => item.profile_id)).toEqual(['a', 'b']);
    expect(first.items[0].imageUrl).toBe('signed:a/main.jpg');
    expect(first.nextCursor).toBe('2026-10-19T00:00:00Z');
    expect(second.items.map((item) => item.profile_id)).toEqual(['c']);
    expect(second.nextCursor).toBeNull();
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'get_discovery_feed', { p_limit: 2, p_cursor: first.nextCursor });
  });
});

test('cursor page merging excludes duplicate profile ids without changing order', () => {
  const make = (profile_id: string) => ({ profile_id, display_name: profile_id, age: 25, city_region: 'Manila', relationship_intention: 'serious_relationship', shared_interests: [], primary_photo_path: '', imageUrl: null, cursorCreatedAt: '2026-10-20T00:00:00Z' }) as unknown as DiscoveryCard;
  const seen = new Set(['already-seen']);
  const result = appendUniqueProfiles([make('already-seen'), make('new-a'), make('new-a'), make('new-b')], seen);
  expect(result.map((item) => item.profile_id)).toEqual(['new-a', 'new-b']);
});
