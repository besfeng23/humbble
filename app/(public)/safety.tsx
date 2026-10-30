import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PublicLayout } from "@/components/layout";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/lib/AuthProvider";

const safetyTips = [
  ["Never send money.", "Do not send money, gift cards, cryptocurrency, travel fees or banking details to anyone you meet online, even if the request sounds urgent. Report requests for funds."],
  ["Keep personal details private.", "Do not share your address, identity documents, passwords, account codes or banking credentials. Stay on-platform while you build trust; a badge does not prove someone is safe."],
  ["Meet slowly. Meet safely.", "Video chat first. If both people independently decide to meet, choose a public place, inform someone you trust and arrange your own transportation."],
  ["Your boundaries matter.", "Unmatch, block or report anyone who makes you uncomfortable. These controls remain available to every eligible member at no charge."],
  ["Recognise scams.", "Be cautious about instant declarations of love, avoiding video calls, conflicting stories, pressure to move to another app or requests for emergency payments."],
  ["International dating.", "Check travel and visa information through official government sources. Do not fund someone else's travel or share immigration documents with strangers."],
] as const;

export default function SinceraSafetyCenter() {
  const router = useRouter();
  const palette = Colors[useColorScheme() ?? "light"];
  const { session } = useAuth();
  return <PublicLayout testID="sincera-safety" title="Sincera" subtitle="Trust & safety" showBack fallbackHref="/(public)" activeNavId="public-safety">
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>TRUST & SAFETY</Text>
      <Text accessibilityRole="header" style={styles.title}>Connection should feel safe.</Text>
      <Text style={styles.intro}>Practical guidance for thoughtful dating — online and across borders.</Text>
    </View>
    <View style={styles.grid}>
      {safetyTips.map(([title,copy])=><View key={title} style={[styles.card,{backgroundColor:palette.surface,borderColor:palette.border}]}>
        <Text style={[styles.cardTitle,{color:palette.text}]}>{title}</Text>
        <Text style={[styles.copy,{color:palette.textSecondary}]}>{copy}</Text>
      </View>)}
    </View>
    <View style={styles.helpBox}>
      <Text style={styles.helpTitle}>Reporting and blocking</Text>
      <Text style={styles.helpText}>Open a member profile or conversation to choose Report, Block or Unmatch. These controls are free. If you are in immediate danger, contact local emergency services first.</Text>
      <Pressable accessibilityRole="button" style={styles.action} onPress={()=>router.push((session ? "/(tabs)/profile/blocked-users" : "/auth/signin") as any)}>
        <Text style={styles.actionText}>{session ? "Manage blocked members" : "Sign in to manage safety"}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={styles.textLink} onPress={()=>router.push("/(public)/legal/community-standards" as any)}>
        <Text style={styles.textLinkCopy}>Read Community Standards</Text>
      </Pressable>
    </View>
  </PublicLayout>;
}
const styles=StyleSheet.create({
  hero:{backgroundColor:"#17362D",borderRadius:18,padding:27,gap:14},
  eyebrow:{fontSize:12,color:"#E7C78C",fontWeight:"700",letterSpacing:2},
  title:{fontFamily:"Georgia",fontSize:40,lineHeight:48,color:"#FFF9ED"},
  intro:{fontSize:17,lineHeight:25,color:"#E7E5DA"},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:14},
  card:{flexGrow:1,flexBasis:285,padding:21,borderRadius:16,borderWidth:1,gap:10},
  cardTitle:{fontFamily:"Georgia",fontSize:24,fontWeight:"600"},
  copy:{fontSize:15,lineHeight:24},
  helpBox:{backgroundColor:"#17362D",padding:25,borderRadius:16,gap:12},
  helpTitle:{color:"#FFF9ED",fontFamily:"Georgia",fontSize:27},
  helpText:{color:"#E7E5DA",fontSize:15,lineHeight:24},
  action:{backgroundColor:"#E7B96A",minHeight:48,alignSelf:"flex-start",borderRadius:30,paddingHorizontal:20,paddingVertical:12,justifyContent:"center"},
  actionText:{color:"#193128",fontSize:14,fontWeight:"700"},
  textLink:{alignSelf:"flex-start",padding:12,minHeight:44,justifyContent:"center"},
  textLinkCopy:{color:"#F1D49D",fontSize:14,textDecorationLine:"underline"}
});