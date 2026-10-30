import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/lib/AuthProvider';
import { FontFamilies } from '@/constants/Typography';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
type Event = {id:string;kind:string;created_at:string;read_at:string|null;conversation_id:string|null};
export default function SinceraNotifications() {
 const {user}=useAuth(); const router=useRouter();
 const [items,setItems]=useState<Event[]>([]); const [loading,setLoading]=useState(true);
 const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
  if(!user?.id||!isSupabaseConfigured){setError('Sign in to view activity.');setLoading(false);return;}
  setLoading(true);setError('');
  const r=await supabase.from('notification_events').select('id,kind,created_at,read_at,conversation_id').eq('recipient_id',user.id).order('created_at',{ascending:false}).limit(50);
  if(r.error)setError('Activity could not be loaded.'); else setItems(r.data||[]);
  setLoading(false);
 },[user?.id]);
 useFocusEffect(useCallback(()=>{void refresh();},[refresh]));
 const open=async(item:Event)=>{
  if(busy)return;setBusy(true);setError('');
  const r=await supabase.rpc('mark_my_notification_read',{p_notification_id:item.id});
  setBusy(false);
  if(r.error||!r.data){setError('Could not update activity.');return;}
  setItems(xs=>xs.map(x=>x.id===item.id?{...x,read_at:x.read_at||new Date().toISOString()}:x));
  router.push((item.kind==='message'&&item.conversation_id? '/(tabs)/(chats)/'+item.conversation_id:'/(tabs)/matches') as any);
 };
 const markAll=async()=>{
  if(busy||!user?.id)return;
  const unread=items.filter(x=>!x.read_at);
  if(!unread.length)return;
  setBusy(true);setError('');
  const success=new Set<string>();let failed=0;
  for(let offset=0;offset<unread.length;offset+=5){
    const batch=unread.slice(offset,offset+5);
    const results=await Promise.allSettled(batch.map(item=>supabase.rpc('mark_my_notification_read',{p_notification_id:item.id})));
    results.forEach((result,i)=>{
      if(result.status==='fulfilled'&&!result.value.error&&result.value.data)success.add(batch[i].id);
      else failed++;
    });
  }
  setItems(xs=>xs.map(x=>success.has(x.id)?{...x,read_at:x.read_at||new Date().toISOString()}:x));
  if(failed)setError('Some activity could not be marked read. Retry the remaining items.');
  setBusy(false);
 };
 return <ScrollView testID="sincera-activity" style={{flex:1,backgroundColor:'#FCF8F0'}} contentContainerStyle={{padding:22,gap:16,maxWidth:960,width:'100%',alignSelf:'center'}}>
   <Text style={{fontSize:12,color:'#936B30',letterSpacing:2,fontWeight:'700'}}>NOTIFICATIONS</Text>
   <Text accessibilityRole="header" style={{fontFamily:FontFamilies.editorial,fontSize:40,color:'#17362D',fontWeight:'600'}}>Good things, quietly delivered.</Text>
   <Text style={{fontSize:15,lineHeight:23,color:'#526057'}}>Matches, likes, messages and updates — without exposing private details.</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
    {items.some(x=>!x.read_at)?<Pressable testID="sincera-notifications-read-all" disabled={busy} accessibilityRole="button" onPress={()=>void markAll()} style={{backgroundColor:'#E7B96A',padding:13,borderRadius:25,alignSelf:'flex-start'}}><Text style={{color:'#17362D',fontWeight:'700'}}>{busy?'Saving…':'Mark all as read'}</Text></Pressable>:null}
    <Pressable accessibilityRole="button" onPress={()=>void refresh()} style={{minHeight:44,paddingHorizontal:13,justifyContent:'center',alignSelf:'flex-start'}}><Text style={{color:'#235A48',fontWeight:'700'}}>Refresh</Text></Pressable>
   </View>
   {loading?<ActivityIndicator/>:null}
   {error?<Text accessibilityRole="alert" style={{color:'#A33636'}}>{error}</Text>:null}
   {!loading&&!error&&!items.length?<View style={{padding:22,backgroundColor:'#FFFDFA',borderWidth:1,borderColor:'#E6DDCF',borderRadius:14,gap:10}}><Text style={{fontFamily:FontFamilies.editorial,fontSize:28,color:'#17362D'}}>All caught up</Text><Text style={{color:'#526057',lineHeight:22}}>New likes, matches, and updates will appear here.</Text><Pressable accessibilityRole="link" onPress={()=>router.push('/(tabs)/people' as any)}><Text style={{color:'#235A48',fontWeight:'700'}}>Discover people</Text></Pressable></View>:null}
   {items.map(item=><Pressable key={item.id} disabled={busy} accessibilityRole="button" onPress={()=>void open(item)} style={{padding:19,backgroundColor:'#FFFDFA',borderWidth:1,borderColor:'#E6DDCF',borderRadius:16,gap:6}}>
    <Text style={{color:'#17362D',fontSize:17,fontWeight:'700'}}>{item.kind==='match'?'The feeling is mutual.':'A private message arrived.'}{item.read_at?'':' · New'}</Text>
    <Text style={{fontSize:13,color:'#526057'}}>{new Date(item.created_at).toLocaleString()} · Open</Text>
   </Pressable>)}
   <Text style={{fontSize:12,color:'#526057'}}>This inbox contains Sincera Preview activity only. Existing Bubble notifications are not transferred.</Text>
 </ScrollView>;
}