import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PublicLayout } from "@/components/layout";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

const requirements = [
  ["Who qualifies", "Publishers, creators and networks with genuine audiences, transparent traffic sources and a responsible marketing approach."],
  ["Prohibited traffic", "No incentivized or forced registrations, bots, cookie stuffing, misleading romantic-interest claims, fabricated testimonials, undeclared operator-run profiles or deceptive creatives."],
  ["Attribution rules", "Partner, campaign and approved sub-ID parameters can be captured only with appropriate notice and consent. Commission rates and qualified events are not final."],
  ["Privacy commitment", "Partners must never receive member names, private photos, messages, birth dates or sensitive profile details. Only approved minimal conversion signals may be shared."],
] as const;

export default function SinceraPartnerProgram() {
  const palette = Colors[useColorScheme() ?? "light"];
  return <PublicLayout testID="sincera-partner-program" title="Sincera" subtitle="Partner program" showBack fallbackHref="/(public)">
    <View style={styles.intro}>
      <Text style={styles.eyebrow}>PARTNER PROGRAM</Text>
      <Text accessibilityRole="header" style={styles.heading}>Grow with Sincera, the honest way.</Text>
      <Text style={styles.lead}>We plan to work with quality marketing partners who share our safety and advertising standards.</Text>
    </View>
    <View accessibilityRole="alert" style={styles.notice}>
      <Text style={styles.noticeTitle}>DRAFT – pending legal and payment-provider review</Text>
      <Text style={styles.noticeText}>Applications and acceptance of partner terms are temporarily paused. No commission rate, referral reward or program approval is promised. The full Sincera business model must be cleared before affiliates can advertise paid entertainment or dating products.</Text>
    </View>
    <View style={styles.grid}>{requirements.map(([title,copy])=><View key={title} style={[styles.card,{backgroundColor:palette.surface,borderColor:palette.border}]}>
      <Text style={[styles.title,{color:palette.text}]}>{title}</Text>
      <Text style={[styles.body,{color:palette.textSecondary}]}>{copy}</Text>
    </View>)}</View>
    <View style={styles.end}><Text style={styles.endTitle}>Applications paused — legal review</Text><Text style={styles.endCopy}>We will not collect partner applications until approved, versioned commercial terms and application processing are in place.</Text></View>
  </PublicLayout>;
}
const styles=StyleSheet.create({
  intro:{backgroundColor:"#17362D",padding:25,borderRadius:17,gap:12},eyebrow:{fontSize:12,fontWeight:"700",letterSpacing:2,color:"#E7C78C"},
  heading:{fontFamily:"Georgia",fontSize:39,lineHeight:48,color:"#FFFAEF"},lead:{fontSize:16,color:"#E6E6DD",lineHeight:25},
  notice:{backgroundColor:"#FFF1D1",borderColor:"#D3AD63",borderWidth:1,padding:17,borderRadius:15,gap:10},noticeTitle:{color:"#584019",fontWeight:"700",fontSize:16},noticeText:{color:"#584019",fontSize:14,lineHeight:23},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:12},card:{flexGrow:1,flexBasis:260,padding:20,borderRadius:14,borderWidth:1,gap:10},title:{fontSize:20,fontWeight:"700"},body:{fontSize:15,lineHeight:24},
  end:{backgroundColor:"#F2E9DA",padding:20,borderRadius:14,gap:8},endTitle:{fontSize:17,fontWeight:"700",color:"#17362D"},endCopy:{color:"#5B6159",fontSize:14,lineHeight:23}
});