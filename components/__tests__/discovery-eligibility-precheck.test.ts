// D9: ineligible members must not trigger the 403 get_discovery_feed request.
const mockRpc = jest.fn();
let mockProfile: Record<string, unknown> | null = null;
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockProfile, error: null }) }) }) }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'x' }, error: null }) }) },
  },
}));
// eslint-disable-next-line import/first
import { getDiscoveryPage } from '@/lib/discovery';
// eslint-disable-next-line import/first
import { toFriendlyDiscoveryError } from '@/lib/discoveryErrors';

describe('discovery eligibility precheck', () => {
  beforeEach(() => mockRpc.mockReset());
  test('unverified member gets the friendly ineligible state without calling the RPC', async () => {
    mockProfile = { verification_status: 'not_started', is_discoverable: false, is_suspended: false };
    const err = await getDiscoveryPage(null).catch((e) => e);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(toFriendlyDiscoveryError(err).action).toBe('verify');
  });
  test('verified member still loads from the server', async () => {
    mockProfile = { verification_status: 'verified', is_discoverable: true, is_suspended: false };
    mockRpc.mockResolvedValue({ data: [], error: null });
    await expect(getDiscoveryPage(null)).resolves.toEqual({ items: [], nextCursor: null });
    expect(mockRpc).toHaveBeenCalledWith('get_discovery_feed', expect.anything());
  });
});
