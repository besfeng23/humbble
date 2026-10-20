import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { AuthGuard, ResponsiveNavHeader } from "@/components/layout";
import { Button, Card } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

const CharScreen = () => {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? "light"];

  return (
    <AuthGuard
      mode="protected"
      redirectTo="/auth/signin"
      testID="charscreenf-guard"
    >
      <View
        testID="charscreenf-root"
        style={[styles.root, { backgroundColor: palette.background }]}
      >
        <ResponsiveNavHeader
          testID="charscreenf-header"
          title="Conversation Preview"
          subtitle="Protected Route"
          showBack
          fallbackHref="/(tabs)/(chats)"
        />
        <View style={styles.content}>
          <Card variant="elevated">
            <View style={styles.cardBody}>
              <Text style={[styles.title, { color: palette.text }]}>
                charscreen 234 root
              </Text>
              <Button
                testID="charscreenf-open-chats-btn"
                label="Return to Chats Inbox"
                variant="primary"
                onPress={() => router.replace("/(tabs)/(chats)" as any)}
              />
            </View>
          </Card>
        </View>
      </View>
    </AuthGuard>
  );
};

export default CharScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
  },
  cardBody: {
    gap: Spacing.md,
  },
  title: {
    ...Typography.bodySemiBold,
  },
});
