import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthGuard, ResponsiveNavHeader } from '@/components/layout';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { loadConversationList } from '@/lib/messaging';
import { enablePushAndRegister } from '@/lib/notifications';
import { setViewingMatch } from '@/lib/notificationFocus';

export default function MatchScreen() {
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId?: string }>();
  const palette = Colors[useColorScheme() ?? 'light'];
  const [conversationId, setConversationId] = useState('');
  const [busy, setBusy] = useState(true);
  const [alertsOn, setAlertsOn] = useState(false);
  // While this match landing screen is open, its own match alert is suppressed.
  useEffect(() => (matchId ? setViewingMatch(String(matchId)) : undefined), [matchId]);
  useEffect(() => {
    let alive = true;
    void loadConversationList().then(rows => {
      if (alive) setConversationId(rows.find(row => row.matchId === String(matchId ?? ''))?.id ?? '');
    }).catch(() => undefined).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [matchId]);
  const openChat = () => conversationId ? router.replace(`/(tabs)/(chats)/${conversationId}` as any) : router.replace('/(tabs)/(chats)' as any);
  // Sparse: one header title, one line of copy, one outline action, one quiet text opt-in.
  return <AuthGuard mode="protected" redirectTo="/auth/signin" testID="match-notification-guard">
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <ResponsiveNavHeader fadeEdge title="New match" showBack fallbackHref="/(tabs)/(chats)" />
      <View style={styles.content}>
        <Text style={[styles.copy, { color: palette.textSecondary }]}>You both liked each other.</Text>
        {busy ? <ActivityIndicator /> : <Pressable testID="match-notification-message" accessibilityRole="button" onPress={openChat} style={[styles.outline, { borderColor: palette.borderStrong }]}><Text style={[styles.outlineText, { color: palette.text }]}>{conversationId ? 'Send a message' : 'View conversations'}</Text></Pressable>}
        {alertsOn ? null : <Pressable testID="match-notification-enable-push" accessibilityRole="button" hitSlop={8} onPress={() => void enablePushAndRegister().then(setAlertsOn).catch(() => undefined)}><Text style={[styles.link, { color: palette.textSecondary }]}>Turn on notifications</Text></Pressable>}
      </View>
    </View>
  </AuthGuard>;
}
const styles = StyleSheet.create({ root: { flex: 1, paddingHorizontal: 20 }, content: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 }, copy: { fontSize: 17, textAlign: 'center' }, outline: { borderWidth: 1.5, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999 }, outlineText: { fontSize: 15, fontWeight: '600' }, link: { padding: 8, fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' } });
