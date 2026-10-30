import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PublicLayout } from "@/components/layout";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

const qa = [
  ["Account creation", "How do I create an account?", "Choose Join Sincera, register with your email and password, confirm you are at least 18, accept the terms and complete your profile."],
  ["Verification", "What does a verified badge mean?", "Verification is an optional process. A badge is not proof of a person's identity or a guarantee of safety. Never assume someone is safe solely because they have a badge."],
  ["Matching", "How does matching work?", "You may like or pass on profiles. A match exists only when both people like each other; the app never creates a mutual match to trigger a purchase."],
  ["Messaging", "Who can message me?", "Only people with whom you have a mutual match. Messages stop when either member blocks or unmatches."],
  ["Privacy", "Who can see my profile?", "Eligible signed-in members may discover a complete and unpaused profile. Your email and exact birth date must not appear in public member profiles."],
  ["Subscriptions", "Do I need to pay?", "No. Mutual matching, messaging your matches, blocking and reporting remain free. Live Sincera paid membership is not yet available in this preview."],
  ["Cancellation", "How do I cancel a subscription?", "Current Sincera Preview checkout is not available. If you have an existing payment from another platform, contact its authorized billing support rather than assuming it has transferred here."],
  ["Reporting", "How do I report someone?", "Open the member's profile or conversation and choose Report. Blocking is free and ends unwanted contact."],
  ["Account deletion", "How do I delete my account?", "Open Profile → Your data to submit a request. Requests are recorded for manual handling; deletion does not occur instantly."],
] as const;
export default function SinceraFAQ() {
 const palette=Colors[useColorScheme()??"light"]; const router=useRouter();
 return <PublicLayout testID="sincera-faq" title="Sincera" subtitle="Help & FAQ" showBack fallbackHref="/(public)">
   <Text style={styles.kicker}>HELP & FAQ</Text><Text accessibilityRole="header" style={[styles.heading,{color:palette.text}]}>Answers to common questions.</Text>
   <Text style={[styles.lead,{color:palette.textSecondary}]}>Clear answers about profiles, privacy, mutual matches and your account.</Text>
   <View style={styles.grid}>{qa.map(([category,q,a])=><View key={q} style={[styles.card,{backgroundColor:palette.surface,borderColor:palette.border}]}>
     <Text style={styles.category}>{category.toUpperCase()}</Text><Text style={[styles.question,{color:palette.text}]}>{q}</Text><Text style={[styles.answer,{color:palette.textSecondary}]}>{a}</Text>
   </View>)}</View>
   <Pressable accessibilityRole="button" onPress={()=>router.push("/(public)/legal/community-standards" as any)} style={styles.cta}><Text style={styles.ctaText}>Read our safety guidelines</Text></Pressable>
 </PublicLayout>;
}
const styles=StyleSheet.create({kicker:{fontSize:12,color:"#966C28",letterSpacing:1.7,fontWeight:"700"},heading:{fontFamily:"Georgia",fontSize:43,lineHeight:51},lead:{fontSize:17,lineHeight:25},grid:{gap:13},card:{padding:21,borderRadius:15,borderWidth:1,gap:10},category:{fontSize:11,fontWeight:"800",letterSpacing:1.4,color:"#966C28"},question:{fontSize:19,fontWeight:"700"},answer:{fontSize:15,lineHeight:24},cta:{backgroundColor:"#E7B96A",padding:15,borderRadius:28,alignSelf:"flex-start",minHeight:48,justifyContent:"center"},ctaText:{fontSize:15,fontWeight:"700",color:"#193128"}});