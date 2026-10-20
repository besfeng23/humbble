import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";

import { OnboardingLayout } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card, TextField } from "@/components/ui";
import { Spacing } from "@/constants/Spacing";

export default function OnboardingBasicsScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("Suzzane");
  const [cityRegion, setCityRegion] = useState("Metro Manila, PH");
  const [occupation, setOccupation] = useState("Product Designer");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState(
    "Display name must be between 2 and 40 characters."
  );

  const handleSaveAndContinue = () => {
    const trimmed = displayName.trim();
    if (trimmed.length < 2 || trimmed.length > 40) {
      setErrorMessage("Display name must be between 2 and 40 characters.");
      setStatus("failure");
      return;
    }
    if (!cityRegion.trim()) {
      setErrorMessage("City / Region is required.");
      setStatus("failure");
      return;
    }
    setStatus("success");
    router.push("/(onboarding)/intentions" as any);
  };

  return (
    <OnboardingLayout
      testID="scr-07-onboarding-basics"
      step={1}
      totalSteps={4}
      title="Onboarding: Basics"
      subtitle="SCR-07 • Profile Basics Draft (Phase 3 P3-02 Preview)"
      fallbackHref="/(tabs)/profile"
    >
      <FormStateView
        testID="scr-07-form-state"
        status={status}
        pendingTitle="Saving profile basics..."
        successTitle="Basics draft saved"
        successMessage="Proceeding to Step 2: Relationship Intentions."
        failureTitle="Could not save basics"
        failureMessage={errorMessage}
        onRetry={() => setStatus("idle")}
      >
        <Card testID="scr-07-card" variant="elevated">
          <View style={styles.fields}>
            <TextField
              testID="scr-07-display-name"
              label="Display Name"
              helperText="2–40 characters shown on your editorial card."
              value={displayName}
              onChangeText={setDisplayName}
              required
            />
            <TextField
              testID="scr-07-city-region"
              label="City / Region"
              helperText="Philippines launch market corridor."
              value={cityRegion}
              onChangeText={setCityRegion}
              required
            />
            <TextField
              testID="scr-07-occupation"
              label="Occupation"
              value={occupation}
              onChangeText={setOccupation}
            />

            <View style={styles.actions}>
              <Button
                testID="scr-07-continue-btn"
                label="Save & Continue to Intentions"
                variant="primary"
                size="lg"
                onPress={handleSaveAndContinue}
              />
              <Button
                testID="scr-07-back-profile-btn"
                label="Return to Profile"
                variant="secondary"
                onPress={() => router.replace("/(tabs)/profile" as any)}
              />
            </View>
          </View>
        </Card>
      </FormStateView>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: Spacing.lg,
  },
  actions: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
});
