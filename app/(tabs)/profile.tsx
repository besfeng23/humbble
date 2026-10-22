import { AntDesign, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import Avatar from "@/components/Avatar";
import Button from "@/components/Button";
import Header from "@/components/Header";
import { HitSlop, Spacing, TouchTargets } from "@/constants/Spacing";
import { useAuth } from "@/lib/AuthProvider";

const PLANS = [
  { plan: "Get exclusive photo insights", p1: true, p2: true },
  { plan: "Fast track your likes", p1: true, p2: true },
  { plan: "Standout every day", p1: true, p2: true },
  { plan: "Unlimited likes", p1: true, p2: false },
  { plan: "See who liked you", p1: true, p2: false },
  { plan: "Advanced filters", p1: true, p2: false },
  { plan: "Incognito mode", p1: true, p2: false },
  { plan: "Two compliments a weeks", p1: true, p2: true },
];

const Profile = () => {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/auth/signin");
  };

  const displayName =
    user?.user_metadata?.full_name || user?.email || "Prakash, 27";

  const headerbutton = () => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Pressable
        testID="profile-signout-btn"
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={handleSignOut}
        style={{
          backgroundColor: "#ebebeb",
          paddingHorizontal: 12,
          paddingVertical: 8,
          minHeight: TouchTargets.minimum,
          justifyContent: "center",
          borderRadius: 8,
        }}
      >
        <Text style={{ color: "#1c1c1c", fontWeight: "600", fontSize: 14 }}>
          Sign out
        </Text>
      </Pressable>
      <Pressable
        testID="profile-settings-btn"
        hitSlop={HitSlop.default}
        accessibilityRole="button"
        accessibilityLabel="Open privacy and notification settings"
        onPress={() => router.push("/(tabs)/profile/settings" as any)}
        style={styles.iconButton}
      >
        <AntDesign name="setting" size={24} color="black" />
      </Pressable>
    </View>
  );

  return (
    <ScrollView testID="scr-17-profile" style={{ paddingHorizontal: 8 }}>
      <View style={{ gap: 10, paddingBottom: 24 }}>
        <Header headerTitle={"Profile"} button={headerbutton} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Avatar
            size={80}
            image="https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
          />
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 22, fontWeight: "600" }}>
              {displayName}
            </Text>
            {user?.email && user?.user_metadata?.full_name ? (
              <Text style={{ fontSize: 14, color: "#525860", marginBottom: 4 }}>
                {user.email}
              </Text>
            ) : null}
            <Button
              style={{ backgroundColor: "#ebebeb" }}
              textStyle={{ color: "#1c1c1c" }}
              onPress={() => router.push("/(onboarding)/basics" as any)}
            >
              Complete profile
            </Button>
          </View>
        </View>

        {/* Quick Navigation Bar to Settings, Privacy, Billing & Safety */}
        <View style={styles.quickNavRow}>
          <Pressable
            testID="profile-link-settings"
            accessibilityRole="button"
            accessibilityLabel="Privacy and Safety Settings"
            onPress={() => router.push("/(tabs)/profile/settings" as any)}
            style={styles.quickNavPill}
          >
            <Text style={styles.quickNavText}>Settings</Text>
          </Pressable>
          <Pressable
            testID="profile-link-privacy-delete"
            accessibilityRole="button"
            accessibilityLabel="Data Export and Account Deletion"
            onPress={() => router.push("/(tabs)/profile/privacy-delete" as any)}
            style={styles.quickNavPill}
          >
            <Text style={styles.quickNavText}>Privacy & Data</Text>
          </Pressable>
          <Pressable
            testID="profile-link-billing"
            accessibilityRole="button"
            accessibilityLabel="Subscription Billing"
            onPress={() => router.push("/(paywall)/billing" as any)}
            style={styles.quickNavPill}
          >
            <Text style={styles.quickNavText}>Billing</Text>
          </Pressable>
          <Pressable
            testID="profile-link-moderation"
            accessibilityRole="button"
            accessibilityLabel="Moderation"
            onPress={() => router.push("/(admin)/moderation" as any)}
            style={styles.quickNavPill}
          >
            <Text style={styles.quickNavText}>Moderation</Text>
          </Pressable>
        </View>

        <View
          style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}
        >
          <Pressable
            testID="profile-spotlight-card-1"
            accessibilityRole="button"
            accessibilityLabel="Spotlight Stand out"
            onPress={() => router.push("/(paywall)/upgrade" as any)}
            style={styles.spotlightCard}
          >
            <View style={styles.circle}>
              <AntDesign name="star" size={24} color="black" />
            </View>
            <View style={{ flexDirection: "column" }}>
              <Text style={{ fontWeight: "800", color: "#1a1a1a" }}>
                Spotlight
              </Text>
              <Text>Stand out</Text>
            </View>
          </Pressable>
          <Pressable
            testID="profile-spotlight-card-2"
            accessibilityRole="button"
            accessibilityLabel="Reserve Upgrade"
            onPress={() => router.push("/(paywall)/upgrade" as any)}
            style={styles.spotlightCard}
          >
            <View style={styles.circle}>
              <AntDesign name="star" size={24} color="black" />
            </View>
            <View style={{ flexDirection: "column" }}>
              <Text style={{ fontWeight: "800", color: "#1a1a1a" }}>
                Reserve
              </Text>
              <Text>₱599/mo PH</Text>
            </View>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View
            style={{
              backgroundColor: "#ffa600",
              height: 160,
              width: 300,
              borderRadius: 20,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 20,
              gap: 10,
              marginRight: 5,
            }}
          >
            <Text style={{ fontWeight: "bold", textAlign: "center" }}>
              Humbble Reserve
            </Text>
            <Text style={{ fontWeight: "300", textAlign: "center" }}>
              Get the VIP treatment, and enjoy better ways to connect with
              incredible people
            </Text>
            <Button
              style={{ backgroundColor: "#1c1c1c" }}
              textStyle={{ color: "#ebebeb" }}
              onPress={() => router.push("/(paywall)/upgrade" as any)}
            >
              Upgrade Reserve
            </Button>
          </View>
          <View
            style={{
              backgroundColor: "#ffa600",
              height: 160,
              width: 300,
              borderRadius: 20,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 20,
              gap: 10,
            }}
          >
            <Text style={{ fontWeight: "bold", textAlign: "center" }}>
              Profile Onboarding
            </Text>
            <Text style={{ fontWeight: "300", textAlign: "center" }}>
              Complete your 4-step profile prompts, photos, and verification
            </Text>
            <Button
              style={{ backgroundColor: "#1c1c1c" }}
              textStyle={{ color: "#ebebeb" }}
              onPress={() => router.push("/(onboarding)/basics" as any)}
            >
              Complete profile
            </Button>
          </View>
        </ScrollView>

        <View style={styles.table}>
          <View style={styles.tableItem}>
            <Text style={[styles.row1, { fontWeight: "bold" }]}>
              What you get:
            </Text>
            <Text style={[styles.row2, { fontWeight: "bold" }]}>Reserve</Text>
            <Text style={[styles.row3, { fontWeight: "bold" }]}>Free</Text>
          </View>
          {PLANS.map((planitem) => {
            return (
              <View style={styles.tableItem} key={planitem.plan}>
                <Text
                  style={[
                    styles.row1,
                    { fontWeight: "400", color: "#11181C" },
                  ]}
                >
                  {planitem.plan}
                </Text>
                <Ionicons
                  style={styles.row2}
                  name="checkmark-outline"
                  size={24}
                  color={planitem.p1 ? "black" : "#bdb9b9"}
                />
                <Ionicons
                  style={styles.row3}
                  name="checkmark-outline"
                  size={24}
                  color={planitem.p2 ? "black" : "#bdb9b9"}
                />
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
};

export default Profile;

const styles = StyleSheet.create({
  iconButton: {
    minWidth: TouchTargets.minimum,
    minHeight: TouchTargets.minimum,
    justifyContent: "center",
    alignItems: "center",
  },
  quickNavRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginVertical: Spacing.xs,
  },
  quickNavPill: {
    minHeight: TouchTargets.minimum,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    backgroundColor: "#EBEBEB",
    justifyContent: "center",
    alignItems: "center",
  },
  quickNavText: {
    color: "#1C1C1C",
    fontSize: 13,
    fontWeight: "600",
  },
  spotlightCard: {
    flexDirection: "row",
    gap: 8,
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderColor: "#f0eded",
    alignItems: "center",
    minHeight: TouchTargets.comfortable,
  },
  tableItem: {
    flexDirection: "row",
    paddingHorizontal: 5,
    borderBottomWidth: 2,
    paddingVertical: 5,
    borderStyle: "solid",
    borderRadius: 1,
    borderColor: "#f0eded",
  },
  row1: { width: "40%" },
  row2: {
    width: "30%",
    justifyContent: "center",
    alignItems: "center",
  },
  row3: {
    width: "30%",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
  },
  table: {
    width: "100%",
    gap: 4,
  },
  circle: {
    borderRadius: 40,
    height: 40,
    width: 40,
    backgroundColor: "#ffa600",
    justifyContent: "center",
    alignItems: "center",
  },
});
