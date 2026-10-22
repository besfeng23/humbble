import { Octicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import Header from "@/components/Header";
import { HitSlop, TouchTargets } from "@/constants/Spacing";
import { usePremium } from "@/hooks/usePremium";
import { getLikedYou, type LikedYouEntry } from "@/lib/billing";

const LikedYou = () => {
  const router = useRouter();
  const premium = usePremium();
  const [likes, setLikes] = useState<{ count: number; people: LikedYouEntry[] }>({ count: 0, people: [] });
  useEffect(() => {
    if (premium.loading) return;
    let live = true;
    void getLikedYou(premium.isPremium).then((r) => { if (live) setLikes(r); });
    return () => { live = false; };
  }, [premium.isPremium, premium.loading]);

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

  if (premium.isPremium) {
    return (
      <ScrollView testID="scr-14-liked-you" style={{ paddingHorizontal: 8 }}>
        <Header headerTitle={"Liked You"} button={button} />
        <Text testID="likes-premium-badge" style={{ fontWeight: "600", marginBottom: 12 }}>Premium</Text>
        {likes.people.length === 0 ? (
          <Text style={{ fontWeight: "300" }}>No new likes yet.</Text>
        ) : (
          likes.people.map((p) => (
            <View key={p.profile_id} testID="likes-row" style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: "#eee" }}>
              <Text style={{ fontSize: 18, color: "#1a1a1a" }}>{p.display_name}</Text>
            </View>
          ))
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView testID="scr-14-liked-you" style={{ paddingHorizontal: 8 }}>
      <Header headerTitle={"Liked You"} button={button} />
      <View style={{ alignSelf: "center", alignItems: "center", marginTop: 120, gap: 16, paddingHorizontal: 10 }}>
        <Text testID="likes-locked-count" style={{ fontSize: 24, fontWeight: "bold", color: "#1a1a1a", textAlign: "center" }}>
          {likes.count > 0 ? `${likes.count} ${likes.count === 1 ? "person likes" : "people like"} you` : "See who likes you"}
        </Text>
        <Text style={{ fontSize: 16, color: "#1a1a1a", textAlign: "center", fontWeight: "300" }}>
          Premium shows you who they are.
        </Text>
        <Pressable
          testID="likes-upgrade-btn"
          accessibilityRole="button"
          accessibilityLabel="Upgrade to Humbble Premium to see who liked you"
          onPress={() => router.push("/(paywall)/upgrade" as any)}
          style={{ width: 220, minHeight: TouchTargets.comfortable, backgroundColor: "#1a1a1a", padding: 12, borderRadius: 30, justifyContent: "center", alignItems: "center" }}
        >
          <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>Upgrade</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};

export default LikedYou;
