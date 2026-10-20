import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import Avatar from "@/components/Avatar";
import Header from "@/components/Header";
import { Card } from "@/components/ui";
import { HitSlop, Spacing, TouchTargets } from "@/constants/Spacing";

const SAMPLE_THREADS = [
  {
    id: "conv-1",
    name: "Suhani, 25",
    preview: "Would love to check out that Makati coffee roaster this weekend!",
    unread: true,
  },
  {
    id: "conv-2",
    name: "Rahi, 26",
    preview: "Mutual match created • Say hello for free!",
    unread: false,
  },
] as const;

const Chats = () => {
  const router = useRouter();
  const [sortOrder, setSortOrder] = useState<"recent" | "unread">("recent");

  const button = () => (
    <Pressable
      testID="chats-search-btn"
      hitSlop={HitSlop.default}
      onPress={() => router.push("/(tabs)/discover" as any)}
      accessibilityRole="button"
      accessibilityLabel="Browse matches and discovery"
      style={styles.iconButton}
    >
      <AntDesign name="search1" size={24} color="black" />
    </Pressable>
  );

  const orderedThreads =
    sortOrder === "unread"
      ? [...SAMPLE_THREADS].sort((a, b) => Number(b.unread) - Number(a.unread))
      : SAMPLE_THREADS;

  return (
    <ScrollView testID="scr-15-chats-inbox" style={{ paddingHorizontal: 8 }}>
      <View style={{ gap: 10, paddingBottom: 24 }}>
        <Header headerTitle={"Chats"} button={button} />
        <Pressable
          testID="chats-your-matches-btn"
          accessibilityRole="button"
          accessibilityLabel="Your matches"
          onPress={() => {
            router.push("/(tabs)/(chats)/chatScreen" as any);
          }}
          style={{ minHeight: TouchTargets.minimum, justifyContent: "center" }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700" }}>Your matches</Text>
        </Pressable>
        <Pressable
          testID="chats-spotlight-promo-btn"
          accessibilityRole="button"
          accessibilityLabel="Spotlight promo"
          onPress={() => router.push("/(paywall)/upgrade" as any)}
          style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
        >
          <Avatar
            size={80}
            image="https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "300",
              }}
            >
              Spotlight is the easiest way to up your odds of a match!
            </Text>
          </View>
        </Pressable>
        <View style={styles.headerSection}>
          <Text style={styles.logo}>
            Chats ({sortOrder === "recent" ? "Recent" : "Unread first"})
          </Text>
          <Pressable
            testID="chats-sort-btn"
            hitSlop={HitSlop.default}
            accessibilityRole="button"
            accessibilityLabel="Toggle conversation sort order"
            onPress={() =>
              setSortOrder((prev) => (prev === "recent" ? "unread" : "recent"))
            }
            style={styles.iconButton}
          >
            <MaterialCommunityIcons
              name="sort-variant"
              size={24}
              color="black"
            />
          </Pressable>
        </View>

        <View style={styles.threadsList}>
          {orderedThreads.map((thread) => (
            <Card
              key={thread.id}
              testID={`chats-thread-${thread.id}`}
              variant="outlined"
              onPress={() =>
                router.push(`/(tabs)/(chats)/${thread.id}` as any)
              }
              accessibilityLabel={`${thread.name}, ${thread.preview}`}
            >
              <View style={styles.threadRow}>
                <View style={styles.threadText}>
                  <Text style={styles.threadName}>{thread.name}</Text>
                  <Text style={styles.threadPreview}>{thread.preview}</Text>
                </View>
                {thread.unread ? <View style={styles.unreadDot} /> : null}
              </View>
            </Card>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

export default Chats;

const styles = StyleSheet.create({
  iconButton: {
    minWidth: TouchTargets.minimum,
    minHeight: TouchTargets.minimum,
    justifyContent: "center",
    alignItems: "center",
  },
  headerSection: {
    justifyContent: "space-between",
    alignItems: "center",
    flexDirection: "row",
    paddingVertical: 8,
    marginBottom: 6,
  },
  logo: {
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 1,
    color: "#1a1a1a",
  },
  threadsList: {
    gap: Spacing.md,
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  threadText: {
    flex: 1,
    gap: 4,
  },
  threadName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#11181C",
  },
  threadPreview: {
    fontSize: 14,
    color: "#525860",
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFA600",
  },
});
