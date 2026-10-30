import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Colors } from "@/constants/Colors";
import { FontFamilies } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/lib/AuthProvider";
import { loadConversationList, type ConversationSummary } from "@/lib/messaging";

export default function MatchesScreen() {
 const router=useRouter();
 const {user}=useAuth();
 const palette=Colors[useColorScheme()??"light"];
 const [items,setItems]=useState<ConversationSummary[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const load=useCallback(async()=>{
   if(!user?.id){setItems([]);setLoading(false);return;}
   setLoading(true);setError("");
   try{setItems(await loadConversationList());}
   catch{setError("Your matches could not be loaded. Try again.");}
   finally{setLoading(false);}
 },[user?.id]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 return <ScrollView testID="sincera-matches-list" style={[styles.root,{backgroundColor:palette.background}]} contentContainerStyle={styles.content}>
   <Text style={styles.kicker}>YOUR CONNECTIONS</Text>
   <Text accessibilityRole="header" style={[styles.title,{color:palette.text}]}>The feeling is mutual.</Text>
   <Text style={[styles.description,{color:palette.textSecondary}]}>Mutual likes. Private conversations.</Text>
   {loading?<ActivityIndicator color="#17362D"/>:null}
   {error?<View style={styles.card}><Text accessibilityRole="alert" style={{color:palette.danger}}>{error}</Text><Pressable accessibilityRole="button" style={styles.linkBox} onPress={()=>void load()}><Text style={styles.link}>Try again</Text></Pressable></View>:null}
   {!loading&&!error&&items.length===0?<View style={styles.empty}>
     <Text style={[styles.emptyTitle,{color:palette.text}]}>No matches yet</Text>
     <Text style={[styles.description,{color:palette.textSecondary}]}>A mutual like becomes a match. Meet people who share your intentions.</Text>
     <Pressable accessibilityRole="button" style={styles.action} onPress={()=>router.push("/(tabs)/people" as any)}><Text style={styles.actionText}>Explore people</Text></Pressable>
   </View>:null}
   {items.map(item=><View key={item.matchId} style={[styles.card,{backgroundColor:palette.surface,borderColor:palette.border}]}>
     <View style={styles.cardRow}>
       <View style={styles.avatar}><Text style={styles.avatarInitial}>{item.counterpartName.slice(0,1).toUpperCase()}</Text></View>
       <View style={styles.cardCopy}><Text style={[styles.name,{color:palette.text}]}>{item.counterpartName}</Text><Text numberOfLines={2} style={[styles.description,{color:palette.textSecondary}]}>{item.lastMessage||"A new connection starts with hello."}</Text></View>
     </View>
     <View style={styles.actions}>
       <Pressable accessibilityRole="button" style={styles.action} onPress={()=>router.push(`/(tabs)/(chats)/${item.id}` as any)}><Text style={styles.actionText}>Open chat</Text></Pressable>
       <Pressable accessibilityRole="button" style={styles.linkBox} onPress={()=>router.push({pathname:"/(safety)/report-modal",params:{targetId:item.counterpartId,targetName:item.counterpartName,source:"matches",matched:"1"}} as any)}><Text style={styles.link}>Safety options ···</Text></Pressable>
     </View>
   </View>)}
   <Text style={[styles.footer,{color:palette.textSecondary}]}>Sincera · Intentional connections. Adults 18+.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 root:{flex:1},content:{width:"100%",maxWidth:1120,alignSelf:"center",paddingHorizontal:22,paddingVertical:30,paddingBottom:48,gap:16},
 kicker:{fontSize:12,fontWeight:"700",letterSpacing:1.8,color:"#946B34"},
 title:{fontFamily:FontFamilies.editorial,fontSize:36,lineHeight:43,fontWeight:"600"},
 description:{fontSize:15,lineHeight:24},
 empty:{padding:28,borderRadius:16,borderWidth:1,borderColor:"#E9E0D3",backgroundColor:"#FFFDFA",alignItems:"flex-start",gap:12,marginTop:8},
 emptyTitle:{fontFamily:FontFamilies.editorial,fontSize:29,fontWeight:"600"},
 card:{padding:20,borderWidth:1,borderRadius:15,borderColor:"#E9E0D3",gap:14},
 cardRow:{flexDirection:"row",gap:13,alignItems:"center"},avatar:{width:58,height:58,borderRadius:29,backgroundColor:"#EFE1C7",justifyContent:"center",alignItems:"center"},
 avatarInitial:{fontSize:23,color:"#17362D",fontWeight:"700"},cardCopy:{flex:1,gap:4},name:{fontSize:19,fontWeight:"700"},
 actions:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:10},action:{paddingHorizontal:20,minHeight:44,justifyContent:"center",backgroundColor:"#E7B96A",borderRadius:24},
 actionText:{fontSize:14,color:"#17362D",fontWeight:"700"},linkBox:{minHeight:44,justifyContent:"center",paddingHorizontal:9},link:{color:"#245746",fontSize:14,fontWeight:"700"},
 footer:{fontSize:12,paddingTop:18}
});
