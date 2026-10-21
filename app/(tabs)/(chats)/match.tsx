import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthGuard, ResponsiveNavHeader } from '@/components/layout';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { loadConversationList } from '@/lib/messaging';
import { enablePushAndRegister } from '@/lib/notifications';

export default function MatchScreen() {
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId?: string }>();
  const palette = Colors[useColorScheme() ?? 'light'];
  const [conversationId, setConversationId] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let alive = true;
    void loadConversationList().then(rows => {
      if (alive) setConversationId(rows.find(row => row.matchId === String(matchId ?? ''))?.id ?? '');
    }).catch(() => undefined).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [matchId]);
  return <AuthGuard mode="protected" redirectTo="/auth/signin" testID="match-notification-guard">
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <ResponsiveNavHeader fadeEdge title="A new match" subtitle="You both liked each other" showBack fallbackHref="/(tabs)/(chats)" />
      <View style={styles.content}>
        <Text style={[styles.title, { color: palette.text }]}>It’s a match</Text>
        <Text style={[styles.copy, { color: palette.textSecondary }]}>Start a conversation when you’re ready.</Text>
        {busy ? <ActivityIndicator /> : <Pressable testID="match-notification-message" accessibilityRole="button" onPress={() => conversationId ? router.replace(`/(tabs)/(chats)/${conversationId}` as any) : router.replace('/(tabs)/(chats)' as any)} style={styles.button}><Text style={styles.buttonText}>{conversationId ? 'Send a message' : 'View conversations'}</Text></Pressable>}
        <Pressable testID="match-notification-enable-push" onPress={() => void enablePushAndRegister().catch(() => undefined)}><Text style={styles.link}>Enable match and message alerts</Text></Pressable>
      </View>
    </View>
  </AuthGuard>;
}
const styles = StyleSheet.create({ root: { flex: 1, paddingHorizontal: 20 }, content: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18 }, title: { fontSize: 30, fontWeight: '700' }, copy: { fontSize: 15, textAlign: 'center' }, button: { backgroundColor: '#24221D', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 }, buttonText: { color: '#FFFFFF', fontWeight: '700' }, link: { color: '#9A702C', padding: 10, fontWeight: '600' } });
