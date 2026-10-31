import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { DiscoveryFeed } from '@/components/discovery/DiscoveryFeed';
import { DiscoveryGrid } from '@/components/discovery/DiscoveryGrid';
import { Colors } from '@/constants/Colors';
import { FontFamilies } from '@/constants/Typography';
import { useColorScheme } from '@/hooks/useColorScheme';
import { showCompactMemberPageIntro } from '@/lib/sinceraMemberLayout';

/** Bubble Live: bounded editorial header, then progressive member filters and grid. */
export default function PeopleScreen() {
  const params = useLocalSearchParams<{ preview?: string }>();
  const { width } = useWindowDimensions();
  const palette = Colors[useColorScheme() ?? 'light'];
  const showIntro = showCompactMemberPageIntro(width);
  const preview = __DEV__ && ['feed', 'empty', 'quota', 'error', 'match', 'ineligible'].includes(String(params.preview ?? ''))
    ? String(params.preview) as 'feed' | 'empty' | 'quota' | 'error' | 'match' | 'ineligible'
    : undefined;
  return <View testID="scr-11-people" style={[styles.container, { backgroundColor: palette.background }]}>
    {showIntro ? <Text style={styles.kicker}>MEET WITH INTENTION</Text> : null}
    <Text accessibilityRole="header" style={[styles.title, width < 760 && styles.titleMobile, { color: palette.text }]}>Discover people who feel right.</Text>
    {showIntro ? <Text style={[styles.subtitle, { color: palette.textSecondary }]}>Look beyond the first photo. Discover compatible adults and connect when the feeling is mutual.</Text> : null}
    {preview ? <DiscoveryFeed previewState={preview} /> : <DiscoveryGrid />}
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', maxWidth: 1120, alignSelf: 'center', paddingTop: 28 },
  kicker: { fontSize: 12, letterSpacing: 2, fontWeight: '700', color: '#956B35', paddingHorizontal: 18, marginBottom: 8 },
  title: { fontFamily: FontFamilies.editorial, fontSize: 50, lineHeight: 54, fontWeight: '600', paddingHorizontal: 18, marginBottom: 8 },
  titleMobile: { fontSize: 26, lineHeight: 32 },
  subtitle: { fontSize: 16, lineHeight: 24, marginBottom: 16, maxWidth: 760, paddingHorizontal: 18 },
});
