import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AuthGuard, ResponsiveNavHeader } from '@/components/layout';
import { Button, Card, ProfileMedia } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { Spacing } from '@/constants/Spacing';
import { Typography } from '@/constants/Typography';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getDiscoveryPage, recordSwipe, type DiscoveryCard } from '@/lib/discovery';
import { toFriendlyDiscoveryError } from '@/lib/discoveryErrors';

export default function ProfileInspectorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const candidateId = String(params.id ?? '');
  const palette = Colors[useColorScheme() ?? 'light'];
  const [candidate, setCandidate] = useState<DiscoveryCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        let cursor: string | null = null;
        let found: DiscoveryCard | undefined;
        // The feed is the only approved discovery source; page forward until found/end.
        for (let pageNo = 0; pageNo < 10 && !found; pageNo++) {
          const page = await getDiscoveryPage(cursor, 50);
          found = page.items.find(item => item.profile_id === candidateId);
          cursor = page.nextCursor;
          if (!cursor) break;
        }
        if (active) {
          setCandidate(found ?? null);
          if (!found) setError('This profile is no longer available in discovery.');
        }
      } catch (cause) { if (active) { const friendly = toFriendlyDiscoveryError(cause); setError(friendly.key === 'unknown' ? 'This profile could not be loaded. Try again from Discover.' : friendly.message); } }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [candidateId]);
  const decide = async (direction: 'like' | 'pass') => {
    if (!candidate || busy) return;
    setBusy(true); setError('');
    try { await recordSwipe(candidate.profile_id, direction); router.replace('/(tabs)/discover' as any); }
    catch (cause) { setError(toFriendlyDiscoveryError(cause).message); }
    finally { setBusy(false); }
  };
  return <AuthGuard mode="protected" redirectTo="/auth/signin" testID="scr-12-guard">
    <View testID="scr-12-profile-inspector" style={[styles.root, { backgroundColor: palette.background }]}>
      <ResponsiveNavHeader fadeEdge testID="scr-12-header" title="Profile" subtitle="Discovery profile" showBack fallbackHref="/(tabs)/discover" rightSlot={<Pressable testID="scr-12-shield-btn" accessibilityRole="button" accessibilityLabel="Safety: block or report" hitSlop={8} style={[styles.safety, { borderColor: palette.border }]} onPress={() => router.push({ pathname: '/(safety)/report-modal', params: { targetId: candidate?.profile_id ?? candidateId, targetName: candidate?.display_name ?? 'this person', source: 'profile' } } as any)}><Ionicons name="shield-outline" size={16} color={palette.text} /><Text style={[styles.safetyLabel, { color: palette.text }]}>Safety</Text></Pressable>} />
      {loading ? <View style={styles.center}><ActivityIndicator /><Text style={{ color: palette.textSecondary }}>Loading profile…</Text></View> : candidate ? <ScrollView contentContainerStyle={styles.content}>
        <ProfileMedia testID="scr-12-media" name={candidate.display_name} age={candidate.age} imageUri={candidate.imageUrl ?? undefined} subtitle={candidate.city_region} verified size="large" />
        <Card testID="scr-12-prompts-card" variant="elevated"><View style={styles.prompts}>
          <Text style={[styles.label, { color: palette.textSecondary }]}>Relationship intention</Text>
          <Text style={[styles.body, { color: palette.text }]}>{candidate.relationship_intention.replaceAll('_', ' ')}</Text>
          <Text style={[styles.label, { color: palette.textSecondary }]}>Shared interests</Text>
          <Text style={[styles.body, { color: palette.text }]}>{candidate.shared_interests?.join(' · ') || 'Not shared yet'}</Text>
        </View></Card>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}><Button testID="scr-12-pass-btn" label="Pass" variant="secondary" size="lg" shape="pill" style={styles.actionButton} disabled={busy} onPress={() => void decide('pass')} /><Button testID="scr-12-like-btn" label="Like" variant="primary" size="lg" shape="pill" style={styles.actionButton} disabled={busy} onPress={() => void decide('like')} /></View>
      </ScrollView> : <View style={styles.center}><Text style={[styles.body, { color: palette.text }]}>{error || 'Profile unavailable.'}</Text><Button label="Back to Discover" onPress={() => router.replace('/(tabs)/discover' as any)} /></View>}
    </View>
  </AuthGuard>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, content: { padding: Spacing.xl, gap: Spacing.lg }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }, prompts: { gap: Spacing.sm }, label: { ...Typography.label }, body: { ...Typography.body }, actions: { flexDirection: 'row', gap: Spacing.md }, actionButton: { flex: 1 }, error: { color: '#B42318' }, safety: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1 }, safetyLabel: { ...Typography.bodySmall, fontWeight: '600' } });
