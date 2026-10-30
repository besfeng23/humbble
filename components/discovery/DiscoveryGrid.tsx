import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Colors } from "@/constants/Colors";
import { FontFamilies } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { getDiscoveryPage, recordSwipe, type DiscoveryCard } from "@/lib/discovery";

type Intent = "" | "serious_relationship" | "long_term_dating" | "cultural_connection_and_dating";
const INTENTS: {label:string;value:Intent}[] = [
  {label:"Any intention",value:""}, {label:"Serious relationship",value:"serious_relationship"},
  {label:"Long-term dating",value:"long_term_dating"},
  {label:"Cultural connection",value:"cultural_connection_and_dating"},
];
const GREEN="#17362D";
const pretty=(value:string)=>value.replace(/_/g," ");

/** Account for page gutters and FlatList padding; no phone-width horizontal overflow. */
export function getBubbleGridCardWidth(viewportWidth:number,columns:number):number {
 const available=Math.max(0,Math.min(viewportWidth-36,1120)-32);
 return Math.max(0,(available-(columns-1)*14)/columns);
}

export function DiscoveryGrid() {
 const router=useRouter();
 const palette=Colors[useColorScheme()??"light"];
 const {width}=useWindowDimensions();
 const columns=width>=1020?3:width>=680?2:1;
 const cardWidth=getBubbleGridCardWidth(width,columns);
 const [items,setItems]=useState<DiscoveryCard[]>([]);
 const [loading,setLoading]=useState(true);
 const [moreBusy,setMoreBusy]=useState(false);
 const [hasMore,setHasMore]=useState(false);
 const [error,setError]=useState("");
 const [quota,setQuota]=useState(false);
 const [busy,setBusy]=useState<string|null>(null);
 const [matched,setMatched]=useState<DiscoveryCard|null>(null);
 const [query,setQuery]=useState("");
 const [minAge,setMinAge]=useState("");
 const [maxAge,setMaxAge]=useState("");
 const [intent,setIntent]=useState<Intent>("");
 const [filtersOpen,setFiltersOpen]=useState(width>=760);
 const [advancedOpen,setAdvancedOpen]=useState(false);
 const cursor=useRef<string|null>(null);
 const seen=useRef<Set<string>>(new Set());
 const started=useRef(false);
 const load=useCallback(async (append:boolean)=>{
   if(append){setMoreBusy(true);}else{setLoading(true);setItems([]);cursor.current=null;seen.current.clear();}
   setError("");
   try{
     const page=await getDiscoveryPage(append?cursor.current:null);
     const fresh=page.items.filter(item=>{if(seen.current.has(item.profile_id))return false;seen.current.add(item.profile_id);return true;});
     setItems(current=>append?[...current,...fresh]:fresh);
     cursor.current=page.nextCursor;
     setHasMore(Boolean(page.nextCursor) && fresh.length>0);
   }catch(e){setError(e instanceof Error?e.message:"Discovery is temporarily unavailable.");}
   finally{setLoading(false);setMoreBusy(false);}
 },[]);
 useEffect(()=>{if(started.current)return;started.current=true;void load(false);},[load]);
 const filtered=items.filter(item=>{
   const search=query.trim().toLocaleLowerCase();
   if(search&&!([item.display_name,item.city_region,pretty(item.relationship_intention),...(item.shared_interests||[])].filter(Boolean).join(" ").toLowerCase().includes(search)))return false;
   const low=Number(minAge),high=Number(maxAge);
   if(minAge&&Number.isFinite(low)&&item.age<low)return false;
   if(maxAge&&Number.isFinite(high)&&item.age>high)return false;
   if(intent&&item.relationship_intention!==intent)return false;
   return true;
 });
 async function swipe(item:DiscoveryCard,direction:"like"|"pass"){
   if(busy)return;
   setBusy(item.profile_id);setError("");
   try{
     const result=await recordSwipe(item.profile_id,direction);
     setItems(current=>current.filter(c=>c.profile_id!==item.profile_id));
     if(result.matched&&direction==="like")setMatched(item);
     if(direction==="like"&&result.likes_remaining===0)setQuota(true);
   }catch(e){setError(e instanceof Error?e.message:"Your action could not be saved. Try again.");}
   finally{setBusy(null);}
 }
 function reset(){setQuery("");setMinAge("");setMaxAge("");setIntent("");}
 const input=(label:string,value:string,onChange:(v:string)=>void,keyboardType?:"numeric")=>
 <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>
 <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType={keyboardType} autoCapitalize="none" placeholder={label==="Search profiles"?"Name, interests or region":"Any"} placeholderTextColor="#766E61" style={styles.fieldInput}/></View>;
 return <View testID="sincera-discovery-grid" style={[styles.root,{backgroundColor:palette.background}]}>
   <View style={styles.filterHeader}>
     <Pressable accessibilityRole="button" accessibilityState={{expanded:filtersOpen}} onPress={()=>setFiltersOpen(o=>!o)} style={styles.filterToggle}><Text style={styles.filterToggleText}>{filtersOpen?"Hide filters":"Refine my search"}</Text></Pressable>
     <Text style={styles.filterHelp}>Explore people first. Refine the results only when you need to.</Text>
   </View>
   {filtersOpen?<View style={styles.filterPanel}>
     <View style={styles.filterRow}>
       {input("Search profiles",query,setQuery)}
       {input("Minimum age",minAge,setMinAge,"numeric")}
       {input("Maximum age",maxAge,setMaxAge,"numeric")}
     </View>
     <View style={styles.intents}>
       {INTENTS.map(option=><Pressable key={option.value} accessibilityRole="button" accessibilityState={{selected:intent===option.value}} onPress={()=>setIntent(option.value)} style={[styles.chip,intent===option.value&&styles.chipOn]}><Text style={[styles.chipText,intent===option.value&&styles.chipTextOn]}>{option.label}</Text></Pressable>)}
     </View>
     <View style={styles.filterToolbar}>
       <Pressable accessibilityRole="button" onPress={()=>setAdvancedOpen(v=>!v)} style={styles.textButton}><Text style={styles.toolbarText}>Advanced filters {advancedOpen?"−":"+"}</Text></Pressable>
       <Pressable accessibilityRole="button" onPress={reset} style={styles.textButton}><Text style={styles.toolbarText}>Reset filters</Text></Pressable>
       <Pressable accessibilityRole="button" onPress={()=>router.push("/(tabs)/discover/filters" as any)} style={styles.textButton}><Text style={styles.toolbarText}>Match preferences</Text></Pressable>
     </View>
     {advancedOpen?<Text style={styles.filterNote}>Country, gender, religion, lifestyle and language filters are not yet connected to server-side discovery. The active controls above filter the profiles already loaded on this page. Set your permanent age range in Match preferences.</Text>:null}
   </View>:null}
   {matched?<View testID="discovery-grid-match" style={styles.matchBox}><Text style={styles.matchText}>The feeling is mutual with {matched.display_name}.</Text><Pressable accessibilityRole="button" onPress={()=>router.push("/(tabs)/matches" as any)}><Text style={styles.matchLink}>Open matches</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>setMatched(null)}><Text style={styles.matchLink}>Keep exploring</Text></Pressable></View>:null}
   {quota?<Text testID="discovery-grid-quota" style={styles.notice}>Your daily like allowance has been reached. You can still view profiles.</Text>:null}
   {error?<View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>void load(false)}><Text style={styles.toolbarText}>Try again</Text></Pressable></View>:null}
   {loading?<View style={styles.loading}><ActivityIndicator color={GREEN}/><Text style={styles.filterHelp}>Finding eligible profiles…</Text></View>:null}
   {!loading?<FlatList key={columns} testID="discovery-browse-results" data={filtered} numColumns={columns}
      columnWrapperStyle={columns>1?{gap:14}:undefined} keyExtractor={item=>item.profile_id}
      contentContainerStyle={styles.gridContent} renderItem={({item})=><View style={[styles.card,{width:cardWidth,backgroundColor:palette.surface,borderColor:palette.border}]} testID={`discovery-grid-profile-${item.profile_id}`}>
       {item.imageUrl?<Image source={{uri:item.imageUrl}} accessibilityLabel={`Profile photo of ${item.display_name}`} style={styles.photo}/>:<View style={[styles.photo,styles.privatePhoto]}><View style={styles.initialAvatar}><Text style={styles.initialAvatarText}>{item.display_name.trim().slice(0,1).toUpperCase() || "S"}</Text></View><Text style={styles.privatePhotoLabel}>Photos shared at this member’s pace.</Text></View>}
       <View style={styles.cardBody}>
         <View style={styles.cardTitleRow}><Text style={[styles.cardTitle,{color:palette.text}]}>{item.display_name}, {item.age}</Text>{item.is_verified?<Text style={styles.verified}>Verified</Text>:null}</View>
         <Text style={styles.meta}>{item.city_region||"Location not shared"}</Text>
         <Text style={styles.meta}>{pretty(item.relationship_intention)}</Text>
         {item.shared_interests?.length?<Text style={styles.meta} numberOfLines={2}>{item.shared_interests.slice(0,4).join(" · ")}</Text>:null}
         <Pressable accessibilityRole="link" onPress={()=>router.push(`/(tabs)/discover/${item.profile_id}` as any)} style={styles.viewLink}><Text style={styles.toolbarText}>View profile</Text></Pressable>
         <View style={styles.actionRow}>
           <Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={()=>void swipe(item,"pass")} style={styles.pass}><Text style={styles.passText}>Pass</Text></Pressable>
           <Pressable accessibilityRole="button" disabled={Boolean(busy)||quota} onPress={()=>void swipe(item,"like")} style={styles.like}><Text style={styles.likeText}>Like</Text></Pressable>
         </View>
         <View style={styles.safetyRow}><Pressable accessibilityRole="button" onPress={()=>router.push({pathname:"/(safety)/report-modal",params:{targetId:item.profile_id,targetName:item.display_name,source:"discovery"}} as any)} style={styles.safetyLink}><Text style={styles.safetyText}>Block</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>router.push({pathname:"/(safety)/report-modal",params:{targetId:item.profile_id,targetName:item.display_name,source:"discovery"}} as any)} style={styles.safetyLink}><Text style={styles.safetyText}>Report</Text></Pressable></View>
       </View>
     </View>} ListEmptyComponent={!error?<View style={styles.empty}><Text style={styles.emptyTitle}>The right hello hasn't appeared yet.</Text><Text style={styles.filterHelp}>No member profiles match this search yet. Try clearing filters or broadening preferences.</Text><Pressable accessibilityRole="button" style={styles.like} onPress={reset}><Text style={styles.likeText}>Clear my filters</Text></Pressable></View>:null}
     ListFooterComponent={hasMore?<Pressable accessibilityRole="button" disabled={moreBusy} onPress={()=>void load(true)} style={styles.loadMore}><Text style={styles.toolbarText}>{moreBusy?"Loading…":"Show more profiles"}</Text></Pressable>:<Text style={styles.footer}>Sincera · Intentional connections. Adults 18+.</Text>}/>:null}
 </View>;
}
const styles=StyleSheet.create({
 root:{flex:1,width:"100%",maxWidth:1120,alignSelf:"center"},
 filterHeader:{paddingHorizontal:16,gap:8,paddingBottom:12},filterToggle:{backgroundColor:"#1D4034",minHeight:44,paddingHorizontal:17,borderRadius:25,alignSelf:"flex-start",justifyContent:"center"},filterToggleText:{color:"#FFF8EF",fontWeight:"700"},filterHelp:{color:"#596358",fontSize:14,lineHeight:22},
 filterPanel:{borderColor:"#E7DFD2",borderWidth:1,backgroundColor:"#FFFCF7",borderRadius:15,padding:15,marginHorizontal:15,marginBottom:18,gap:12},
 filterRow:{flexDirection:"row",flexWrap:"wrap",gap:12},
 field:{gap:6,minWidth:145,flexBasis:200,flexGrow:1},fieldLabel:{color:GREEN,fontWeight:"700",fontSize:13},
 fieldInput:{height:46,borderWidth:1,borderRadius:9,borderColor:"#D5CCBE",paddingHorizontal:12,color:GREEN,backgroundColor:"#FFFEFB"},
 intents:{flexDirection:"row",flexWrap:"wrap",gap:7},chip:{borderWidth:1,borderColor:"#D9CEBA",paddingHorizontal:12,minHeight:36,borderRadius:20,justifyContent:"center"},chipOn:{backgroundColor:"#1D4034",borderColor:"#1D4034"},chipText:{color:GREEN,fontSize:12,fontWeight:"600"},chipTextOn:{color:"#FFFCF5"},
 filterToolbar:{flexDirection:"row",gap:14,flexWrap:"wrap",alignItems:"center"},textButton:{minHeight:36,justifyContent:"center",paddingHorizontal:4},toolbarText:{color:"#245C49",fontWeight:"700",fontSize:14},filterNote:{fontSize:13,lineHeight:21,color:"#755B36"},
 matchBox:{backgroundColor:"#17362D",borderRadius:13,padding:15,marginHorizontal:16,marginBottom:14,gap:10},matchText:{fontFamily:FontFamilies.editorial,color:"#FCF8F0",fontSize:24},matchLink:{color:"#E7B96A",fontWeight:"700",fontSize:14},
 notice:{marginHorizontal:16,padding:10,backgroundColor:"#FAEEDB",color:"#594C34",borderRadius:9,fontSize:14},
 error:{padding:15,gap:8},errorText:{color:"#A52F2F",fontSize:14},loading:{padding:25,gap:10,alignItems:"center"},
 gridContent:{paddingHorizontal:16,paddingBottom:35,gap:14},
 card:{borderWidth:1,borderRadius:14,overflow:"hidden",marginBottom:14},photo:{width:"100%",height:312,backgroundColor:"#EAE4D7"},privatePhoto:{alignItems:"center",justifyContent:"center",gap:12},initialAvatar:{width:96,height:96,borderRadius:48,backgroundColor:"#EBD9B8",alignItems:"center",justifyContent:"center"},initialAvatarText:{fontFamily:FontFamilies.editorial,fontSize:40,fontWeight:"600",color:GREEN},privatePhotoLabel:{color:"#667065",textAlign:"center",padding:15,fontSize:13},
 cardBody:{padding:15,gap:9},cardTitleRow:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:6},cardTitle:{fontFamily:FontFamilies.editorial,fontSize:24,fontWeight:"600",flexShrink:1},verified:{fontSize:11,color:"#1F5544",backgroundColor:"#DCE8DA",borderRadius:15,overflow:"hidden",paddingHorizontal:8,paddingVertical:4},
 meta:{color:"#536055",fontSize:13,lineHeight:18,textTransform:"capitalize"},viewLink:{minHeight:38,justifyContent:"center"},actionRow:{flexDirection:"row",gap:9},
 pass:{minHeight:44,flex:1,justifyContent:"center",alignItems:"center",borderWidth:1,borderColor:"#D4CBBE",borderRadius:23},passText:{color:GREEN,fontWeight:"700",fontSize:14},
 like:{minHeight:44,flex:1,justifyContent:"center",alignItems:"center",backgroundColor:"#E7B96A",paddingHorizontal:17,borderRadius:23},likeText:{color:GREEN,fontWeight:"700",fontSize:14},
 safetyRow:{flexDirection:"row",gap:18},safetyLink:{minHeight:36,justifyContent:"center"},safetyText:{color:"#62695E",fontSize:12,textDecorationLine:"underline"},
 empty:{padding:22,backgroundColor:"#FFFCF7",borderRadius:15,gap:12,minHeight:240,justifyContent:"center",alignItems:"flex-start",borderWidth:1,borderColor:"#E7DFD2"},emptyTitle:{color:GREEN,fontFamily:FontFamilies.editorial,fontSize:27,fontWeight:"600"},
 loadMore:{padding:14,alignItems:"center",minHeight:44},footer:{padding:18,color:"#697268",fontSize:12,textAlign:"center"}
});
