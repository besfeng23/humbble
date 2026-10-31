import { EvilIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Header from '@/components/Header';
import { DiscoveryFeed } from '@/components/discovery/DiscoveryFeed';
import { HitSlop, TouchTargets } from '@/constants/Spacing';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function Discover() {
  const router = useRouter();
  const params = useLocalSearchParams<{ preview?: string }>();
  const palette = Colors[useColorScheme() ?? 'light'];
  const preview = __DEV__ && ['feed', 'empty', 'quota', 'error', 'match'].includes(String(params.preview ?? '')) ? String(params.preview) as 'feed' | 'empty' | 'quota' | 'error' | 'match' : undefined;
  const button = () => <Pressable testID="discover-filters-btn" hitSlop={HitSlop.default} onPress={() => router.push('/(tabs)/discover/filters' as any)} accessibilityRole="button" accessibilityLabel="Discovery filters and preferences" style={styles.filterButton}><EvilIcons name="question" size={24} color={palette.text} /></Pressable>;
  return <View testID="scr-11-discover" style={[styles.root, { backgroundColor: palette.background }]}><Header headerTitle="Discover" button={button} /><Text style={[styles.subtitle, { color: palette.textSecondary }]}>Look beyond the first photo. Discover compatible adults and connect when the feeling is mutual.</Text><DiscoveryFeed previewState={preview} /></View>;
}
const styles = StyleSheet.create({ root: { flex: 1, paddingHorizontal: 8 }, filterButton: { minWidth: TouchTargets.minimum, minHeight: TouchTargets.minimum, justifyContent: 'center', alignItems: 'center' }, subtitle: { fontSize: 14, marginBottom: 12, paddingHorizontal: 8 } });
