import {
  FontAwesome,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { Tabs, useLocalSearchParams } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { HapticTab } from "@/components/HapticTab";
import { DatingLayout } from "@/components/layout";
import { IconSymbol } from "@/components/ui/IconSymbol";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

const DISCOVERY_PREVIEWS = ["feed", "empty", "quota", "error", "match"];

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme ?? "light";
  const params = useLocalSearchParams<{ preview?: string }>();
  // Dev previews are explicit query params only; production builds always keep the auth guard.
  const previewAllowed = __DEV__ && DISCOVERY_PREVIEWS.includes(String(params.preview ?? ""));

  return (
    <DatingLayout testID="tabs-dating-layout" skipAuthGuard={previewAllowed}>
      <Tabs
        initialRouteName="people"
        screenOptions={{
          animation: "shift",
          tabBarActiveTintColor: Colors[scheme].tint,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarBackground: TabBarBackground,
          tabBarStyle: Platform.select({
            ios: {
              position: "absolute",
            },
            default: {},
          }),
        }}
      >
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color }) => (
              <FontAwesome name="user" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: "Discover",
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons
                name="compass-outline"
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="people"
          options={{
            title: "People",
            tabBarIcon: ({ color }) => (
              <IconSymbol size={28} name="person.3.fill" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="(chats)"
          options={{
            title: "Chats",
            tabBarIcon: ({ color }) => (
              <Ionicons name="chatbubble" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: "liked You",
            tabBarIcon: ({ color }) => (
              <Ionicons name="heart" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="discover/[id]"
          options={{
            href: null,
            title: "Profile Inspector",
          }}
        />
        <Tabs.Screen
          name="discover/filters"
          options={{
            href: null,
            title: "Discovery Filters",
          }}
        />
        <Tabs.Screen
          name="profile/settings"
          options={{
            href: null,
            title: "Settings",
          }}
        />
        <Tabs.Screen
          name="profile/privacy-delete"
          options={{
            href: null,
            title: "Privacy & Account Deletion",
          }}
        />
      </Tabs>
    </DatingLayout>
  );
}
