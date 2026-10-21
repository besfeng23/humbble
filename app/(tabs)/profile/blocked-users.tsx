import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SettingsLayout } from '@/components/layout';
import { Button, Card } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { Spacing } from '@/constants/Spacing';
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
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await getBlockedPeople()); }
    catch { setError('Blocked users could not be loaded. Check your connection and try again.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const unblock = async (id: string) => {
    if (busyId) return;
    setBusyId(id); setError(''); setMessage('');
    try {
      await unblockPerson(id);
      setConfirmId('');
      setMessage('User unblocked. Any previous match or conversation remains ended and will not be restored.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The user could not be unblocked. Try again.');
    } finally { setBusyId(''); }
  };

  return <SettingsLayout fadeEdge testID="scr-24-blocked-users" title="Blocked users" subtitle="Manage accounts you have blocked" fallbackHref="/(tabs)/profile/settings" activeNavId="settings-blocked-users">
    <Text style={[styles.intro, { color: palette.textSecondary }]}>Blocked accounts cannot see you in discovery or message you. Unblocking never restores an old match.</Text>
    {message ? <Text accessibilityRole="alert" testID="blocked-users-message" style={[styles.message, { color: palette.successText }]}>{message}</Text> : null}
    {error ? <View style={styles.errorBox}><Text accessibilityRole="alert" style={[styles.message, { color: palette.errorText }]}>{error}</Text><Button label="Try again" size="sm" variant="secondary" onPress={() => void load()} /></View> : null}
    {loading ? <View style={styles.center}><ActivityIndicator /><Text style={{ color: palette.textSecondary }}>Loading blocked users…</Text></View> : items.length === 0 ? <Card variant="elevated"><View style={styles.empty}><Text style={[styles.heading, { color: palette.text }]}>No blocked users</Text><Text style={[styles.intro, { color: palette.textSecondary }]}>When you block someone, their account appears here.</Text></View></Card> : items.map(item => <Card key={item.blocked_id} testID={`blocked-user-${item.blocked_id}`} variant="elevated"><View style={styles.row}>
      <View style={styles.copy}><Text style={[styles.name, { color: palette.text }]}>{item.display_name || 'Humbble member'}</Text><Text style={[styles.date, { color: palette.textSecondary }]}>Blocked {new Date(item.created_at).toLocaleDateString()}</Text></View>
      <Button testID={`unblock-${item.blocked_id}`} label="Unblock" variant="secondary" size="sm" disabled={Boolean(busyId)} onPress={() => setConfirmId(item.blocked_id)} />
      {confirmId === item.blocked_id ? <View testID={`confirm-unblock-${item.blocked_id}`} style={[styles.confirm, { backgroundColor: palette.surfaceMuted }]}><Text style={[styles.intro, { color: palette.text }]}>Unblock {item.display_name || 'this member'}? Your previous match will stay ended.</Text><View style={styles.actions}><Button label="Confirm unblock" variant="primary" size="sm" loading={busyId === item.blocked_id} onPress={() => void unblock(item.blocked_id)} /><Button label="Cancel" variant="ghost" size="sm" disabled={Boolean(busyId)} onPress={() => setConfirmId('')} /></View></View> : null}
    </View></Card>)}
    <Card variant="outlined"><View style={styles.help}><Text style={[styles.heading, { color: palette.text }]}>Need help or an appeal?</Text><Text style={[styles.intro, { color: palette.textSecondary }]}>Review our Community Standards and Safety Guidelines for reporting and moderation information.</Text><Button label="Help & Appeals (draft)" variant="secondary" size="md" onPress={() => router.push('/(public)/legal/complaints-handling' as any)} /></View></Card>
  </SettingsLayout>;
}

const styles = StyleSheet.create({
  intro: { ...Typography.bodySmall, lineHeight: 21 }, message: { ...Typography.bodySmall, lineHeight: 20 }, center: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  empty: { gap: Spacing.sm, padding: Spacing.md }, heading: { ...Typography.bodySemiBold }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.md, padding: Spacing.md }, copy: { flex: 1, minWidth: 120, gap: Spacing.xs }, name: { ...Typography.bodySemiBold }, date: { ...Typography.bodySmall },
  confirm: { width: '100%', borderRadius: 12, padding: Spacing.md, gap: Spacing.sm }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }, errorBox: { gap: Spacing.sm }, help: { gap: Spacing.md, padding: Spacing.md },
});
