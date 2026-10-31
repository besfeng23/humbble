import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { usePremium } from "@/hooks/usePremium";
import { useAuth } from "@/lib/AuthProvider";
import { getLikedYou, type LikedYouEntry } from "@/lib/billing";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Colors } from "@/constants/Colors";
import { FontFamilies } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { showCompactMemberPageIntro } from "@/lib/sinceraMemberLayout";

const GREEN="#17362D";
type SentLike = { target_id:string; created_at:string };

export default function SinceraLikes() {
 const router=useRouter();
 const { width } = useWindowDimensions();
 const showIntro = showCompactMemberPageIntro(width);
 const {user}=useAuth();
 const premium=usePremium();
 const palette=Colors[useColorScheme()??"light"];
 const [received,setReceived]=useState<{count:number;people:LikedYouEntry[]}>({count:0,people:[]});
 const [sent,setSent]=useState<SentLike[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const load=useCallback(async()=>{
   if(!user?.id||premium.loading)return;
   setLoading(true);setError("");
   const [incoming,outgoing]=await Promise.allSettled([
     getLikedYou(premium.isPremium),
     isSupabaseConfigured ? supabase.from("swipes").select("target_id,created_at").eq("actor_id",user.id).eq("direction","like").order("created_at",{ascending:false}).limit(20) : Promise.resolve({data:[] as SentLike[],error:null}),
   ]);
   if(incoming.status==="fulfilled")setReceived(incoming.value);
   else setError("Some incoming likes could not be loaded.");
   if(outgoing.status==="fulfilled"&&!outgoing.value.error)setSent((outgoing.value.data??[]) as SentLike[]);
   else setError("Your liked profiles could not be loaded. Try again.");
   setLoading(false);
 },[user?.id,premium.isPremium,premium.loading]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 return <ScrollView testID="scr-14-liked-you" style={[styles.root,{backgroundColor:palette.background}]} contentContainerStyle={styles.body}>
   {showIntro ? <Text style={styles.eyebrow}>LIKED YOU</Text> : null}
   <Text accessibilityRole="header" style={[styles.title,!showIntro&&styles.titleMobile,{color:palette.text}]}>A spark starts here.</Text>
   {showIntro ? <Text style={[styles.subtitle,{color:palette.textSecondary}]}>Your outgoing likes and mutual connections, in one place. Seeing incoming likes is planned for a future optional membership.</Text> : null}
   {loading||premium.loading?<ActivityIndicator color={GREEN}/>:null}
   {error?<View style={styles.section}><Text accessibilityRole="alert" style={{color:palette.danger}}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>void load()}><Text style={styles.inlineLink}>Try again</Text></Pressable></View>:null}
   <View style={[styles.section,{borderColor:palette.border,backgroundColor:palette.surface}]}>
     <Text style={[styles.sectionTitle,{color:palette.text}]}>Incoming likes</Text>
     {premium.isPremium&&received.people.length>0?received.people.map(p=>
       <Pressable testID="likes-row" accessibilityRole="button" key={p.profile_id} style={styles.personRow} onPress={()=>router.push(`/(tabs)/discover/${p.profile_id}` as any)}>
         <View style={styles.avatar}><Text style={styles.avatarText}>{(p.display_name||"S").charAt(0).toUpperCase()}</Text></View>
         <Text style={[styles.name,{color:palette.text}]}>{p.display_name||"Sincera member"}</Text>
         <Text style={styles.inlineLink}>View profile</Text>
       </Pressable>)
       :<View style={styles.blank}>
         <Text style={[styles.blankTitle,{color:palette.text}]}>{received.count>0 ? `${received.count} ${received.count===1?"person likes":"people like"} you` : "A little space for what’s next"}</Text>
         <Text style={[styles.subtitle,{color:palette.textSecondary}]}>{premium.isPremium?"No new likes yet.":"See incoming interest with eligible membership access. Membership is not currently on sale."}</Text>
       </View>}
   </View>
   <View style={[styles.section,{borderColor:palette.border,backgroundColor:palette.surface}]}>
     <View style={styles.sectionHead}>
       <Text style={[styles.sectionTitle,{color:palette.text}]}>People you’ve liked</Text>
       <Pressable accessibilityRole="button" onPress={()=>router.push("/(tabs)/matches" as any)} style={styles.actionGhost}><Text style={styles.inlineLink}>Open matches</Text></Pressable>
     </View>
     {sent.length ? <Text style={[styles.subtitle,{color:palette.textSecondary}]}>{sent.length} recent outgoing {sent.length===1?"like":"likes"}. Names are shown only when the member's visibility permissions allow them.</Text> : <Text style={[styles.subtitle,{color:palette.textSecondary}]}>You haven't expressed interest yet. Look for someone who shares your intentions.</Text>}
     <Pressable accessibilityRole="button" onPress={()=>router.push("/(tabs)/people" as any)} style={styles.action}><Text style={styles.actionText}>Discover people</Text></Pressable>
   </View>
   <Text style={[styles.footer,{color:palette.textSecondary}]}>Sincera · Intentional connections. Adults 18+.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 root:{flex:1},body:{width:"100%",maxWidth:1120,alignSelf:"center",paddingHorizontal:22,paddingVertical:32,paddingBottom:55,gap:17},
 eyebrow:{fontWeight:"700",fontSize:12,letterSpacing:1.8,color:"#98692B"},
 title:{fontFamily:FontFamilies.editorial,fontSize:36,lineHeight:43,fontWeight:"600"},
 titleMobile:{fontSize:26,lineHeight:33},
 subtitle:{fontSize:15,lineHeight:24,maxWidth:820},
 section:{borderWidth:1,borderRadius:16,padding:23,gap:15},
 sectionTitle:{fontFamily:FontFamilies.editorial,fontSize:30,fontWeight:"600"},
 sectionHead:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:8},
 blank:{paddingVertical:19,alignItems:"flex-start",gap:12},
 blankTitle:{fontFamily:FontFamilies.editorial,fontSize:26,fontWeight:"600"},
 personRow:{minHeight:70,flexDirection:"row",gap:13,alignItems:"center",borderBottomColor:"#EAE1D4",borderBottomWidth:1,paddingVertical:10},
 avatar:{width:47,height:47,borderRadius:24,backgroundColor:"#EBDECA",alignItems:"center",justifyContent:"center"},
 avatarText:{color:GREEN,fontWeight:"700",fontSize:20},name:{fontSize:16,fontWeight:"600",flex:1},
 action:{alignSelf:"flex-start",minHeight:44,justifyContent:"center",paddingHorizontal:20,backgroundColor:"#E7B96A",borderRadius:24},
 actionText:{color:GREEN,fontWeight:"700",fontSize:14},actionGhost:{minHeight:44,justifyContent:"center",paddingHorizontal:8},
 inlineLink:{color:"#2B634F",fontWeight:"700",fontSize:14},footer:{fontSize:12,paddingTop:16}
});