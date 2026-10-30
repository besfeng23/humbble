import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Colors } from "@/constants/Colors";
import { FontFamilies } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

type Row = { label: string; path: string };
const groups: { title: string; description: string; links: Row[] }[] = [
 { title:"Profile and discovery",description:"Share the information that helps compatible adults find a genuine connection.",links:[
  {label:"Edit my profile",path:"/(tabs)/profile"},
  {label:"Matching preferences",path:"/(tabs)/discover/filters"},
  {label:"Profile verification",path:"/(onboarding)/verify"}]},
 { title:"Privacy, safety, and notifications",description:"Choose who can find you, control alerts, and access blocking and reporting whenever you need them.",links:[
  {label:"Privacy and account controls",path:"/(tabs)/profile/settings"},
  {label:"Notification settings",path:"/(tabs)/profile/notifications"},
  {label:"Safety, blocked members, and reporting",path:"/(tabs)/profile/blocked-users"}]},
 { title:"Membership and assistance",description:"Review available plans, account support, and current billing information. A payment is not active until the provider confirms it.",links:[
  {label:"Membership and cancellation",path:"/(paywall)/billing"},
  {label:"Help and FAQ",path:"/(public)/faq"},
  {label:"Contact support",path:"/(public)/contact-support"}]}
];

/** Exact Bubble Live account settings information architecture, routed only to implemented controls. */
export default function AccountSettingsScreen() {
 const router=useRouter(),palette=Colors[useColorScheme()??"light"];
 const go=(path:string)=>router.push(path as any);
 return <ScrollView testID="sincera-account-settings" style={[styles.root,{backgroundColor:palette.background}]} contentContainerStyle={styles.body}>
   <Text style={styles.eyebrow}>SINCERA · MEMBER ACCOUNT</Text>
   <Text accessibilityRole="header" style={[styles.title,{color:palette.text}]}>Your account. Your boundaries.</Text>
   <Text style={[styles.lead,{color:palette.textSecondary}]}>All your important controls in one place. Manage your profile, discoverability, privacy, safety, and membership at your own pace.</Text>
   <View style={styles.grid}>{groups.map(section=><View key={section.title} style={[styles.card,{backgroundColor:palette.surface,borderColor:palette.border}]}>
     <Text style={styles.cardTitle}>{section.title}</Text>
     <Text style={[styles.copy,{color:palette.textSecondary}]}>{section.description}</Text>
     <View style={styles.links}>{section.links.map(item=><Pressable key={item.label} accessibilityRole="link" onPress={()=>go(item.path)} style={styles.link}>
       <Text style={styles.linkText}>{item.label}</Text><Text style={styles.arrow}>›</Text>
     </Pressable>)}</View>
   </View>)}</View>
   <Text style={[styles.foot,{color:palette.textSecondary}]}>Privacy requests and account deletion are available from Privacy and account controls. Sincera requires mutual interest before messaging.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 root:{flex:1},body:{width:"100%",maxWidth:1120,alignSelf:"center",paddingHorizontal:24,paddingVertical:30,paddingBottom:50,gap:16},
 eyebrow:{fontWeight:"700",color:"#966B2F",fontSize:12,letterSpacing:1.7},
 title:{fontFamily:FontFamilies.editorial,fontSize:36,lineHeight:43,fontWeight:"600"},
 lead:{fontSize:16,lineHeight:25,maxWidth:770},
 grid:{flexDirection:"row",flexWrap:"wrap",gap:16},
 card:{borderRadius:15,borderWidth:1,flexGrow:1,flexBasis:310,padding:22,gap:12},
 cardTitle:{fontFamily:FontFamilies.editorial,fontSize:27,color:"#17362D",fontWeight:"600"},
 copy:{fontSize:14,lineHeight:22},
 links:{gap:1,borderTopColor:"#E8DFD1",borderTopWidth:1,marginTop:10},
 link:{minHeight:47,paddingVertical:9,flexDirection:"row",gap:10,alignItems:"center",justifyContent:"space-between",borderBottomColor:"#EEE7DF",borderBottomWidth:1},
 linkText:{color:"#235646",fontWeight:"600",fontSize:14,flex:1},
 arrow:{fontSize:21,color:"#A08356"},
 foot:{fontSize:13,lineHeight:22,maxWidth:820,paddingTop:10}
});