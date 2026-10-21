import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AuthGuard, ResponsiveNavHeader } from '@/components/layout';
import { useAuth } from '@/lib/AuthProvider';
import { loadConversationList, type ConversationSummary } from '@/lib/messaging';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Colors } from '@/constants/Colors';
import { Spacing } from '@/constants/Spacing';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function Chats() {
  const router = useRouter();
  const { user } = useAuth();
  const palette = Colors[useColorScheme() ?? 'light'];
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured) { setItems([]); setLoading(false); return; }
    setLoading(true); setError('');
    try { setItems(await loadConversationList()); }
    catch { setError('Your conversations could not be loaded. Check your connection and try again.'); }
    finally { setLoading(false); }
  }, [user?.id]);
  useEffect(() => { void load(); }, [load]);
  return <AuthGuard mode="protected" redirectTo="/auth/signin" testID="chats-list-guard">
    <View style={[styles.root, { backgroundColor: palette.background }]} testID="scr-15-chats-inbox">
      <ResponsiveNavHeader fadeEdge title="Messages" subtitle="Conversations with your mutual matches" />
      {loading ? <View style={styles.center}><ActivityIndicator /><Text style={{ color: palette.textSecondary }}>Loading conversations…</Text></View> :
        error ? <View style={styles.center}><Text style={[styles.message, { color: palette.text }]}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.link}>Try again</Text></Pressable></View> :
        items.length === 0 ? <View style={styles.center}><Text style={[styles.heading, { color: palette.text }]}>No conversations yet</Text><Text style={[styles.message, { color: palette.textSecondary }]}>When you and someone like each other, you can message each other for free.</Text><Pressable onPress={() => router.push('/(tabs)/discover' as any)}><Text style={styles.link}>Explore Discover</Text></Pressable></View> :
        <ScrollView contentContainerStyle={styles.list}>{items.map(item => <Pressable key={item.id} testID={`conversation-${item.id}`} onPress={() => router.push(`/(tabs)/(chats)/${item.id}` as any)} style={styles.row}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{item.counterpartName.slice(0,1).toUpperCase()}</Text></View>
          <View style={styles.copy}><Text style={[styles.name, { color: palette.text }]}>{item.counterpartName}</Text><Text numberOfLines={1} style={[styles.preview, { color: palette.textSecondary }]}>{item.lastMessage}</Text></View>
          <Text style={[styles.time, { color: palette.textSecondary }]}>{item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleDateString() : ''}</Text>
        </Pressable>)}</ScrollView>}
    </View>
  </AuthGuard>;
}
const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 }, list: { paddingBottom: 30 },
  row: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#EAE5DA', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '600', color: '#24221D' },
  copy: { flex: 1, gap: 5 }, name: { fontSize: 16, fontWeight: '700' }, preview: { fontSize: 13 },
  time: { fontSize: 11 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  heading: { fontSize: 21, fontWeight: '700', textAlign: 'center' }, message: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  link: { color: '#9A702C', fontWeight: '700', padding: 8 },
});
