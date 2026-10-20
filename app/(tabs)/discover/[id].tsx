import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { RECOMMENDATION_USER, SuggestedUsers } from "@/DB/userDB";
import { AuthGuard, ResponsiveNavHeader } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card, ProfileMedia } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function ProfileInspectorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [status, setStatus] = useState<FormStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const candidateId = Number(params.id ?? 1);
  const candidate =
    RECOMMENDATION_USER.find((item) => item.id === candidateId) ??
    SuggestedUsers.find((item) => item.id === candidateId) ??
    RECOMMENDATION_USER[0];

  const handleAction = (direction: "like" | "pass") => {
    setStatusMessage(
      direction === "like"
        ? `Liked ${candidate.name}. You will be notified if it is a mutual match.`
        : `Passed on ${candidate.name}.`
    );
    setStatus("success");
  };

  return (
    <AuthGuard mode="protected" redirectTo="/auth/signin" testID="scr-12-guard">
      <View
        testID="scr-12-profile-inspector"
        style={[styles.root, { backgroundColor: palette.background }]}
      >
        <ResponsiveNavHeader
          testID="scr-12-header"
          title="Editorial Profile Inspector"
          subtitle={`SCR-12 • Candidate #${candidate.id}`}
          showBack
          fallbackHref="/(tabs)/discover"
          rightSlot={
            <Button
              testID="scr-12-shield-btn"
              label="Shield / Report"
              variant="danger"
              size="sm"
              shape="pill"
              onPress={() => router.push("/(safety)/report-modal" as any)}
            />
          }
        />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <FormStateView
            testID="scr-12-form-state"
            status={status}
            successTitle="Decision recorded"
            successMessage={statusMessage}
            successActionLabel="Back to Discover"
            onSuccessAction={() => router.replace("/(tabs)/discover" as any)}
          >
            <ProfileMedia
              testID="scr-12-media"
              name={candidate.name}
              age={candidate.age}
              imageUri={candidate.image}
              subtitle="Metro Manila • Long-term dating"
              verified
              size="large"
            />

            <Card testID="scr-12-prompts-card" variant="elevated">
              <View style={styles.promptsWrap}>
                <Text
                  accessibilityRole="header"
                  style={[styles.promptLabel, { color: palette.textSecondary }]}
                >
                  Relationship Intention
                </Text>
                <Text style={[styles.promptBody, { color: palette.text }]}>
                  Long-term dating • Shared values & intentional conversations
                </Text>

                <Text
                  accessibilityRole="header"
                  style={[styles.promptLabel, { color: palette.textSecondary }]}
                >
                  Prompt: A Sunday well spent
                </Text>
                <Text style={[styles.promptBody, { color: palette.text }]}>
                  Exploring local coffee roasters and live acoustic sets in Makati.
                </Text>
              </View>
            </Card>

            <View style={styles.actionsRow}>
              <Button
                testID="scr-12-pass-btn"
                label="Pass"
                variant="secondary"
                size="lg"
                shape="pill"
                style={styles.actionButton}
                onPress={() => handleAction("pass")}
              />
              <Button
                testID="scr-12-like-btn"
                label="Send Like"
                variant="primary"
                size="lg"
                shape="pill"
                style={styles.actionButton}
                onPress={() => handleAction("like")}
              />
            </View>
          </FormStateView>
        </ScrollView>
      </View>
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  promptsWrap: {
    gap: Spacing.sm,
  },
  promptLabel: {
    ...Typography.label,
  },
  promptBody: {
    ...Typography.body,
  },
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
  },
});
