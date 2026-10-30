import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PublicLayout } from "@/components/layout";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

const steps = [
  ["Create your account", "Sign up with an email and password, confirm your email and adult eligibility, then accept the Terms, Privacy Notice and Community Standards. Your exact birth date stays private."],
  ["Build an honest profile", "Add a name, recent photos of yourself, broad location, languages, interests and relationship intentions. Your street address is never required."],
  ["Set your preferences", "Choose the age range of people you want to meet. More filters are planned; only settings supported by the current discovery service are active."],
  ["Discover thoughtfully", "Explore adult members whose profiles meet eligibility rules. Express interest or pass, and control your own discovery visibility."],
  ["Match and talk", "Private messaging begins after mutual interest. Block, report or unmatch at any time. Those actions do not require payment."],
] as const;
export default function SinceraHowItWorks() {
  const router=useRouter();
  const palette=Colors[useColorScheme()??"light"];
  return <PublicLayout testID="sincera-how-it-works" title="Sincera" subtitle="How it works" showBack fallbackHref="/(public)" activeNavId="public-how">
    <View style={styles.intro}>
      <Text style={styles.kicker}>HOW SINCERA WORKS</Text>
      <Text accessibilityRole="header" style={styles.heading}>Five calm steps from sign-up to a real conversation.</Text>
      <Text style={styles.lead}>Sincera is designed for adults seeking genuine connections. You do not need to pay to exchange messages after a mutual match.</Text>
    </View>
    <View style={styles.grid}>{steps.map(([title,body],i)=><View key={title} style={[styles.card,{borderColor:palette.border,backgroundColor:palette.surface}]}>
      <Text style={styles.number}>{i+1 < 10 ? "0" : ""}{i+1}</Text>
      <Text style={[styles.stepTitle,{color:palette.text}]}>{title}</Text>
      <Text style={[styles.body,{color:palette.textSecondary}]}>{body}</Text>
    </View>)}</View>
    <View style={styles.safety}><Text style={styles.safetyHeading}>Safety is part of every step.</Text><Text style={styles.safetyBody}>Blocking, reporting and privacy controls are free for every member. Never send money or identity documents to someone you met online.</Text></View>
    <Pressable accessibilityRole="button" onPress={()=>router.push("/auth/signup" as any)} style={styles.cta}><Text style={styles.ctaText}>Join Sincera free</Text></Pressable>
  </PublicLayout>;
}
const styles=StyleSheet.create({
  intro:{gap:15,paddingVertical:20},kicker:{fontSize:12,letterSpacing:2,fontWeight:"700",color:"#90651F"},heading:{fontFamily:"Georgia",fontSize:43,lineHeight:51,color:"#17362D",maxWidth:800},lead:{fontSize:17,lineHeight:27,color:"#555F56",maxWidth:760},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:14},card:{flexBasis:280,flexGrow:1,borderRadius:17,borderWidth:1,padding:23,gap:13,minHeight:205},
  number:{fontSize:14,fontWeight:"700",color:"#966C28"},stepTitle:{fontFamily:"Georgia",fontSize:26,lineHeight:31},body:{fontSize:15,lineHeight:24},
  safety:{padding:25,borderRadius:17,backgroundColor:"#17362D",gap:10},safetyHeading:{fontSize:25,color:"#FCF8F0",fontWeight:"600"},safetyBody:{fontSize:15,color:"#E9E2D3",lineHeight:23},cta:{backgroundColor:"#E7B96A",paddingVertical:16,paddingHorizontal:26,borderRadius:30,minHeight:48,alignSelf:"flex-start"},ctaText:{color:"#193128",fontSize:16,fontWeight:"700"}
});