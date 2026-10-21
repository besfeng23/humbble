import { supabase } from '@/lib/supabase';
import { ACCEPTED_PHOTO_MIME, MAX_PHOTO_BYTES, MAX_PHOTOS, validatePhoto } from './profile';

const BUCKET = 'profile_photos';
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
};
type PhotoFile = { uri: string; type?: string | null; size?: number | null; name?: string | null };
type PhotoRow = { id: string; storage_path: string; position: number };

/** Upload object first, then metadata. Every failure after object creation attempts compensating removal. */
export async function uploadProfilePhoto(userId: string, file: PhotoFile): Promise<PhotoRow> {
  const validation = validatePhoto({ type: file.type, size: file.size }, false);
  if (!validation.valid) throw new Error(validation.reason);
  const { data: existing, error: listError } = await supabase.from('profile_photos')
    .select('id,position').eq('user_id', userId).order('position');
  if (listError) throw listError;
  if ((existing?.length ?? 0) >= MAX_PHOTOS) throw new Error('You can add up to six photos.');

  const response = await fetch(file.uri);
  if (!response.ok) throw new Error('Could not read the selected photo. Please choose it again.');
  const body = await response.blob();
  const actualType = (body.type || '').toLowerCase();
  const declaredType = (file.type || '').toLowerCase();
  const mime = ACCEPTED_PHOTO_MIME.includes(actualType as (typeof ACCEPTED_PHOTO_MIME)[number])
    ? actualType
    : (!actualType || actualType === 'application/octet-stream') ? declaredType : actualType;
  const blobValidation = validatePhoto({ type: mime, size: body.size });
  if (!blobValidation.valid || !ACCEPTED_PHOTO_MIME.includes(mime as (typeof ACCEPTED_PHOTO_MIME)[number]) || body.size > MAX_PHOTO_BYTES) {
    throw new Error(blobValidation.valid ? 'The selected photo failed file validation.' : blobValidation.reason);
  }

  // MIME—not the untrusted filename—determines the object extension.
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${EXTENSION_BY_MIME[mime]}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: mime, upsert: false });
  if (uploadError) throw uploadError;
  try {
    const usedPositions = new Set((existing ?? []).map((row) => row.position));
    const position = Array.from({ length: MAX_PHOTOS }, (_, index) => index).find((candidate) => !usedPositions.has(candidate));
    if (position == null) throw new Error('No available photo position remains.');
    const { data, error } = await supabase.from('profile_photos')
      .insert({ user_id: userId, storage_path: path, position })
      .select('id,position,storage_path').single();
    if (error) throw error;
    return data as PhotoRow;
  } catch (error) {
    const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([path]);
    if (cleanupError) throw new Error(`Photo metadata could not be saved and upload cleanup also failed. Retry cleanup for ${path}.`);
    throw error;
  }
}

async function updatePosition(userId: string, id: string, position: number) {
  const { error } = await supabase.from('profile_photos').update({ position }).eq('user_id', userId).eq('id', id);
  if (error) throw error;
}

/**
 * Reorder through the existing UNIQUE(user_id, position) constraint without transient collisions.
 * Migration 0006 extends the CHECK range to 0..11; positions 6..11 are temporary only.
 * If any REST update fails, a retry can resume staging by moving the remaining low rows into free slots.
 */
export async function reorderProfilePhotos(userId: string, orderedIds: string[]): Promise<void> {
  const { data, error } = await supabase.from('profile_photos').select('id,position').eq('user_id', userId).order('position');
  if (error) throw error;
  const rows = (data ?? []) as Pick<PhotoRow, 'id' | 'position'>[];
  if (orderedIds.length !== rows.length || new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !rows.some((row) => row.id === id))) {
    throw new Error('Photo order must include every one of your photos exactly once.');
  }
  if (rows.length > MAX_PHOTOS) throw new Error('A profile cannot contain more than six photos.');

  const highOccupied = new Set(rows.filter((row) => row.position >= MAX_PHOTOS).map((row) => row.position));
  const freeSlots = Array.from({ length: MAX_PHOTOS }, (_, i) => MAX_PHOTOS + i).filter((slot) => !highOccupied.has(slot));
  for (const row of rows.filter((photo) => photo.position < MAX_PHOTOS)) {
    const free = freeSlots.shift();
    if (free == null) throw new Error('Photo ordering could not be staged safely. Retry.');
    await updatePosition(userId, row.id, free);
  }

  for (const [position, id] of orderedIds.entries()) await updatePosition(userId, id, position);
}

/** Delete metadata first; restore it best-effort if Storage refuses object removal. */
export async function deleteProfilePhoto(userId: string, photoId: string): Promise<void> {
  const { data: photo, error: lookupError } = await supabase.from('profile_photos')
    .select('id,storage_path,position').eq('id', photoId).eq('user_id', userId).single();
  if (lookupError) throw lookupError;
  const { error: deleteError } = await supabase.from('profile_photos').delete().eq('id', photoId).eq('user_id', userId);
  if (deleteError) throw deleteError;
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([photo.storage_path]);
  if (!removeError) {
    const { data: remaining, error: listError } = await supabase.from('profile_photos').select('id,position').eq('user_id', userId).order('position');
    if (listError) throw new Error('Photo was removed, but the remaining order could not be loaded. Refresh and retry ordering.');
    try { await reorderProfilePhotos(userId, (remaining ?? []).map((row) => row.id)); }
    catch { throw new Error('Photo was removed, but remaining photos could not be reordered. Use the photo order controls to retry.'); }
    return;
  }
  const { error: restoreError } = await supabase.from('profile_photos').insert({
    user_id: userId, storage_path: photo.storage_path, position: photo.position,
  });
  if (restoreError) throw new Error('Storage removal failed and the photo row could not be restored. Contact support before retrying.');
  throw removeError;
}

export async function createProfilePhotoSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
