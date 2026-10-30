import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { FontFamilies } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/lib/AuthProvider";
import { loadConversationList, type ConversationSummary } from "@/lib/messaging";
import { getMemberCardWidth, getMemberColumns } from "@/lib/sinceraMemberLayout";

const GREEN = "#17362D";
/** Matches reuses the same securely filtered conversation RPC. Unlike Bubble,
 * this separate preview RPC does not supply permitted counterpart-photo URLs.
 * Show an initials avatar instead of bypassing photo/privacy rules.
 */
export default function MatchesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const palette = Colors[useColorScheme() ?? "light"];
  const { width } = useWindowDimensions();
  const columns = getMemberColumns(width);
  const cardWidth = getMemberCardWidth(width, columns);
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!user?.id) { setItems([]); setLoading(false); return; }
    setLoading(true); setError("");
    try { setItems(await loadConversationList()); }
    catch { setError("Your matches could not be loaded. Try again."); }
    finally { setLoading(false); }
  }, [user?.id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <ScrollView testID="sincera-matches-list" style={[styles.root, { backgroundColor: palette.background }]} contentContainerStyle={styles.content}>
    <Text style={styles.kicker}>YOUR CONNECTIONS</Text>
    <Text accessibilityRole="header" style={[styles.title, width<760&&styles.titleMobile, { color: palette.text }]}>The feeling is mutual.</Text>
    <Text style={[styles.description, { color: palette.textSecondary }]}>Mutual likes. Private conversations.</Text>
    {loading ? <ActivityIndicator color={GREEN}/> : null}
    {error ? <View style={styles.empty}><Text accessibilityRole="alert" style={{ color: palette.danger }}>{error}</Text><Pressable accessibilityRole="button" style={styles.linkBox} onPress={() => void load()}><Text style={styles.link}>Try again</Text></Pressable></View> : null}
    {!loading && !error && items.length === 0 ? <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name="people-outline" size={26} color={GREEN}/></View>
      <Text style={[styles.emptyTitle, { color: palette.text }]}>No matches yet</Text>
      <Pressable accessibilityRole="link" onPress={() => router.push("/(tabs)/people" as any)}><Text style={styles.link}>Explore people</Text></Pressable>
      <Text style={[styles.description, { color: palette.textSecondary }]}>A mutual like becomes a match. Meet people who share your intentions.</Text>
    </View> : null}
    {!loading && !error && items.length > 0 ? <View testID="sincera-matches-grid" style={styles.grid}>
      {items.map(item => <View key={item.matchId} testID={`sincera-match-card-${item.matchId}`} style={[styles.card, { width: cardWidth, backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.avatar} accessibilityLabel={`Profile photo unavailable for ${item.counterpartName}`}>
          <Text style={styles.avatarInitial}>{item.counterpartName.trim().slice(0, 1).toUpperCase() || "S"}</Text>
        </View>
        <Text style={[styles.name, { color: palette.text }]} numberOfLines={2}>{item.counterpartName}</Text>
        <Text style={[styles.description, { color: palette.textSecondary }]} numberOfLines={2}>{item.lastMessage || "A new connection starts with hello."}</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" style={styles.linkBox} onPress={() => router.push({ pathname: "/(safety)/report-modal", params: { targetId: item.counterpartId, targetName: item.counterpartName, source: "matches", matched: "1" } } as any)}><Text style={styles.link}>Safety options ···</Text></Pressable>
          <Pressable accessibilityRole="link" style={styles.action} onPress={() => router.push(`/(tabs)/(chats)/${item.id}` as any)}><Text style={styles.actionText}>Open chat</Text></Pressable>
        </View>
      </View>)}
    </View> : null}
    <Text style={[styles.footer, { color: palette.textSecondary }]}>Sincera · Intentional connections. Adults 18+.</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: "100%", maxWidth: 1120, alignSelf: "center", paddingHorizontal: 22, paddingTop: 30, paddingBottom: 55, gap: 16 },
  kicker: { fontSize: 12, fontWeight: "700", letterSpacing: 1.8, color: "#956B35" },
  title: { fontFamily: FontFamilies.editorial, fontSize: 36, lineHeight: 43, fontWeight: "600" },
  titleMobile: { fontSize: 26, lineHeight: 33 },
  description: { fontSize: 15, lineHeight: 23 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "stretch", marginTop: 8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 12, alignItems: "flex-start" },
  avatar: { width: 136, height: 136, borderRadius: 68, backgroundColor: "#F0E2CB", alignItems: "center", justifyContent: "center", alignSelf: "center", overflow: "hidden" },
  avatarInitial: { fontFamily: FontFamilies.editorial, fontSize: 42, color: GREEN, fontWeight: "600" },
  name: { fontFamily: FontFamilies.editorial, fontSize: 27, fontWeight: "600", color: GREEN },
  actions: { width: "100%", gap: 8, marginTop: "auto" },
  action: { minHeight: 48, paddingHorizontal: 20, borderRadius: 28, backgroundColor: "#C89D54", justifyContent: "center", alignItems: "center", width: "100%" },
  actionText: { fontSize: 15, color: "#181614", fontWeight: "700" },
  linkBox: { minHeight: 42, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 4 },
  link: { color: "#245746", fontSize: 14, fontWeight: "700" },
  empty: { minHeight: 220, padding: 26, borderRadius: 16, backgroundColor: "#FCF8F0", borderColor: "#E9E0D3", borderWidth: 1, gap: 12, alignItems: "flex-start" },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#EDE2CD", alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: FontFamilies.editorial, fontSize: 27, fontWeight: "600" },
  footer: { paddingTop: 18, fontSize: 13 },
});
