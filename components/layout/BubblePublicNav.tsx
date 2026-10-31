import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { FontFamilies } from "@/constants/Typography";
import { useAuth } from "@/lib/AuthProvider";

/** Shared web navigation mirrored from the connected Sincera Bubble Live public header.
 * Keeps secondary public pages visually consistent with the cinematic homepage.
 * Member sessions are separate Supabase Preview accounts, never Bubble sessions.
 */
const GREEN = "#17362D";
type Item = { label: string; path: string; id: string };
const links: Item[] = [
 { label: "How it works", path: "/(public)/how-it-works", id: "public-how" },
 { label: "Safety", path: "/(public)/safety", id: "public-safety" },
 { label: "Pricing", path: "/(public)/pricing", id: "public-pricing" },
];

export function BubblePublicNav({ activeNavId, testID = "sincera-public-header" }: { activeNavId?: string; testID?: string }) {
 const router = useRouter();
 const { session } = useAuth();
 const { width } = useWindowDimensions();
 const mobile = width < 760;
 const [expanded, setExpanded] = useState(false);
 const go=(path:string)=>{setExpanded(false);router.push(path as any);};
 const item=(link:Item)=><Pressable key={link.id} accessibilityRole="link" onPress={()=>go(link.path)} style={styles.navLink}>
   <Text style={[styles.navText,activeNavId===link.id&&styles.active]}>{link.label}</Text>
 </Pressable>;
 const controls=<>
   {links.map(item)}
   <Pressable accessibilityRole="link" testID={testID+"-signin"} onPress={()=>go(session?"/(tabs)/people":"/auth/signin")} style={styles.navLink}>
     <Text style={styles.navText}>{session?"Open app":"Log in"}</Text>
   </Pressable>
   {!session?<Pressable accessibilityRole="button" testID={testID+"-join"} onPress={()=>go("/auth/signup")} style={styles.goldCta}>
     <Text style={styles.ctaText}>Join free</Text>
   </Pressable>:null}
 </>;
 return <View testID={testID} style={styles.shell}>
    <View style={styles.navInner}>
     <Pressable accessibilityRole="link" onPress={()=>go("/(public)")} style={styles.brandHit}>
       <Text style={styles.brand}>sincera<Text style={styles.dot}>·</Text></Text>
     </Pressable>
     {mobile?<Pressable accessibilityRole="button" accessibilityLabel={expanded?"Close menu":"Open menu"} accessibilityState={{expanded}} onPress={()=>setExpanded(v=>!v)} style={styles.menuButton}>
       <Text style={styles.navText}>{expanded?"Close":"Menu"}</Text>
     </Pressable>:<View style={styles.navRow}>{controls}</View>}
    </View>
    {mobile&&expanded?<View style={styles.mobilePanel}>{controls}</View>:null}
 </View>;
}
const styles=StyleSheet.create({
 shell:{width:"100%",backgroundColor:"#FCF8F0",borderBottomColor:"#E6DCD0",borderBottomWidth:1,zIndex:20},
 navInner:{width:"100%",maxWidth:1160,alignSelf:"center",paddingVertical:12,paddingHorizontal:20,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:14,minHeight:68},
 brandHit:{minHeight:44,justifyContent:"center",paddingRight:16},
 brand:{fontFamily:FontFamilies.editorial,fontWeight:"600",fontSize:32,letterSpacing:-1,color:GREEN},
 dot:{color:"#C69B53"},
 navRow:{flexDirection:"row",alignItems:"center",gap:18,flexWrap:"wrap"},
 navLink:{minHeight:44,justifyContent:"center",paddingHorizontal:4},
 navText:{color:GREEN,fontSize:14,fontWeight:"600"},
 active:{textDecorationLine:"underline",textDecorationColor:"#C99B4D"},
 goldCta:{minHeight:44,backgroundColor:"#E7B96A",borderRadius:24,paddingHorizontal:20,alignItems:"center",justifyContent:"center"},
 ctaText:{color:GREEN,fontSize:14,fontWeight:"700"},
 menuButton:{minHeight:44,minWidth:52,justifyContent:"center",alignItems:"center"},
 mobilePanel:{paddingHorizontal:24,paddingVertical:12,borderTopColor:"#E6DCD0",borderTopWidth:1,alignItems:"flex-start",gap:3}
});