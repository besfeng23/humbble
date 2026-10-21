jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), storage: { from: jest.fn() } } }));
import { supabase } from '@/lib/supabase';
import { deleteProfilePhoto, reorderProfilePhotos, uploadProfilePhoto } from '@/lib/onboarding/photos';

const db = supabase as unknown as { from: jest.Mock; storage: { from: jest.Mock } };
function chain(overrides: Record<string, unknown> = {}) {
  const builder: any = { select: jest.fn(() => builder), insert: jest.fn(() => builder), update: jest.fn(() => builder), delete: jest.fn(() => builder), eq: jest.fn(() => builder), order: jest.fn(async () => ({ data: [], error: null })), single: jest.fn(async () => ({ data: { id: 'new', position: 0, storage_path: 'u/path.jpg' }, error: null })), then: undefined, ...overrides };
  return builder;
}
function storage(overrides: { uploadError?: unknown; removeError?: unknown } = {}) {
  const api = { upload: jest.fn(async () => ({ error: overrides.uploadError ?? null })), remove: jest.fn(async () => ({ error: overrides.removeError ?? null })), createSignedUrl: jest.fn(async () => ({ data: { signedUrl: 'signed' }, error: null })) };
  db.storage.from.mockReturnValue(api);
  return api;
}

beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn(async () => ({ ok: true, blob: async () => ({ type: 'image/jpeg', size: 8 }) } as unknown as Response)); });

describe('profile photo pipeline compensation and ordering', () => {
  it('does not insert metadata if storage upload fails', async () => {
    const select = chain(); select.order.mockResolvedValue({ data: [], error: null });
    db.from.mockReturnValue(select); storage({ uploadError: new Error('storage unavailable') });
    await expect(uploadProfilePhoto('u', { uri: 'file:///photo.jpg', type: 'image/jpeg', size: 8 })).rejects.toThrow('storage unavailable');
    expect(select.insert).not.toHaveBeenCalled();
  });

  it('removes the uploaded object when metadata insert fails', async () => {
    const select = chain(); select.order.mockResolvedValue({ data: [], error: null });
    select.single.mockResolvedValue({ data: null, error: new Error('metadata rejected') });
    db.from.mockReturnValue(select); const bucket = storage();
    await expect(uploadProfilePhoto('u', { uri: 'file:///photo.jpg', type: 'image/jpeg', size: 8 })).rejects.toThrow('metadata rejected');
    expect(bucket.remove).toHaveBeenCalledWith([expect.stringMatching(/^u\//)]);
  });

  it('rejects foreign ids, duplicates, and missing ids before updates', async () => {
    const query = chain(); query.order.mockResolvedValue({ data: [{ id: 'a', position: 0 }, { id: 'b', position: 1 }], error: null });
    db.from.mockReturnValue(query);
    await expect(reorderProfilePhotos('u', ['a', 'foreign'])).rejects.toThrow('every one of your photos');
    await expect(reorderProfilePhotos('u', ['a', 'a'])).rejects.toThrow('every one of your photos');
    await expect(reorderProfilePhotos('u', ['a'])).rejects.toThrow('every one of your photos');
    expect(query.update).not.toHaveBeenCalled();
  });

  it('writes contiguous positions 0..n-1 after collision-free staging', async () => {
    const query = chain(); query.order.mockResolvedValue({ data: [{ id: 'a', position: 0 }, { id: 'b', position: 1 }, { id: 'c', position: 2 }], error: null });
    db.from.mockReturnValue(query);
    await reorderProfilePhotos('u', ['c', 'a', 'b']);
    const updates = query.update.mock.calls.map((call: unknown[]) => call[0]);
    expect(updates.slice(-3)).toEqual([{ position: 0 }, { position: 1 }, { position: 2 }]);
    expect(query.eq).toHaveBeenCalledWith('user_id', 'u');
  });

  it('does not remove the storage object when the metadata-row delete fails', async () => {
    const lookup = chain(); lookup.single.mockResolvedValue({ data: { id: 'a', storage_path: 'u/a.jpg', position: 0 }, error: null });
    lookup.eq.mockReturnValue(lookup);
    lookup.delete.mockReturnValue(lookup);
    // Every awaited query-builder promise resolves to the configured error payload.
    lookup.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ error: new Error('row delete rejected') }).then(resolve);
    db.from.mockReturnValue(lookup); const bucket = storage();
    await expect(deleteProfilePhoto('u', 'a')).rejects.toThrow('row delete rejected');
    expect(bucket.remove).not.toHaveBeenCalled();
  });
});
