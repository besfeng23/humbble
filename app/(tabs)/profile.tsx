import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/Colors";
import { Spacing, TouchTargets } from "@/constants/Spacing";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/lib/AuthProvider";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { isModeratorRole } from "@/components/layout/navigation";

type MyProfile = {
  display_name: string | null;
  city_region: string | null;
  country_code: string | null;
  relationship_intention: string | null;
  verification_status: string | null;
  is_discoverable: boolean | null;
  is_paused: boolean | null;
};

const FOREST = "#17362D";
const GOLD = "#E7B96A";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const palette = Colors[useColorScheme() ?? "light"];
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("profiles")
      .select("display_name,city_region,country_code,relationship_intention,verification_status,is_discoverable,is_paused")
      .eq("id", user.id)
      .maybeSingle();
    if (fetchError) {
      setProfile(null);
      setError("Your profile could not be loaded. Please try again.");
    } else {
      setProfile((data as MyProfile | null) ?? null);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const signOutNow = async () => {
    await signOut();
    router.replace("/auth/signin");
  };

  const displayName = profile?.display_name?.trim() || "Your Sincera profile";
  const initial = profile?.display_name?.trim()?.charAt(0).toUpperCase() || "S";
  const location = [profile?.city_region, profile?.country_code].filter(Boolean).join(", ");
  const verified = profile?.verification_status === "verified";
  const paused = profile?.is_paused === true;
  const statusMessage = paused
    ? "Your profile is paused and hidden from Discover."
    : profile?.is_discoverable
    ? "Your profile is discoverable by eligible members."
    : "Complete your profile and preferences before appearing in Discover.";

  return (
    <ScrollView testID="scr-17-profile" style={[styles.screen, { backgroundColor: palette.background }]} contentContainerStyle={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.headingBlock}>
          <Text style={styles.eyebrow}>YOUR PROFILE</Text>
          <Text accessibilityRole="header" style={[styles.heading, { color: palette.text }]}>Your story.</Text>
          <Text style={[styles.lead, { color: palette.textSecondary }]}>A thoughtful introduction goes further than a perfect one.</Text>
        </View>
        <Pressable testID="profile-signout-btn" accessibilityRole="button" onPress={() => void signOutNow()} style={styles.ghostButton}>
          <Text style={styles.ghostButtonText}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        {loading ? <ActivityIndicator color={FOREST} /> : null}
        {error ? (
          <View style={styles.notice}>
            <Text accessibilityRole="alert" style={[styles.detail, { color: palette.danger }]}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.action}><Text style={styles.actionText}>Retry</Text></Pressable>
          </View>
        ) : null}
        <View style={styles.identityRow}>
          <View style={styles.initialAvatar}><Text style={styles.initialText}>{initial}</Text></View>
          <View style={styles.identityCopy}>
            <Text style={styles.profileName}>{displayName}</Text>
            {location ? <Text style={styles.profileMeta}>{location}</Text> : null}
            {profile?.relationship_intention ? <Text style={styles.profileMeta}>{String(profile.relationship_intention).replace(/_/g, " ")}</Text> : null}
            <Text style={styles.profileMeta}>{verified ? "Photo verification approved" : "Photo verification is optional"}</Text>
            {user?.email ? <Text style={styles.privateEmail}>Private account email · {user.email}</Text> : null}
          </View>
        </View>
        <Text testID="profile-visibility-status" style={styles.statusText}>{statusMessage}</Text>
        <Pressable testID="profile-edit-btn" accessibilityRole="button" onPress={() => router.push("/(onboarding)/basics" as any)} style={styles.action}>
          <Text style={styles.actionText}>Edit my profile</Text>
        </Pressable>
      </View>

      <Text accessibilityRole="header" style={[styles.sectionHeading, { color: palette.text }]}>Make Sincera yours</Text>
      <View style={styles.linkGrid}>
        <NavCard testID="profile-link-preferences" title="Match preferences" description="Set the age range and intentions that matter to you." onPress={() => router.push("/(tabs)/discover/filters" as any)} />
        <NavCard testID="profile-link-photos" title="Photos & profile" description="Add recent photos and choose how you introduce yourself." onPress={() => router.push("/(onboarding)/photos-prompts" as any)} />
        <NavCard testID="profile-link-settings" title="Privacy & safety" description="Manage visibility, notifications, reporting and blocked members." onPress={() => router.push("/(tabs)/profile/settings" as any)} />
        <NavCard testID="profile-link-privacy-delete" title="Your data" description="Request an export or account deletion. Requests are processed manually." onPress={() => router.push("/(tabs)/profile/privacy-delete" as any)} />
        <NavCard testID="profile-link-billing" title="Membership" description="Free matching and conversations remain available. Paid plans are not approved for launch." onPress={() => router.push("/(paywall)/billing" as any)} />
        <NavCard testID="profile-link-verification" title="Verification" description="Optional photo verification, when available, does not guarantee safety." onPress={() => router.push("/(onboarding)/verify" as any)} />
        {isModeratorRole(user) ? (
          <NavCard testID="profile-link-moderation" title="Moderation" description="Authorized trust and safety review." onPress={() => router.push("/(admin)/moderation" as any)} />
        ) : null}
      </View>

      <View style={styles.safetyNote}>
        <Text style={styles.safetyTitle}>A connection should feel safe.</Text>
        <Text style={styles.safetyText}>Never send money, gift cards, bank details or identity documents to someone you meet online. Report or block suspicious behavior from the member's profile or conversation.</Text>
      </View>
    </ScrollView>
  );
}

function NavCard({ testID, title, description, onPress }: { testID: string; title: string; description: string; onPress: () => void }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.linkCard, pressed && { opacity: 0.8 }]}>
      <Text style={styles.linkTitle}>{title}</Text>
      <Text style={styles.linkDescription}>{description}</Text>
      <Text style={styles.linkArrow}>Explore ↗</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: "100%", maxWidth: 1120, alignSelf: "center", padding: Spacing.xl, gap: 20, paddingBottom: 45 },
  headingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 },
  headingBlock: { flex: 1, gap: 7, minWidth: 220 },
  eyebrow: { color: "#966C28", fontSize: 12, letterSpacing: 1.7, fontWeight: "700" },
  heading: { fontFamily: "Georgia", fontSize: 38, fontWeight: "600", lineHeight: 43 },
  lead: { fontSize: 15, lineHeight: 23 },
  ghostButton: { minHeight: TouchTargets.minimum, paddingHorizontal: 18, borderRadius: 25, borderWidth: 1, borderColor: "#C8BDA9", justifyContent: "center" },
  ghostButtonText: { color: FOREST, fontWeight: "700" },
  card: { borderWidth: 1, borderColor: "#E8E0D3", borderRadius: 18, backgroundColor: "#FFFDFA", padding: 22, gap: 16 },
  notice: { gap: 8 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  initialAvatar: { width: 82, height: 82, borderRadius: 41, justifyContent: "center", alignItems: "center", backgroundColor: "#EAD9B9" },
  initialText: { color: FOREST, fontSize: 33, fontWeight: "700" },
  identityCopy: { flex: 1, gap: 5 },
  profileName: { color: FOREST, fontSize: 25, fontWeight: "700", lineHeight: 31 },
  profileMeta: { color: "#535E55", fontSize: 13, lineHeight: 19 },
  privateEmail: { color: "#655B4E", fontSize: 12, lineHeight: 18 },
  statusText: { fontSize: 14, lineHeight: 21, color: "#445649" },
  action: { alignSelf: "flex-start", minHeight: 44, borderRadius: 30, paddingHorizontal: 19, paddingVertical: 11, justifyContent: "center", backgroundColor: GOLD },
  actionText: { fontSize: 14, color: FOREST, fontWeight: "700" },
  sectionHeading: { fontFamily: "Georgia", fontSize: 29, lineHeight: 35, fontWeight: "600" },
  linkGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  linkCard: { flexGrow: 1, flexBasis: 260, borderRadius: 16, padding: 20, backgroundColor: "#FFFDFA", borderWidth: 1, borderColor: "#E6DDD0", minHeight: 153, gap: 9 },
  linkTitle: { color: FOREST, fontSize: 18, fontWeight: "700" },
  linkDescription: { color: "#58625A", fontSize: 14, lineHeight: 21, flex: 1 },
  linkArrow: { color: "#8B632B", fontSize: 13, fontWeight: "700" },
  safetyNote: { padding: 22, borderRadius: 16, backgroundColor: FOREST, gap: 9 },
  safetyTitle: { color: "#FFFAF0", fontSize: 19, fontWeight: "700" },
  safetyText: { color: "#E8E4D9", fontSize: 14, lineHeight: 22 },
});
