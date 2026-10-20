import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { OnboardingLayout } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card, TextField } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function OnboardingPhotosPromptsScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [uploadedCount, setUploadedCount] = useState(2);
  const [promptOne, setPromptOne] = useState(
    "A Sunday well spent starts with kapeng barako and a local bookshop."
  );
  const [promptTwo, setPromptTwo] = useState(
    "I value kindness, direct communication, and shared curiosity."
  );
  const [promptThree, setPromptThree] = useState(
    "Looking for a genuine long-term partnership built on mutual respect."
  );
  const [status, setStatus] = useState<FormStatus>("idle");

  const handleContinue = () => {
    if (
      uploadedCount < 2 ||
      !promptOne.trim() ||
      !promptTwo.trim() ||
      !promptThree.trim()
    ) {
      setStatus("failure");
      return;
    }
    setStatus("success");
    router.push("/(onboarding)/verify" as any);
  };

  return (
    <OnboardingLayout
      testID="scr-09-onboarding-photos"
      step={3}
      totalSteps={4}
      title="Onboarding: Photos & Prompts"
      subtitle="SCR-09 • Minimum 2 Photos & 3 Narrative Prompts"
      fallbackHref="/(onboarding)/intentions"
    >
      <FormStateView
        testID="scr-09-form-state"
        status={status}
        pendingTitle="Validating photos & prompts..."
        successTitle="Photos & prompts saved"
        successMessage="Proceeding to Step 4: Selfie Liveness Verification."
        failureTitle="Quality gate requirement not met"
        failureMessage="At least 2 photos and 3 completed narrative prompts are required before discovery."
        onRetry={() => setStatus("idle")}
      >
        <Card testID="scr-09-card" variant="elevated">
          <View style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: palette.text }]}
            >
              Profile Photos ({uploadedCount} of 6 slots ready)
            </Text>
            <View style={styles.photoControls}>
              <Button
                testID="scr-09-add-photo-btn"
                label="Add Photo Slot"
                variant="secondary"
                size="sm"
                onPress={() =>
                  setUploadedCount((count) => Math.min(6, count + 1))
                }
              />
              <Button
                testID="scr-09-remove-photo-btn"
                label="Remove Photo Slot"
                variant="ghost"
                size="sm"
                onPress={() =>
                  setUploadedCount((count) => Math.max(0, count - 1))
                }
              />
            </View>

            <TextField
              testID="scr-09-prompt-1"
              label="Prompt 1: A perfect weekend looks like"
              value={promptOne}
              onChangeText={setPromptOne}
              required
            />
            <TextField
              testID="scr-09-prompt-2"
              label="Prompt 2: What I value most in a partner"
              value={promptTwo}
              onChangeText={setPromptTwo}
              required
            />
            <TextField
              testID="scr-09-prompt-3"
              label="Prompt 3: My relationship goal"
              value={promptThree}
              onChangeText={setPromptThree}
              required
            />

            <View style={styles.actions}>
              <Button
                testID="scr-09-continue-btn"
                label="Save & Continue to Verification"
                variant="primary"
                size="lg"
                onPress={handleContinue}
              />
              <Button
                testID="scr-09-back-btn"
                label="Back to Intentions"
                variant="secondary"
                onPress={() =>
                  router.replace("/(onboarding)/intentions" as any)
                }
              />
            </View>
          </View>
        </Card>
      </FormStateView>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.lg,
  },
  heading: {
    ...Typography.h3,
  },
  photoControls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  actions: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
});
