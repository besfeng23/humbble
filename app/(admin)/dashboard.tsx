import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ModerationLayout } from '@/components/layout';
import { moderationListQueue, type ModerationQueueRow } from '@/lib/rpc';
export default function SinceraAdminOverview() {
 const router=useRouter();
 const [reports,setReports]=useState<ModerationQueueRow[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  const r=await moderationListQueue({filter:'all',limit:50,offset:0});
  if(r.error)setError(r.error.code==='42501'?'Moderator permission required.':'Cannot load operational reports.');
  else setReports(r.data||[]);
  setLoading(false);
 },[]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 const active=reports.filter(r=>!r.case_status||r.case_status==='open'||r.case_status==='in_review'||r.case_status==='appealed').length;
 const urgent=reports.filter(r=>r.severity==='urgent').length;
 const cards=[
  ['Reports in sample',reports.length.toString(),'Most recent 50 records, not a company-wide lifetime total'],
  ['Needs attention',active.toString(),'New, reviewing or appealed cases in sample'],
  ['Urgent priority',urgent.toString(),'Urgent safety reports in sample']
 ] as const;
 return <ModerationLayout testID="sincera-admin-overview" title="Sincera administration" subtitle="Protect member privacy. Review carefully." fallbackHref="/(tabs)/profile" activeNavId="moderation-dashboard">
   <Text style={{color:'#966B2A',fontSize:12,letterSpacing:1.6,fontWeight:'700'}}>ADMIN OVERVIEW</Text>
   <Text style={{color:'#17362D',fontSize:16,lineHeight:24}}>A moderator-only operational snapshot of the current Supabase Preview. This is not the existing Bubble administrator's data.</Text>
   {loading?<ActivityIndicator/>:null}
   {error?<Text accessibilityRole="alert" style={{color:'#A43131'}}>{error}</Text>:null}
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{cards.map(([label,value,desc])=>
    <View key={label} style={{flexGrow:1,flexBasis:205,padding:21,borderWidth:1,borderColor:'#E7DECF',backgroundColor:'#FFFDFA',borderRadius:14,gap:10}}>
      <Text style={{fontWeight:'700',fontSize:14,color:'#17362D'}}>{label}</Text>
      <Text style={{fontSize:32,color:'#17362D',fontFamily:'Georgia'}}>{loading?'—':value}</Text>
      <Text style={{fontSize:12,lineHeight:19,color:'#586357'}}>{desc}</Text>
    </View>)}</View>
   <Pressable accessibilityRole="button" onPress={()=>router.push('/(admin)/moderation' as any)} style={{backgroundColor:'#17362D',padding:16,borderRadius:30,alignSelf:'flex-start'}}>
    <Text style={{color:'#FFF8ED',fontWeight:'700'}}>Open moderation queue</Text>
   </Pressable>
   <Text style={{fontSize:13,color:'#586357',lineHeight:21}}>Subscriptions, account roles, verification approvals and affiliate commissions are intentionally not exposed here until equivalent server-side reviewer permissions and tests are in place.</Text>
 </ModerationLayout>;
}