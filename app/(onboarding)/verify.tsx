import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { OnboardingLayout } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

export type VerificationStateValue =
  | "not_started"
  | "pending"
  | "verified"
  | "failed"
  | "requires_review";

export default function OnboardingVerifyScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [verificationState, setVerificationState] =
    useState<VerificationStateValue>("not_started");
  const [status, setStatus] = useState<FormStatus>("idle");

  const handleSubmitVerification = () => {
    setVerificationState("pending");
    setStatus("success");
  };

  return (
    <OnboardingLayout
      testID="scr-10-onboarding-verify"
      step={4}
      totalSteps={4}
      title="Onboarding: Liveness Verification"
      subtitle="SCR-10 • Provider-Neutral Verification (v1.2 A2)"
      fallbackHref="/(onboarding)/photos-prompts"
    >
      <FormStateView
        testID="scr-10-form-state"
        status={status}
        pendingTitle="Submitting verification session..."
        successTitle="Verification status: pending"
        successMessage="Only the provider session status is recorded. No raw selfie or biometric template is stored."
        successActionLabel="Continue to Discovery"
        onSuccessAction={() => router.replace("/(tabs)/people" as any)}
        failureTitle="Verification check could not start"
        failureMessage="Provider adapter is unavailable; your status remains safe in pending/retry state."
        onRetry={() => setStatus("idle")}
      >
        <Card testID="scr-10-card" variant="elevated">
          <View style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: palette.text }]}
            >
              Privacy-Preserving Liveness Check
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              Per Plan v1.2 Amendment A2, verification_requests tracks five states (not_started, pending, verified, failed, requires_review) and never retains raw selfie images or biometric templates.
            </Text>
            <Text
              testID="scr-10-current-state"
              style={[styles.stateLabel, { color: palette.text }]}
            >
              Current state: {verificationState}
            </Text>

            <View style={styles.actions}>
              <Button
                testID="scr-10-submit-btn"
                label="Start Verification Check"
                variant="primary"
                size="lg"
                onPress={handleSubmitVerification}
              />
              <Button
                testID="scr-10-finish-btn"
                label="Finish & Open Discovery"
                variant="charcoal"
                size="md"
                onPress={() => router.replace("/(tabs)/people" as any)}
              />
              <Button
                testID="scr-10-back-btn"
                label="Back to Photos & Prompts"
                variant="secondary"
                size="md"
                onPress={() =>
                  router.replace("/(onboarding)/photos-prompts" as any)
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
  body: {
    ...Typography.bodySmall,
  },
  stateLabel: {
    ...Typography.bodySemiBold,
  },
  actions: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
});
