import { EvilIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";

import { matchwithgoalData, RECOMMENDATION_USER } from "@/DB/userDB";
import Header from "@/components/Header";
import UserCard from "@/components/UserCard";
import { HitSlop, TouchTargets } from "@/constants/Spacing";

export default function Discover() {
  const router = useRouter();

  const button = () => (
    <Pressable
      testID="discover-filters-btn"
      hitSlop={HitSlop.default}
      onPress={() => router.push("/(tabs)/discover/filters" as any)}
      accessibilityRole="button"
      accessibilityLabel="Discovery filters and preferences"
      style={{
        minWidth: TouchTargets.minimum,
        minHeight: TouchTargets.minimum,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <EvilIcons name="question" size={24} color="black" />
    </Pressable>
  );

  const GoalSection = (backgroundColor: string) => {
    return (
      <View style={{ gap: 5, backgroundColor, paddingVertical: 15 }}>
        <Text style={{ fontSize: 18, fontWeight: "bold" }}>
          Same dating goal
        </Text>
        <View style={{ width: "100%", padding: 2 }}>
          <FlatList
            horizontal={true}
            data={matchwithgoalData}
            renderItem={({ item }) => (
              <UserCard
                showLikeIcon={true}
                data={item}
                size="small"
                onPress={() =>
                  router.push(`/(tabs)/discover/${item.id}` as any)
                }
              />
            )}
            keyExtractor={(item) => item.id.toString()}
            ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      </View>
    );
  };

  const CommonCommuity = (backgroundColor: string) => {
    return (
      <View
        style={{
          gap: 5,
          backgroundColor: backgroundColor,
          paddingVertical: 15,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "bold" }}>
          Communities in common
        </Text>
        <View style={{ width: "100%", padding: 2 }}>
          <FlatList
            horizontal={true}
            data={matchwithgoalData}
            renderItem={({ item }) => (
              <UserCard
                showLikeIcon={true}
                data={item}
                size="small"
                onPress={() =>
                  router.push(`/(tabs)/discover/${item.id}` as any)
                }
              />
            )}
            keyExtractor={(item) => item.id.toString()}
            ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      </View>
    );
  };

  const SimilarInterest = (backgroundColor: string) => {
    return (
      <View
        style={{
          gap: 5,
          backgroundColor: backgroundColor,
          paddingVertical: 15,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "bold" }}>
          Similar interests
        </Text>
        <View style={{ width: "100%", padding: 2 }}>
          <FlatList
            horizontal={true}
            data={matchwithgoalData}
            renderItem={({ item }) => (
              <UserCard
                showLikeIcon={true}
                data={item}
                size="small"
                onPress={() =>
                  router.push(`/(tabs)/discover/${item.id}` as any)
                }
              />
            )}
            keyExtractor={(item) => item.id.toString()}
            ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      </View>
    );
  };

  const Recommendataions = (backgroundColor: string) => {
    return (
      <View
        style={{
          gap: 5,
          backgroundColor: backgroundColor,
          paddingVertical: 15,
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: "bold" }}>
          Recommendations for you
        </Text>
        <View style={{ width: "100%", padding: 2 }}>
          <FlatList
            horizontal={true}
            data={RECOMMENDATION_USER}
            renderItem={({ item }) => (
              <UserCard
                showLikeIcon={true}
                size="large"
                data={item}
                onPress={() =>
                  router.push(`/(tabs)/discover/${item.id}` as any)
                }
              />
            )}
            keyExtractor={(item) => item.id.toString()}
            ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      </View>
    );
  };

  return (
    <ScrollView testID="scr-11-discover" style={{ paddingHorizontal: 8 }}>
      <Header headerTitle={"Discover"} button={button} />
      <View
        style={{
          backgroundColor: "#ffa600",
          width: 200,
          borderRadius: 20,
          paddingHorizontal: 4,
          paddingVertical: 6,
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Text style={{ fontWeight: "400" }}>See new people in 15 hours</Text>
      </View>
      <Text style={{ fontWeight: "300" }}>
        Connect over common group with people who match your vibe, refreshed
        every day.
      </Text>
      {Recommendataions("#ffffff")}
      {GoalSection("#ffffff")}
      {CommonCommuity("#e0dede")}
      {SimilarInterest("#ffffff")}
    </ScrollView>
  );
}
