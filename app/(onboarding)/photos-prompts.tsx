import { useLocalSearchParams, useRouter } from 'expo-router';
import { toFriendlyMessage } from '@/lib/friendlyErrors';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { AuthNotice, AuthPrimaryButton } from '@/components/layout/AuthScreen';
import { OnboardingLayout } from '@/components/layout';
import { Button, CountryPicker, TextField } from '@/components/ui';
import { defaultCountryFromLocale, normalizeCountryCode } from '@/lib/countries';
import { Colors } from '@/constants/Colors';
import { Spacing } from '@/constants/Spacing';
import { Typography } from '@/constants/Typography';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/lib/AuthProvider';
import type { Json } from '@/lib/database.contracts';
import { clearProfileDraft, loadProfileDraftState, saveProfileDraft } from '@/lib/onboarding/drafts';
import { createProfilePhotoSignedUrl, deleteProfilePhoto, reorderProfilePhotos, uploadProfilePhoto } from '@/lib/onboarding/photos';
import { MAX_PHOTOS, MIN_PHOTOS, PROFILE_PROMPTS, isProfileComplete, toProfilePrompts, type ProfilePromptAnswers } from '@/lib/onboarding/profile';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type Photo = { id: string; storage_path: string; position: number; signedUrl: string | null };
type Profile = { display_name: string; birth_date: string; city_region: string | null; country_code?: string | null; relationship_intention: string | null; prompts: Json | null };
const EMPTY_ANSWERS: ProfilePromptAnswers = { weekend: '', values: '', relationship_goal: '' };
const previewAnswers: ProfilePromptAnswers = {
  weekend: 'A slow Sunday with coffee, a good book, and a new place to explore.',
  values: 'Kindness, openness, and following through on what we say.',
  relationship_goal: 'A committed relationship built on trust and shared curiosity.',
};

export default function OnboardingPhotosPromptsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ preview?: string }>();
  const { user } = useAuth();
  const palette = Colors[useColorScheme() ?? 'light'];
  const preview = __DEV__ ? String(params.preview ?? '') : '';
  const previewAllowed = ['empty', 'under-two', 'complete', 'save-error'].includes(preview);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [answers, setAnswers] = useState<ProfilePromptAnswers>(EMPTY_ANSWERS);
  const [cityRegion, setCityRegion] = useState('');
  const [country, setCountry] = useState<string | null>(() => defaultCountryFromLocale());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSaveRef = useRef<Promise<void> | null>(null);

  const refreshPhotos = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('profile_photos').select('id,storage_path,position').eq('user_id', userId).order('position');
    if (error) throw error;
    const withUrls = await Promise.all((data ?? []).map(async (row) => ({ ...row, signedUrl: await createProfilePhotoSignedUrl(row.storage_path) })));
    setPhotos(withUrls as Photo[]);
  }, []);

  useEffect(() => {
    if (previewAllowed) {
      const isDone = preview === 'complete';
      setProfile({ display_name: 'Preview Member', birth_date: '1990-01-01', city_region: isDone ? 'Manila' : '', relationship_intention: isDone ? 'serious_relationship' : null, prompts: toProfilePrompts(isDone ? previewAnswers : EMPTY_ANSWERS) });
      setCityRegion(isDone ? 'Manila' : '');
      setAnswers(isDone ? previewAnswers : EMPTY_ANSWERS);
      const count = preview === 'complete' ? 2 : preview === 'under-two' ? 1 : 0;
      setPhotos(Array.from({ length: count }, (_, i) => ({ id: `preview-photo-${i}`, storage_path: '', position: i, signedUrl: null })));
      setNotice(preview === 'save-error' ? 'Could not save your changes. Your local draft is preserved; retry when connected.' : '');
      setLoaded(true);
      return;
    }
    if (!user?.id || !isSupabaseConfigured) {
      setNotice('Profile saving is unavailable in this build.');
      setLoaded(true);
      return;
    }
    let active = true;
    setLoaded(false);
    void (async () => {
      let serverPrompts: Json | null = null;
      let serverCityRegion: string | null = null;
      try {
        const { data, error } = await supabase.from('profiles').select('display_name,birth_date,city_region,country_code,relationship_intention,prompts').eq('id', user.id).maybeSingle();
        if (error) throw error;
        if (data) {
          serverPrompts = data.prompts;
          serverCityRegion = data.city_region;
          if (active) {
            setProfile(data as Profile);
            setCityRegion(data.city_region ?? '');
            const saved = normalizeCountryCode(data.country_code);
            if (saved) setCountry(saved);
          }
        } else if (active) {
          setNotice('Complete the previous onboarding steps before saving your profile.');
        }
      } catch {
        if (active) setNotice('Could not load your profile from the server. Your local draft will still be available.');
      }
      try {
        const draft = await loadProfileDraftState(user.id, serverPrompts, serverCityRegion);
        if (active) { setAnswers(draft.answers); setCityRegion(draft.cityRegion); }
      } catch {
        if (active) setAnswers(EMPTY_ANSWERS);
      }
      try {
        await refreshPhotos(user.id);
      } catch {
        if (active) setNotice('Photos could not be refreshed. Retry before continuing.');
      }
      if (active) setLoaded(true);
    })();
    return () => { active = false; if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [user?.id, previewAllowed, preview, refreshPhotos]);

  const countedPhotos = previewAllowed ? photos.length : photos.filter((photo) => Boolean(photo.signedUrl)).length;
  const complete = useMemo(() => !!profile && isProfileComplete({ ...profile, city_region: cityRegion, prompts: toProfilePrompts(answers) }, countedPhotos), [profile, cityRegion, answers, countedPhotos]);
  const answeredCount = PROFILE_PROMPTS.filter((item) => answers[item.key].trim().length > 0).length;

  const changeAnswers = (next: ProfilePromptAnswers) => {
    setAnswers(next);
    if (user?.id && !previewAllowed) {
      draftSaveRef.current = saveProfileDraft(user.id, next, cityRegion).then(() => setDraftSaved(true)).catch(() => { setDraftSaved(false); });
    }
  };

  useEffect(() => {
    if (!loaded || !user?.id || !isSupabaseConfigured || previewAllowed) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void supabase.from('profiles').update({ prompts: toProfilePrompts(answers), city_region: cityRegion.trim() || null }).eq('id', user.id)
        .then(({ error }) => { if (error) setNotice('Your local draft is saved. Server autosave failed; retry before continuing.'); });
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [answers, cityRegion, loaded, user?.id, previewAllowed, answeredCount]);

  const changeCityRegion = (value: string) => {
    setCityRegion(value);
    if (user?.id && !previewAllowed) draftSaveRef.current = saveProfileDraft(user.id, answers, value).then(() => setDraftSaved(true)).catch(() => { setDraftSaved(false); });
  };

  const handleAddPhoto = async () => {
    if (previewAllowed) { setNotice('Preview mode does not upload files.'); return; }
    if (!user?.id || !isSupabaseConfigured) { setNotice('Photo upload is unavailable in this build.'); return; }
    if (photos.length >= MAX_PHOTOS) { setNotice('You can add up to six photos.'); return; }
    setNotice('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setNotice('Allow photo-library access to choose a profile photo.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: false, allowsEditing: false, exif: false, quality: 1 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const mime = asset.mimeType ?? inferMime(asset.fileName ?? '');
      if (!mime) { setNotice('Choose a JPEG, PNG, WebP, or HEIC photo.'); return; }
      setUploading(true);
      await uploadProfilePhoto(user.id, { uri: asset.uri, type: mime, size: asset.fileSize, name: asset.fileName });
      await refreshPhotos(user.id);
    } catch (error) {
      setNotice(toFriendlyMessage(error, 'The photo could not be uploaded. Please retry.'));
    } finally { setUploading(false); }
  };

  const movePhoto = async (index: number, delta: -1 | 1) => {
    if (!user?.id || previewAllowed) return;
    const next = [...photos];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setNotice('');
    try {
      await reorderProfilePhotos(user.id, next.map((photo) => photo.id));
      await refreshPhotos(user.id);
    } catch (error) { setNotice(toFriendlyMessage(error, 'Photo order could not be saved.')); }
  };

  const removePhoto = async (photo: Photo) => {
    if (!user?.id || previewAllowed) return;
    setNotice('');
    try {
      await deleteProfilePhoto(user.id, photo.id);
      await refreshPhotos(user.id);
    } catch (error) {
      setNotice(toFriendlyMessage(error, 'Photo could not be removed.'));
      await refreshPhotos(user.id).catch(() => undefined);
    }
  };

  const save = async () => {
    if (previewAllowed) { setNotice(preview === 'save-error' ? 'Could not save your changes. Your local draft is preserved; retry when connected.' : 'Preview only. No profile data was changed.'); return; }
    if (!user?.id || !isSupabaseConfigured) { setNotice('Profile saving is unavailable in this build.'); return; }
    if (!complete) { setNotice('Complete the checklist and add at least two photos before continuing.'); return; }
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    if (draftSaveRef.current) await draftSaveRef.current;
    setSaving(true); setNotice('');
    const { error } = await supabase.from('profiles').update({ prompts: toProfilePrompts(answers), city_region: cityRegion.trim(), country_code: country }).eq('id', user.id);
    setSaving(false);
    if (error) { setNotice('Could not save your profile. Your draft is preserved locally; please retry.'); return; }
    try { await clearProfileDraft(user.id); } catch { /* successful server save is durable; stale local draft can be replaced next visit */ }
    router.push('/(onboarding)/verify' as any);
  };

  return <OnboardingLayout testID="scr-09-onboarding-photos" step={3} totalSteps={4} title="Onboarding: Photos & Prompts" subtitle="Add a few details and photos that reflect you." fallbackHref="/(onboarding)/intentions" skipAuthGuard={previewAllowed}>
    <View style={styles.section}>
      {notice ? <AuthNotice testID="profile-save-notice">{notice}</AuthNotice> : null}
      <Text style={[styles.heading, { color: palette.text }]}>Profile photos ({photos.length} of {MAX_PHOTOS})</Text>
      <Text testID="photos-eligibility-note" style={[styles.body, { color: palette.textSecondary }]}>Two uploaded photos and three answered prompts are required before discovery. Photos are private until shared through the approved discovery experience.</Text>
      <View style={styles.photoGrid}>
        {photos.map((photo, index) => <View key={photo.id} style={[styles.photo, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
          {photo.signedUrl ? <Image source={{ uri: photo.signedUrl }} accessibilityLabel={`Profile photo ${index + 1}`} style={styles.thumbnail} /> : <View style={styles.placeholder}><Text style={{ color: palette.textSecondary }}>Photo {index + 1}</Text></View>}
          {!previewAllowed ? <View style={styles.photoActions}>
            <Button testID={`photo-up-${index}`} label="↑" size="sm" variant="secondary" disabled={index === 0} onPress={() => void movePhoto(index, -1)} />
            <Button testID={`photo-down-${index}`} label="↓" size="sm" variant="secondary" disabled={index === photos.length - 1} onPress={() => void movePhoto(index, 1)} />
            <Button testID={`photo-delete-${index}`} label="Remove" size="sm" variant="secondary" onPress={() => void removePhoto(photo)} />
          </View> : null}
        </View>)}
      </View>
      <Button testID="photo-add" label={uploading ? 'Uploading photo…' : 'Add photo'} variant="secondary" size="lg" disabled={uploading || saving || previewAllowed || photos.length >= MAX_PHOTOS} onPress={() => void handleAddPhoto()} />

      <TextField testID="profile-city-region" label="City or region" value={cityRegion} onChangeText={changeCityRegion} placeholder="e.g. Stockholm, Toronto or London" required />
      <CountryPicker testID="profile-country" value={country} onChange={setCountry} disabled={saving} />
      {PROFILE_PROMPTS.map((prompt) => <TextField key={prompt.key} testID={`profile-prompt-${prompt.key}`} label={prompt.question} value={answers[prompt.key]} onChangeText={(value) => changeAnswers({ ...answers, [prompt.key]: value })} required />)}
      <Text testID="profile-checklist-city" style={[styles.check, { color: palette.textSecondary }]}> {cityRegion.trim() ? '✓' : '○'} City or region added</Text>
      <Text testID="profile-checklist-prompts" style={[styles.check, { color: palette.textSecondary }]}> {answeredCount === 3 ? '✓' : '○'} {answeredCount}/3 prompts answered</Text>
      <Text testID="profile-checklist-photos" style={[styles.check, { color: palette.textSecondary }]}> {countedPhotos >= MIN_PHOTOS ? '✓' : '○'} {countedPhotos}/{MIN_PHOTOS} required photos uploaded</Text>
      <Text testID="profile-checklist-ready" accessibilityRole="text" style={[styles.check, { color: complete ? palette.successText : palette.textSecondary }]}>{complete ? 'Profile details complete' : 'Profile not ready for discovery'}</Text>
      {draftSaved ? <Text testID="profile-draft-saved" style={[styles.body, { color: palette.textSecondary }]}>Draft saved on this device.</Text> : null}
      <AuthPrimaryButton testID="profile-save-continue" label={saving ? 'Saving…' : 'Save and continue'} loading={saving} disabled={saving || uploading || !loaded} onPress={() => void save()} />
      <Button testID="profile-back" label="Back" variant="secondary" onPress={() => router.replace('/(onboarding)/intentions' as any)} />
    </View>
  </OnboardingLayout>;
}

function inferMime(fileName: string): string | null {
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  return null;
}

const styles = StyleSheet.create({
  section: { gap: Spacing.lg, paddingBottom: Spacing['3xl'] },
  heading: { ...Typography.h3 },
  body: { ...Typography.body },
  check: { ...Typography.body },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  photo: { width: 148, maxWidth: '48%', borderWidth: 1, borderRadius: 10, padding: Spacing.sm, gap: Spacing.sm },
  thumbnail: { width: '100%', height: 142, borderRadius: 7, resizeMode: 'cover' },
  placeholder: { height: 142, alignItems: 'center', justifyContent: 'center' },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
});
