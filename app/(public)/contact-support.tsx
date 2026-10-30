import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PublicLayout } from '@/components/layout';
import { useAuth } from '@/lib/AuthProvider';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { secureRandomUuid } from '@/lib/secureUuid';
import { SUPPORT_EMAIL, SUPPORT_EMAIL_URL } from '@/constants/Support';
const topics=['account','safety','billing','privacy','technical','other'] as const;
type Topic = typeof topics[number];
export default function ContactSupport() {
 const router=useRouter();const {user}=useAuth();
 const [topic,setTopic]=useState<Topic>('account'),[message,setMessage]=useState('');
 const [requestId,setRequestId]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const submit=async()=>{
  if(!user||!isSupabaseConfigured){setError('Please sign in first.');return;}
  if(message.trim().length<10||message.length>4000){setError('Enter a message between 10 and 4,000 characters.');return;}
  setBusy(true);setError('');setSuccess('');
  try {
    const id=requestId||secureRandomUuid();setRequestId(id);
    const r=await supabase.rpc('submit_support_request',{p_topic:topic,p_body:message.trim(),p_client_request_id:id});
    if(r.error||!r.data){setError('Your request could not be saved. Retry, or email support.');}
    else {setSuccess('Support request received. You can review its status in your account.');setMessage('');setRequestId(null);}
  } catch {setError('Your request could not be saved. Please retry.');}
  finally {setBusy(false);}
 };
 const field=(label:string,val:string,change:(s:string)=>void)=>(
  <View style={{gap:8}}><Text style={{fontSize:14,fontWeight:'700',color:'#17362D'}}>{label}</Text>
   <TextInput accessibilityLabel={label} value={val} onChangeText={change} multiline maxLength={4000} textAlignVertical="top" placeholder="How can we help?" placeholderTextColor="#777777" style={{minHeight:146,borderRadius:14,borderWidth:1,borderColor:'#D6CBB9',backgroundColor:'#FFFDFA',padding:15,fontSize:15,color:'#17362D'}} />
  </View>);
 return <PublicLayout testID="sincera-contact-support" title="Sincera" subtitle="Contact & support" showBack fallbackHref="/(public)">
   <View style={{gap:12}}>
    <Text style={{color:'#946826',fontWeight:'700',fontSize:12,letterSpacing:1.5}}>CONTACT & SUPPORT</Text>
    <Text accessibilityRole="header" style={{fontFamily:'Georgia',fontSize:36,color:'#17362D'}}>We are here to help.</Text>
    <Text style={{fontSize:15,color:'#526057',lineHeight:24}}>For urgent safety concerns, use Report or Block from the member's profile. Contact local emergency services if you are in immediate danger. Do not include passwords, card details or identity documents.</Text>
   </View>
   <View style={{padding:23,backgroundColor:'#FFFDFA',borderWidth:1,borderColor:'#E6DDCF',borderRadius:16,gap:15}}>
    {user?<><Text style={{color:'#17362D',fontWeight:'700',fontSize:18}}>Send a support request</Text>
      <Text style={{fontSize:13,color:'#526057'}}>Only signed-in members can use the secure request form.</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{topics.map(t=><Pressable key={t} accessibilityRole="button" onPress={()=>{setTopic(t);setRequestId(null);}} style={{borderRadius:25,padding:10,backgroundColor:t===topic?'#E7B96A':'#EEE8DD'}}><Text style={{color:'#17362D',textTransform:'capitalize'}}>{t}</Text></Pressable>)}</View>
      {field('Your message',message,v=>{setMessage(v);setRequestId(null);})}
      {error?<Text accessibilityRole="alert" style={{color:'#A43131'}}>{error}</Text>:null}
      {success?<Text accessibilityRole="alert" style={{color:'#176044'}}>{success}</Text>:null}
      <Pressable disabled={busy} accessibilityRole="button" onPress={()=>void submit()} style={{backgroundColor:'#17362D',minHeight:48,borderRadius:25,alignSelf:'flex-start',paddingHorizontal:22,justifyContent:'center',opacity:busy?0.6:1}}><Text style={{color:'#FFF9EF',fontWeight:'700'}}>{busy?'Sending…':'Send message'}</Text></Pressable>
     </>:<><Text style={{color:'#17362D',fontSize:18,fontWeight:'700'}}>Sign in for secure support</Text><Pressable accessibilityRole="button" onPress={()=>router.push('/auth/signin' as any)} style={{padding:13,backgroundColor:'#E7B96A',borderRadius:25,alignSelf:'flex-start'}}><Text style={{color:'#17362D',fontWeight:'700'}}>Sign in</Text></Pressable></>}
    <Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(SUPPORT_EMAIL_URL)}><Text style={{color:'#1D5E4D',textDecorationLine:'underline'}}>Email support: {SUPPORT_EMAIL}</Text></Pressable>
   </View>
   <Text style={{fontSize:13,color:'#526057'}}>The support form uses the separate Sincera Preview/Supabase backend, not the existing Bubble support database. Legal and operational support commitments remain under review.</Text>
 </PublicLayout>;
}