import { useRouter } from 'expo-router';
import { toFriendlyMessage } from '@/lib/friendlyErrors';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SettingsLayout } from '@/components/layout';
import { Colors } from '@/constants/Colors';
import { Spacing, TouchTargets } from '@/constants/Spacing';
import { Typography } from '@/constants/Typography';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getBlockedPeople, unblockPerson } from '@/lib/safety';
import type { BlockedUserRow } from '@/lib/database.contracts';

export default function BlockedUsersScreen() {
  const router = useRouter();
  const palette = Colors[useColorScheme() ?? 'light'];
  const [items, setItems] = useState<BlockedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [confirmId, setConfirmId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await getBlockedPeople()); }
    catch { setError('Couldn’t load. Tap to retry.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const unblock = async (id: string) => {
    if (busyId) return;
    setBusyId(id); setError('');
    try { await unblockPerson(id); setConfirmId(''); await load(); }
    catch (cause) { setError(toFriendlyMessage(cause, 'Couldn’t unblock. Try again.')); }
    finally { setBusyId(''); }
  };

  return <SettingsLayout fadeEdge testID="scr-24-blocked-users" title="Blocked users" fallbackHref="/(tabs)/profile/settings" activeNavId="settings-blocked-users">
    {error ? <Pressable onPress={() => void load()}><Text accessibilityRole="alert" style={[styles.small, { color: palette.errorText }]}>{error}</Text></Pressable> : null}
    {loading ? <View style={styles.center}><ActivityIndicator /></View> : items.length === 0 ? <Text style={[styles.small, { color: palette.textSecondary }]}>No one blocked.</Text> : <View style={styles.list}>{items.map(item => {
      const name = item.display_name || 'Humbble member';
      const confirming = confirmId === item.blocked_id;
      return <View key={item.blocked_id} testID={`blocked-user-${item.blocked_id}`} style={styles.row}>
        <Text numberOfLines={1} style={[styles.name, { color: palette.text }]}>{confirming ? `Unblock ${name}?` : name}</Text>
        {confirming ? <>
          <Pressable accessibilityRole="button" disabled={Boolean(busyId)} onPress={() => setConfirmId('')} style={styles.textButton}><Text style={[styles.action, { color: palette.textSecondary }]}>Cancel</Text></Pressable>
          <Pressable testID={`confirm-unblock-${item.blocked_id}`} accessibilityRole="button" disabled={Boolean(busyId)} onPress={() => void unblock(item.blocked_id)} style={[styles.textButton, styles.outline, { borderColor: palette.border }]}>{busyId === item.blocked_id ? <ActivityIndicator /> : <Text style={[styles.action, { color: palette.text }]}>Unblock</Text>}</Pressable>
        </> : <Pressable testID={`unblock-${item.blocked_id}`} accessibilityRole="button" disabled={Boolean(busyId)} onPress={() => setConfirmId(item.blocked_id)} style={styles.textButton}><Text style={[styles.action, { color: palette.textSecondary }]}>Unblock</Text></Pressable>}
      </View>;
    })}</View>}
    <Pressable accessibilityRole="link" onPress={() => router.push('/(public)/legal/complaints-handling' as any)} style={styles.help}><Text style={[styles.small, { color: palette.textSecondary }]}>Help & Appeals</Text></Pressable>
  </SettingsLayout>;
}

const styles = StyleSheet.create({
  list: { gap: 2 }, center: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: TouchTargets.comfortable, paddingHorizontal: Spacing.sm },
  name: { ...Typography.body, flex: 1 }, small: { ...Typography.bodySmall, lineHeight: 20, paddingHorizontal: Spacing.sm },
  textButton: { minHeight: 36, paddingHorizontal: Spacing.md, justifyContent: 'center', borderRadius: 18 }, outline: { borderWidth: 1 }, action: { ...Typography.bodySemiBold },
  help: { paddingTop: Spacing.lg },
});
