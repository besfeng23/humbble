import { Octicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Header from '@/components/Header';
import { DiscoveryFeed } from '@/components/discovery/DiscoveryFeed';
import { DiscoveryGrid } from '@/components/discovery/DiscoveryGrid';
import { HitSlop, TouchTargets } from '@/constants/Spacing';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function PeopleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ preview?: string }>();
  const palette = Colors[useColorScheme() ?? 'light'];
  const preview = __DEV__ && ['feed', 'empty', 'quota', 'error', 'match', 'ineligible'].includes(String(params.preview ?? '')) ? String(params.preview) as 'feed' | 'empty' | 'quota' | 'error' | 'match' | 'ineligible' : undefined;
  const button = () => <Pressable testID="people-filter-btn" hitSlop={HitSlop.default} onPress={() => router.push('/(tabs)/discover/filters' as any)} accessibilityRole="button" accessibilityLabel="Open discovery filters" style={styles.filterButton}><Octicons name="filter" size={22} color={palette.text} /></Pressable>;
  return <View testID="scr-11-people" style={[styles.container, { backgroundColor: palette.background }]}><Text style={styles.kicker}>MEET WITH INTENTION</Text><Header headerTitle="Discover people who feel right." button={button} /><Text style={[styles.subtitle, { color: palette.textSecondary }]}>Look beyond the first photo. Discover compatible adults and connect when the feeling is mutual.</Text>{preview ? <DiscoveryFeed previewState={preview} /> : <DiscoveryGrid />}</View>;
}
const styles = StyleSheet.create({ container: { flex: 1, paddingHorizontal: 18, paddingTop: 18 }, kicker: { fontSize: 12, letterSpacing: 1.6, fontWeight: "700", color: "#966B31", paddingHorizontal: 8, marginBottom: 9 }, filterButton: { minWidth: TouchTargets.minimum, minHeight: TouchTargets.minimum, justifyContent: 'center', alignItems: 'center' }, subtitle: { fontSize: 14, marginBottom: 12, paddingHorizontal: 8 } });
