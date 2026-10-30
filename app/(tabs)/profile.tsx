import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { Colors } from "@/constants/Colors";
import { Spacing, TouchTargets } from "@/constants/Spacing";
import { FontFamilies } from "@/constants/Typography";
import { createProfilePhotoSignedUrl } from "@/lib/onboarding/photos";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/lib/AuthProvider";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { isModeratorRole } from "@/components/layout/navigation";
import { getMemberCardWidth } from "@/lib/sinceraMemberLayout";

type MyProfile = {
  display_name: string | null;
  city_region: string | null;
  country_code: string | null;
  relationship_intention: string | null;
  verification_status: string | null;
  is_discoverable: boolean | null;
  is_paused: boolean | null;
  birth_date: string | null;
  prompts: unknown;
};

const FOREST = "#17362D";
const GOLD = "#E7B96A";

export default function ProfileScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const photoColumns = width >= 1024 ? 3 : 2;
  const photoWidth = getMemberCardWidth(width, photoColumns, 12, Spacing.xl);
  const { user, signOut } = useAuth();
  const palette = Colors[useColorScheme() ?? "light"];
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [myPhotos, setMyPhotos] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [account, photoRows] = await Promise.all([
      supabase.from("profiles")
        .select("display_name,city_region,country_code,relationship_intention,verification_status,is_discoverable,is_paused,birth_date,prompts")
        .eq("id", user.id).maybeSingle(),
      supabase.from("profile_photos")
        .select("storage_path,position").eq("user_id",user.id).order("position").limit(6),
    ]);
    const { data, error: fetchError } = account;
    if (!photoRows.error) {
      setPhotoCount(photoRows.data?.length??0);
      const urls=await Promise.all((photoRows.data??[]).map(row=>createProfilePhotoSignedUrl(row.storage_path)));
      setMyPhotos(urls.filter((url):url is string=>Boolean(url)));
    } else {
      setPhotoCount(0);setMyPhotos([]);
    }
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
  const profileReady = Boolean(profile?.display_name?.trim() && profile?.relationship_intention && profile?.city_region && profile?.country_code && profile?.birth_date && photoCount > 0);
  const checklist = [
    { label: "Confirm age and accept the terms", complete: Boolean(profile?.birth_date) },
    { label: "Complete your display name and relationship intent", complete: Boolean(profile?.display_name?.trim() && profile?.relationship_intention) },
    { label: "Add a recent profile photo", complete: photoCount > 0 },
    { label: "Add your broad location", complete: Boolean(profile?.city_region && profile?.country_code) },
  ];
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
          <Text accessibilityRole="header" style={[styles.heading, width<760&&styles.headingMobile, { color: palette.text }]}>Your story.</Text>
          <Text style={[styles.lead, { color: palette.textSecondary }]}>A thoughtful introduction goes further than a perfect one.</Text>
        </View>
        <Pressable testID="profile-signout-btn" accessibilityRole="button" onPress={() => void signOutNow()} style={styles.ghostButton}>
          <Text style={styles.ghostButtonText}>Sign out</Text>
        </Pressable>
      </View>

      {!loading && !profileReady && !error ? <View style={styles.progressCard}>
        <Text style={styles.progressKicker}>FINISH YOUR PROFILE</Text>
        <Text style={styles.progressTitle}>Finish your profile to appear in Discover</Text>
        <Text style={styles.progressCopy}>Complete the items below. Finished steps disappear automatically.</Text>
        {checklist.filter(c=>!c.complete).map(c=><Text key={c.label} style={styles.progressCopy}>• {c.label}</Text>)}
        <Pressable accessibilityRole="button" style={styles.action} onPress={()=>router.push("/(onboarding)/basics" as any)}><Text style={styles.actionText}>Continue guided setup</Text></Pressable>
      </View> : null}
      <View style={styles.card}>
        {loading ? <ActivityIndicator color={FOREST} /> : null}
        {error ? (
          <View style={styles.notice}>
            <Text accessibilityRole="alert" style={[styles.detail, { color: palette.danger }]}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.action}><Text style={styles.actionText}>Retry</Text></Pressable>
          </View>
        ) : null}
        <View style={styles.identityRow}>
          {myPhotos[0] ? <Image source={{uri:myPhotos[0]}} accessibilityLabel="Your primary profile photo" style={styles.primaryAvatar}/> : <View style={styles.initialAvatar}><Text style={styles.initialText}>{initial}</Text></View>}
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

      <View style={styles.trustCard}>
        <Text style={styles.trustLabel}>YOUR TRUST CHECKLIST</Text>
        <Text style={styles.trustHeading}>Build trust at your own pace.</Text>
        <Text style={styles.trustBody}>Complete your profile, add a recent photo, and decide whether to request optional photo verification. Verification is not proof of identity.</Text>
        {checklist.slice(0,3).map((c,i)=><Text key={c.label} style={styles.trustBody}>{c.complete?"✓":"○"} {i+1} · {c.label}</Text>)}
      </View>
      <View style={styles.photoSection}>
        <View style={styles.photoHead}><Text accessibilityRole="header" style={[styles.sectionHeading,{color:palette.text}]}>Your photos</Text><Pressable accessibilityRole="button" onPress={()=>router.push("/(onboarding)/photos-prompts" as any)} style={styles.ghostButton}><Text style={styles.ghostButtonText}>Add a photo</Text></Pressable></View>
        {myPhotos.length ? <View style={styles.photoGrid}>{myPhotos.map((url,i)=><Image key={i} source={{uri:url}} accessibilityLabel={"Your profile photo "+(i+1)} style={[styles.photoThumb,{width:photoWidth}]} />)}</View>
          : <Text style={[styles.lead,{color:palette.textSecondary}]}>Add your first profile photo. You control who can see it; verification is a separate step.</Text>}
        <Text style={[styles.profileMeta,{color:palette.textSecondary}]}>Up to 6 photos. Manage order and privacy through your photo settings.</Text>
      </View>
      <Text accessibilityRole="header" style={[styles.sectionHeading, { color: palette.text }]}>Make Sincera yours</Text>
      <View style={styles.linkGrid}>
        <NavCard testID="profile-link-preferences" title="Match preferences" description="Set the age range and intentions that matter to you." onPress={() => router.push("/(tabs)/discover/filters" as any)} />
        <NavCard testID="profile-link-photos" title="Photos & profile" description="Add recent photos and choose how you introduce yourself." onPress={() => router.push("/(onboarding)/photos-prompts" as any)} />
        <NavCard testID="profile-link-settings" title="Privacy & safety" description="Manage visibility, notifications, reporting and blocked members." onPress={() => router.push("/(tabs)/profile/settings" as any)} />
        <NavCard testID="profile-link-activity" title="Notifications" description="Private activity from mutual matches and messages." onPress={() => router.push("/(tabs)/notifications" as any)} />
        <NavCard testID="profile-link-support" title="Contact support" description="Securely send a question or report a technical issue." onPress={() => router.push("/(public)/contact-support" as any)} />
        <NavCard testID="profile-link-privacy-delete" title="Your data" description="Request an export or account deletion. Requests are processed manually." onPress={() => router.push("/(tabs)/profile/privacy-delete" as any)} />
        <NavCard testID="profile-link-billing" title="Membership" description="Free matching and conversations remain available. Paid plans are not approved for launch." onPress={() => router.push("/(paywall)/billing" as any)} />
        <NavCard testID="profile-link-verification" title="Verification" description="Optional photo verification, when available, does not guarantee safety." onPress={() => router.push("/(onboarding)/verify" as any)} />
        {isModeratorRole(user) ? (
          <NavCard testID="profile-link-moderation" title="Moderation" description="Authorized trust and safety review." onPress={() => router.push("/(admin)/dashboard" as any)} />
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
  heading: { fontFamily: FontFamilies.editorial, fontSize: 36, fontWeight: "600", lineHeight: 43 },
  headingMobile: { fontSize: 34, lineHeight: 40 },
  lead: { fontSize: 15, lineHeight: 23 },
  ghostButton: { minHeight: TouchTargets.minimum, paddingHorizontal: 18, borderRadius: 25, borderWidth: 1, borderColor: "#C8BDA9", justifyContent: "center" },
  ghostButtonText: { color: FOREST, fontWeight: "700" },
  card: { borderWidth: 1, borderColor: "#E8E0D3", borderRadius: 18, backgroundColor: "#FFFDFA", padding: 22, gap: 16 },
  notice: { gap: 8 },
  detail: { fontSize: 14, lineHeight: 21 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  primaryAvatar: { width: 148, height: 148, borderRadius: 74, backgroundColor: "#EAD9B9" },
  initialAvatar: { width: 148, height: 148, borderRadius: 74, justifyContent: "center", alignItems: "center", backgroundColor: "#EAD9B9" },
  initialText: { color: FOREST, fontSize: 33, fontWeight: "700" },
  identityCopy: { flex: 1, gap: 5 },
  profileName: { color: FOREST, fontSize: 25, fontWeight: "700", lineHeight: 31 },
  profileMeta: { color: "#535E55", fontSize: 13, lineHeight: 19 },
  privateEmail: { color: "#655B4E", fontSize: 12, lineHeight: 18 },
  statusText: { fontSize: 14, lineHeight: 21, color: "#445649" },
  action: { alignSelf: "flex-start", minHeight: 44, borderRadius: 30, paddingHorizontal: 19, paddingVertical: 11, justifyContent: "center", backgroundColor: GOLD },
  actionText: { fontSize: 14, color: FOREST, fontWeight: "700" },
  sectionHeading: { fontFamily: FontFamilies.editorial, fontSize: 29, lineHeight: 35, fontWeight: "600" },
  linkGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  linkCard: { flexGrow: 1, flexBasis: 260, borderRadius: 16, padding: 20, backgroundColor: "#FFFDFA", borderWidth: 1, borderColor: "#E6DDD0", minHeight: 153, gap: 9 },
  linkTitle: { color: FOREST, fontSize: 18, fontWeight: "700" },
  linkDescription: { color: "#58625A", fontSize: 14, lineHeight: 21, flex: 1 },
  linkArrow: { color: "#8B632B", fontSize: 13, fontWeight: "700" },
  progressCard: { padding: 22, borderRadius: 17, backgroundColor: "#F0F3ED", borderColor: "#DBE3D6", borderWidth: 1, gap: 11 },
  progressKicker: { color: "#375845", fontSize: 12, letterSpacing: 1.7, fontWeight: "700" },
  progressTitle: { color: FOREST, fontFamily: FontFamilies.editorial, fontSize: 28, fontWeight: "600" },
  progressCopy: { color: "#506153", fontSize: 14, lineHeight: 22 },
  trustCard: { backgroundColor: "#FFFDFA", borderWidth: 1, borderColor: "#E5DBCD", padding: 22, borderRadius: 16, gap: 10 },
  trustLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 1.6, color: "#91682E" },
  trustHeading: { color: FOREST, fontFamily: FontFamilies.editorial, fontSize: 29, fontWeight: "600" },
  trustBody: { color: "#556157", fontSize: 14, lineHeight: 22 },
  photoSection: { padding: 22, backgroundColor: "#FFFDFA", borderWidth: 1, borderColor: "#E5DBCD", borderRadius: 16, gap: 13 },
  photoHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  photoThumb: { height: 240, borderRadius: 12, backgroundColor: "#EFE5D5" },
  safetyNote: { padding: 22, borderRadius: 16, backgroundColor: FOREST, gap: 9 },
  safetyTitle: { color: "#FFFAF0", fontSize: 19, fontWeight: "700" },
  safetyText: { color: "#E8E4D9", fontSize: 14, lineHeight: 22 },
});
