import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AuthGuard } from "@/components/layout";
import { Button } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { FontFamilies } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { getDiscoveryPage, recordSwipe, type DiscoveryCard } from "@/lib/discovery";
import { toFriendlyDiscoveryError } from "@/lib/discoveryErrors";

const FOREST = "#17362D";
/** Recreates Bubble Live member_profile's back link, identity, mutually safe
 * actions, photo area, biography/details sections and privacy fallback.
 * This separate Supabase feed exposes only approved public fields and
 * primary signed media; do not fetch or invent private Bubble galleries/bios.
 */
export default function ProfileInspectorScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string }>();
  const candidateId = String(params.id ?? "");
  const palette = Colors[useColorScheme() ?? "light"];
  const [candidate, setCandidate] = useState<DiscoveryCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setCandidate(null);
    void (async () => {
      try {
        let cursor: string | null = null;
        let found: DiscoveryCard | undefined;
        for (let pageNo = 0; pageNo < 10 && !found; pageNo++) {
          const page = await getDiscoveryPage(cursor, 50);
          found = page.items.find(item => item.profile_id === candidateId);
          cursor = page.nextCursor;
          if (!cursor) break;
        }
        if (active) {
          setCandidate(found ?? null);
          if (!found) setError("This profile is no longer available in discovery.");
        }
      } catch (cause) {
        if (active) {
          const friendly = toFriendlyDiscoveryError(cause);
          setError(friendly.key === "unknown" ? "This profile could not be loaded. Try again from Discover." : friendly.message);
        }
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [candidateId]);
  const back = () => router.replace("/(tabs)/people" as any);
  const decide = async (direction: "like" | "pass") => {
    if (!candidate || busy) return;
    setBusy(true); setError("");
    try { await recordSwipe(candidate.profile_id, direction); back(); }
    catch (cause) { setError(toFriendlyDiscoveryError(cause).message); }
    finally { setBusy(false); }
  };
  return <AuthGuard mode="protected" redirectTo="/auth/signin" testID="scr-12-guard">
    <View testID="scr-12-profile-inspector" style={[styles.root, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable testID="scr-12-header" accessibilityRole="link" onPress={back} style={styles.back}>
          <Text style={styles.backText}>← Back to Discover</Text>
        </Pressable>
        {loading ? <View style={styles.center}><ActivityIndicator color={FOREST}/><Text style={styles.detail}>Loading profile…</Text></View> : candidate ? <>
          <Text style={styles.kicker}>MEMBER STORY</Text>
          <Text accessibilityRole="header" style={[styles.title,width<760&&styles.titleMobile]}>Their story.</Text>
          <Text style={styles.intro}>Get to know the person behind the profile.</Text>
          <View style={styles.storyCard}>
            <View style={styles.identityRow}>
              {candidate.imageUrl ? <Image testID="scr-12-media" source={{uri:candidate.imageUrl}} accessibilityLabel={`Profile photo of ${candidate.display_name}`} style={styles.portrait}/> :
                <View testID="scr-12-media" style={styles.placeholder}><Text style={styles.initial}>{candidate.display_name.trim().slice(0,1).toUpperCase()||"S"}</Text></View>}
              <View style={styles.identityDetails}>
                <Text style={styles.name}>{candidate.display_name}, {candidate.age}</Text>
                <Text style={styles.detail}>{candidate.city_region||"Location not shared"}</Text>
                {candidate.is_verified ? <Text style={styles.verified}>Photo verified</Text> : null}
              </View>
            </View>
            <View style={styles.actions}>
              <Button testID="scr-12-pass-btn" label="Pass" variant="secondary" size="lg" shape="pill" style={styles.actionButton} disabled={busy} onPress={() => void decide("pass")} />
              <Button testID="scr-12-like-btn" label="Like" variant="primary" size="lg" shape="pill" style={styles.actionButton} disabled={busy} onPress={() => void decide("like")} />
            </View>
            <Text style={styles.detail}>Mutual likes unlock private conversations.</Text>
            <Pressable testID="scr-12-shield-btn" accessibilityRole="button" accessibilityLabel="Safety: block or report" style={styles.safety} onPress={() => router.push({pathname:"/(safety)/report-modal",params:{targetId:candidate.profile_id,targetName:candidate.display_name,source:"profile"}} as any)}>
              <Text style={styles.safetyText}>Block or report this member</Text>
            </Pressable>
          </View>
          <View style={styles.detailCard}>
            <Text style={styles.sectionTitle}>About this member</Text>
            <Text style={styles.label}>Relationship intention</Text>
            <Text style={styles.value}>{candidate.relationship_intention.replaceAll("_"," ")}</Text>
            <Text style={styles.label}>Shared interests</Text>
            <Text style={styles.value}>{candidate.shared_interests?.join(" · ")||"Not shared yet"}</Text>
          </View>
          <View style={styles.detailCard}>
            <Text style={styles.sectionTitle}>Their photos</Text>
            {candidate.imageUrl ? <Image source={{uri:candidate.imageUrl}} accessibilityLabel="Member photo shared with you" style={styles.galleryImage}/> :
              <Text style={styles.detail}>Photos shared at this member’s pace.</Text>}
          </View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        </> : <View style={styles.empty}>
          <Text style={styles.sectionTitle}>Profile unavailable</Text>
          <Text style={styles.detail}>{error || "This profile may be private, unavailable, or no longer active."}</Text>
          <Pressable accessibilityRole="link" onPress={back}><Text style={styles.backText}>Back to Discover</Text></Pressable>
        </View>}
      </ScrollView>
    </View>
  </AuthGuard>;
}
const styles=StyleSheet.create({
 root:{flex:1},content:{width:"100%",maxWidth:1120,alignSelf:"center",paddingHorizontal:24,paddingVertical:28,paddingBottom:54,gap:16},
 back:{minHeight:44,justifyContent:"center",alignSelf:"flex-start"},backText:{fontSize:15,color:"#245746",fontWeight:"700"},
 kicker:{fontSize:12,letterSpacing:1.7,fontWeight:"700",color:"#956B35"},
 title:{fontFamily:FontFamilies.editorial,fontSize:36,lineHeight:43,fontWeight:"600",color:FOREST},titleMobile:{fontSize:32,lineHeight:38},
 intro:{fontSize:16,lineHeight:24,color:"#516258",maxWidth:720},
 storyCard:{padding:24,backgroundColor:"#FFFDFA",borderColor:"#E9E0D3",borderWidth:1,borderRadius:16,gap:16},
 identityRow:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:18},identityDetails:{flex:1,minWidth:165,gap:8},
 portrait:{height:148,width:148,borderRadius:74,backgroundColor:"#EAD9B9"},
 placeholder:{height:148,width:148,borderRadius:74,backgroundColor:"#EAD9B9",alignItems:"center",justifyContent:"center"},
 initial:{fontFamily:FontFamilies.editorial,fontSize:52,fontWeight:"600",color:FOREST},
 name:{fontFamily:FontFamilies.editorial,fontSize:31,fontWeight:"600",color:FOREST},
 detail:{fontSize:14,lineHeight:22,color:"#536055"},verified:{fontSize:13,fontWeight:"700",color:"#255F45"},
 actions:{flexDirection:"row",flexWrap:"wrap",gap:12},actionButton:{flexGrow:1,minWidth:130},
 safety:{minHeight:44,alignSelf:"flex-start",justifyContent:"center"},safetyText:{fontSize:14,color:"#245746",fontWeight:"700",textDecorationLine:"underline"},
 detailCard:{padding:24,gap:12,borderRadius:16,backgroundColor:"#FFFDFA",borderWidth:1,borderColor:"#E9E0D3"},
 sectionTitle:{fontFamily:FontFamilies.editorial,fontSize:26,fontWeight:"600",color:FOREST},
 label:{fontSize:13,fontWeight:"700",color:"#6B644E"},value:{fontSize:16,lineHeight:24,color:FOREST,textTransform:"capitalize"},
 galleryImage:{width:240,height:240,borderRadius:12,backgroundColor:"#EFE5D5"},
 center:{minHeight:240,justifyContent:"center",alignItems:"center",gap:12},empty:{minHeight:220,padding:24,borderRadius:16,backgroundColor:"#FCF8F0",gap:12},
 error:{color:"#B42318",fontSize:14},
});
