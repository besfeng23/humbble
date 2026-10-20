import { Octicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Dimensions, Pressable, StyleSheet, View } from "react-native";

import Header from "@/components/Header";
import PeopleCard from "@/components/PeopleCard";
import { HitSlop, TouchTargets } from "@/constants/Spacing";

const PeopleScreen = () => {
  const router = useRouter();

  const button = () => (
    <Pressable
      testID="people-filter-btn"
      hitSlop={HitSlop.default}
      onPress={() => router.push("/(tabs)/discover/filters" as any)}
      accessibilityRole="button"
      accessibilityLabel="Open discovery filters"
      style={styles.filterButton}
    >
      <Octicons name="filter" size={24} color="black" />
    </Pressable>
  );

  return (
    <View testID="scr-11-people" style={styles.container}>
      <Header headerTitle={"Humble"} button={button} />
      <PeopleCard />
    </View>
  );
};

export default PeopleScreen;

const styles = StyleSheet.create({
  filterButton: {
    minWidth: TouchTargets.minimum,
    minHeight: TouchTargets.minimum,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
    minHeight: Dimensions.get("screen").height * 0.85,
    paddingHorizontal: 8,
  },
});
