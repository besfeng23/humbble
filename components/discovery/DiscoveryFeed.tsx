import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Spacing } from '@/constants/Spacing';
import { useColorScheme } from '@/hooks/useColorScheme';
import { appendUniqueProfiles, DiscoveryCard, getDiscoveryPage, isQuotaError, recordSwipe } from '@/lib/discovery';
import type { SwipeDirection } from '@/lib/database.contracts';

type PreviewState = 'feed' | 'empty' | 'quota' | 'error' | 'match';
const PREVIEW_ITEMS: DiscoveryCard[] = [
  { profile_id: 'preview-1', display_name: 'Mia', age: 27, city_region: 'Makati, Metro Manila', relationship_intention: 'serious_relationship', shared_interests: ['Coffee', 'Live music'], primary_photo_path: '', imageUrl: null, cursor_created_at: '2026-10-20T12:00:00Z', cursorCreatedAt: '2026-10-20T12:00:00Z' } as unknown as DiscoveryCard,
  { profile_id: 'preview-2', display_name: 'Alex', age: 29, city_region: 'Quezon City', relationship_intention: 'long_term_dating', shared_interests: ['Travel', 'Food'], primary_photo_path: '', imageUrl: null, cursor_created_at: '2026-10-19T12:00:00Z', cursorCreatedAt: '2026-10-19T12:00:00Z' } as unknown as DiscoveryCard,
];

export function DiscoveryFeed({ previewState }: { previewState?: PreviewState }) {
  const palette = Colors[useColorScheme() ?? 'light'];
  const [items, setItems] = useState<DiscoveryCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaReached, setQuotaReached] = useState(false);
  const [match, setMatch] = useState<DiscoveryCard | null>(null);
  const seenIds = useRef(new Set<string>());
  const isPreview = __DEV__ && Boolean(previewState);

  const load = useCallback(async (append: boolean) => {
    if (isPreview) {
      const previewItems = previewState === 'empty' || previewState === 'error' ? [] : PREVIEW_ITEMS;
      setItems(previewItems);
      setQuotaReached(previewState === 'quota');
      setMatch(previewState === 'match' ? PREVIEW_ITEMS[0] : null);
      setError(previewState === 'error' ? 'We could not load discovery. Try again.' : null);
      setHasMore(false);
      setCursor(null);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const page = await getDiscoveryPage(append ? cursor : null);
      const fresh = appendUniqueProfiles(page.items, seenIds.current);
      setItems((current) => append ? [...current, ...fresh] : fresh);
      setCursor(page.nextCursor);
      setHasMore(Boolean(page.nextCursor) && fresh.length > 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not load discovery. Try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cursor, isPreview, previewState]);

  const didInitialLoad = useRef(false);
  useEffect(() => {
    if (didInitialLoad.current) return;
    didInitialLoad.current = true;
    void load(false);
  }, [load]); // initial fetch only; refresh is explicit below

  const act = async (item: DiscoveryCard, direction: SwipeDirection) => {
    if (acting || isPreview) return;
    setActing(true);
    try {
      const result = await recordSwipe(item.profile_id, direction);
      setItems((current) => current.filter((candidate) => candidate.profile_id !== item.profile_id));
      seenIds.current.add(item.profile_id);
      if (result.matched && direction === 'like') setMatch(item);
      if (direction === 'like' && result.likes_remaining === 0) setQuotaReached(true);
    } catch (cause) {
      if (isQuotaError(cause)) setQuotaReached(true);
      else setError(cause instanceof Error ? cause.message : 'Your decision could not be saved.');
    } finally { setActing(false); }
  };

  const renderItem = ({ item }: { item: DiscoveryCard }) => (
    <View testID={`discovery-card-${item.profile_id}`} style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      {item.imageUrl ? <Image accessibilityLabel={`${item.display_name}'s profile photo`} source={{ uri: item.imageUrl }} style={styles.photo} /> : <View style={[styles.photo, styles.photoFallback, { backgroundColor: palette.surfaceMuted }]}><Text style={{ color: palette.textSecondary }}>Photo unavailable</Text></View>}
      <View style={styles.profileBody}>
        <Text style={[styles.name, { color: palette.text }]}>{item.display_name}, {item.age}</Text>
        <Text style={[styles.secondary, { color: palette.textSecondary }]}>{item.city_region || 'Location not shared'}</Text>
        <Text style={[styles.intent, { color: palette.text }]}>{item.relationship_intention.replaceAll('_', ' ')}</Text>
        {item.shared_interests?.length ? <Text style={[styles.secondary, { color: palette.textSecondary }]}>{item.shared_interests.slice(0, 3).join(' · ')}</Text> : null}
      </View>
      <View style={styles.actions}>
        <Pressable testID={`discovery-pass-${item.profile_id}`} accessibilityRole="button" accessibilityLabel={`Pass on ${item.display_name}`} disabled={acting} onPress={() => void act(item, 'pass')} style={[styles.action, { borderColor: palette.border }]}><Text style={{ color: palette.text }}>Pass</Text></Pressable>
        <Pressable testID={`discovery-like-${item.profile_id}`} accessibilityRole="button" accessibilityLabel={`Like ${item.display_name}`} disabled={acting} onPress={() => void act(item, 'like')} style={[styles.action, styles.like, { backgroundColor: palette.primary }]}><Text style={{ color: palette.onPrimary, fontWeight: '700' }}>Like</Text></Pressable>
      </View>
    </View>
  );

  if (loading) return <View testID="discovery-loading" style={styles.center}><ActivityIndicator /><Text style={{ color: palette.textSecondary }}>Finding people for you…</Text></View>;
  if (error && items.length === 0) return <View testID="discovery-error" style={styles.center}><Text style={[styles.stateTitle, { color: palette.text }]}>Discovery could not load</Text><Text style={{ color: palette.textSecondary, textAlign: 'center' }}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { seenIds.current.clear(); void load(false); }} style={[styles.stateButton, { backgroundColor: palette.primary }]}><Text style={{ color: palette.onPrimary, fontWeight: '700' }}>Try again</Text></Pressable></View>;
  if (match) return <View testID="discovery-match" style={styles.center}><Text style={[styles.stateTitle, { color: palette.text }]}>It’s a match</Text><Text style={{ color: palette.textSecondary, textAlign: 'center' }}>You and {match.display_name} liked each other.</Text>{match.imageUrl ? <Image source={{ uri: match.imageUrl }} style={styles.matchPhoto} /> : null}<Pressable accessibilityRole="button" onPress={() => setMatch(null)} style={[styles.stateButton, { backgroundColor: palette.primary }]}><Text style={{ color: palette.onPrimary, fontWeight: '700' }}>Continue discovering</Text></Pressable></View>;
  if (quotaReached) return <View testID="discovery-quota" style={styles.center}><Text style={[styles.stateTitle, { color: palette.text }]}>You’re out of likes for today</Text><Text style={{ color: palette.textSecondary, textAlign: 'center' }}>Your daily free like limit has been reached. You can keep browsing and come back when your allowance refreshes.</Text><Pressable accessibilityRole="button" onPress={() => setQuotaReached(false)} style={[styles.stateButton, { backgroundColor: palette.primary }]}><Text style={{ color: palette.onPrimary, fontWeight: '700' }}>Keep browsing</Text></Pressable></View>;
  if (items.length === 0) return <View testID="discovery-empty" style={styles.center}><Text style={[styles.stateTitle, { color: palette.text }]}>You’re all caught up</Text><Text style={{ color: palette.textSecondary, textAlign: 'center' }}>There are no more eligible profiles right now. Check back later or adjust your age preferences.</Text><Pressable accessibilityRole="button" onPress={() => { seenIds.current.clear(); void load(false); }} style={[styles.stateButton, { backgroundColor: palette.primary }]}><Text style={{ color: palette.onPrimary, fontWeight: '700' }}>Refresh discovery</Text></Pressable></View>;

  return <FlatList testID="discovery-feed" data={items} renderItem={renderItem} keyExtractor={(item) => item.profile_id} contentContainerStyle={styles.list} onEndReachedThreshold={0.4} onEndReached={() => { if (hasMore && !loadingMore && !isPreview) void load(true); }} ListFooterComponent={loadingMore ? <ActivityIndicator /> : error ? <Pressable accessibilityRole="button" onPress={() => void load(true)}><Text style={{ color: palette.textSecondary }}>{error} Tap to retry.</Text></Pressable> : null} />;
}

const styles = StyleSheet.create({ list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl, gap: Spacing.lg }, card: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, marginBottom: Spacing.lg }, photo: { width: '100%', height: 390, resizeMode: 'cover' }, photoFallback: { justifyContent: 'center', alignItems: 'center' }, profileBody: { padding: Spacing.lg, gap: Spacing.xs }, name: { fontSize: 24, fontWeight: '700' }, secondary: { fontSize: 14 }, intent: { fontSize: 15, textTransform: 'capitalize', marginTop: 4 }, actions: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg }, action: { flex: 1, minHeight: 48, borderRadius: 24, borderWidth: 1, justifyContent: 'center', alignItems: 'center' }, like: { borderWidth: 0 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.md }, stateTitle: { fontSize: 24, fontWeight: '700', textAlign: 'center' }, stateButton: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: 24, marginTop: Spacing.sm }, matchPhoto: { width: 180, height: 180, borderRadius: 90 } });
