import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/lib/AuthProvider';
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
  router.push((item.kind==='message'&&item.conversation_id? '/(tabs)/(chats)/'+item.conversation_id:'/(tabs)/(chats)/match') as any);
 };
 return <ScrollView testID="sincera-activity" style={{flex:1,backgroundColor:'#FCF8F0'}} contentContainerStyle={{padding:22,gap:16,maxWidth:960,width:'100%',alignSelf:'center'}}>
   <Text style={{fontSize:12,color:'#936B30',letterSpacing:2,fontWeight:'700'}}>NOTIFICATIONS</Text>
   <Text accessibilityRole="header" style={{fontFamily:'Georgia',fontSize:34,color:'#17362D'}}>Good things, quietly delivered.</Text>
   <Text style={{fontSize:15,lineHeight:23,color:'#526057'}}>Private activity, without sharing the contents of your messages.</Text>
   <Pressable accessibilityRole="button" onPress={()=>void refresh()} style={{backgroundColor:'#E7B96A',padding:13,borderRadius:25,alignSelf:'flex-start'}}><Text style={{color:'#17362D',fontWeight:'700'}}>Refresh</Text></Pressable>
   {loading?<ActivityIndicator/>:null}
   {error?<Text accessibilityRole="alert" style={{color:'#A33636'}}>{error}</Text>:null}
   {!loading&&!error&&!items.length?<Text style={{color:'#526057'}}>All caught up. Your mutual matches and message activity will appear here.</Text>:null}
   {items.map(item=><Pressable key={item.id} disabled={busy} accessibilityRole="button" onPress={()=>void open(item)} style={{padding:19,backgroundColor:'#FFFDFA',borderWidth:1,borderColor:'#E6DDCF',borderRadius:16,gap:6}}>
    <Text style={{color:'#17362D',fontSize:17,fontWeight:'700'}}>{item.kind==='match'?'The feeling is mutual.':'A private message arrived.'}{item.read_at?'':' · New'}</Text>
    <Text style={{fontSize:13,color:'#526057'}}>{new Date(item.created_at).toLocaleString()} · Open</Text>
   </Pressable>)}
   <Text style={{fontSize:12,color:'#526057'}}>This inbox contains Sincera Preview activity only. Existing Bubble notifications are not transferred.</Text>
 </ScrollView>;
}