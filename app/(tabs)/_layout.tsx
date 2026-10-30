import { FontAwesome, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs, useLocalSearchParams } from "expo-router";
import React from "react";
import { Platform, useWindowDimensions } from "react-native";
import { HapticTab } from "@/components/HapticTab";
import { DatingLayout } from "@/components/layout";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

const DISCOVERY_PREVIEWS = ["feed","empty","quota","error","match"];

export default function TabLayout() {
 const scheme=useColorScheme()??"light";
 const { width }=useWindowDimensions();
 const params=useLocalSearchParams<{preview?:string}>();
 const previewAllowed=__DEV__&&DISCOVERY_PREVIEWS.includes(String(params.preview??""));
 const wideWeb=Platform.OS==="web"&&width>=768;
 return <DatingLayout testID="tabs-dating-layout" skipAuthGuard={previewAllowed}>
   <Tabs initialRouteName="people" screenOptions={{
     animation:"shift", headerShown:false, tabBarButton:HapticTab,
     tabBarActiveTintColor:"#17362D",tabBarInactiveTintColor:Colors[scheme].textSecondary,
     tabBarBackground:TabBarBackground,tabBarLabelStyle:{fontSize:11,fontWeight:"600"},
     tabBarStyle:wideWeb?{display:"none"}:Platform.OS==="ios"?{position:"absolute",backgroundColor:Colors[scheme].surface}:{backgroundColor:Colors[scheme].surface},
   }}>
    <Tabs.Screen name="people" options={{title:"Discover",tabBarIcon:({color})=><Ionicons name="people-outline" color={color} size={23}/>}}/>
    <Tabs.Screen name="index" options={{title:"Likes",tabBarIcon:({color})=><Ionicons name="heart-outline" color={color} size={23}/>}}/>
    <Tabs.Screen name="matches" options={{title:"Matches",tabBarIcon:({color})=><MaterialCommunityIcons name="handshake-outline" color={color} size={23}/>}}/>
    <Tabs.Screen name="(chats)" options={{title:"Messages",tabBarIcon:({color})=><Ionicons name="chatbubble-ellipses-outline" color={color} size={23}/>}}/>
    <Tabs.Screen name="profile" options={{title:"Profile",tabBarIcon:({color})=><FontAwesome name="user-o" color={color} size={22}/>}}/>
    <Tabs.Screen name="discover" options={{href:null,title:"Explore"}}/>
    <Tabs.Screen name="discover/[id]" options={{href:null,title:"Member profile"}}/>
    <Tabs.Screen name="discover/filters" options={{href:null,title:"Discovery filters"}}/>
    <Tabs.Screen name="notifications" options={{href:null,title:"Notifications"}}/>
    <Tabs.Screen name="profile/settings" options={{href:null,title:"Settings"}}/>
    <Tabs.Screen name="profile/notifications" options={{href:null,title:"Notification settings"}}/>
    <Tabs.Screen name="profile/blocked-users" options={{href:null,title:"Blocked members"}}/>
    <Tabs.Screen name="profile/privacy-delete" options={{href:null,title:"Privacy and deletion"}}/>
   </Tabs>
 </DatingLayout>;
}
