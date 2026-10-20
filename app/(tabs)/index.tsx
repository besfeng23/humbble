import { Octicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";

import Header from "@/components/Header";
import { HitSlop, TouchTargets } from "@/constants/Spacing";

const LikedYou = () => {
  const router = useRouter();

  const button = () => (
    <Pressable
      testID="likes-filter-btn"
      hitSlop={HitSlop.default}
      onPress={() => router.push("/(tabs)/discover/filters" as any)}
      accessibilityRole="button"
      accessibilityLabel="Open discovery filters"
      style={{
        minWidth: TouchTargets.minimum,
        minHeight: TouchTargets.minimum,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Octicons name="filter" size={24} color="black" />
    </Pressable>
  );

  return (
    <ScrollView testID="scr-14-liked-you" style={{ paddingHorizontal: 8 }}>
      <Header headerTitle={"Liked You"} button={button} />
      <Text style={{ fontWeight: "300" }}>
        When people are into you, they'll appear here. Enjoy
      </Text>
      <View
        style={{
          alignSelf: "center",
          alignItems: "center",
          marginTop: 60,
          marginBottom: 40,
          gap: 12,
          paddingHorizontal: 10,
        }}
      >
        <Image
          source={{
            uri: "https://plus.unsplash.com/premium_vector-1732639583203-83ff3f727fe8?q=80&w=2842&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
          }}
          style={{ width: 200, height: 200, borderRadius: 20 }}
        />
        <Text
          style={{
            fontSize: 24,
            fontWeight: "bold",
            color: "#1a1a1a",
            textAlign: "center",
          }}
        >
          Get Spotlight for more likes
        </Text>
        <Text
          style={{
            fontSize: 18,
            color: "#1a1a1a",
            textAlign: "center",
            fontWeight: "300",
          }}
        >
          You'll be shown ahead of other people for 30 minutes.
        </Text>
        <Pressable
          testID="likes-get-spotlight-btn"
          accessibilityRole="button"
          accessibilityLabel="Get Spotlight and view Humbble Reserve upgrade"
          onPress={() => router.push("/(paywall)/upgrade" as any)}
          style={{
            width: 220,
            minHeight: TouchTargets.comfortable,
            backgroundColor: "#1a1a1a",
            padding: 12,
            borderRadius: 30,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontSize: 20, fontWeight: "600" }}>
            Get Spotlight
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};

export default LikedYou;
