import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { AuthGuard, ResponsiveNavHeader } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card, TextField } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function DiscoveryFiltersScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [minAge, setMinAge] = useState("21");
  const [maxAge, setMaxAge] = useState("45");
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSaveFilters = () => {
    const min = Number(minAge);
    const max = Number(maxAge);
    if (Number.isNaN(min) || Number.isNaN(max) || min < 18 || max < min) {
      setErrorMessage(
        "Minimum age must be at least 18 and less than or equal to maximum age."
      );
      setStatus("failure");
      return;
    }
    setStatus("success");
  };

  return (
    <AuthGuard mode="protected" redirectTo="/auth/signin" testID="scr-13-guard">
      <View
        testID="scr-13-filters"
        style={[styles.root, { backgroundColor: palette.background }]}
      >
        <ResponsiveNavHeader
          testID="scr-13-header"
          title="Discovery Filters"
          subtitle="SCR-13 • Age Range & Verification Preferences"
          showBack
          fallbackHref="/(tabs)/people"
        />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <FormStateView
            testID="scr-13-form-state"
            status={status}
            pendingTitle="Saving preferences..."
            successTitle="Discovery filters updated"
            successMessage={`Showing profiles aged ${minAge}–${maxAge}${
              verifiedOnly ? " (Verified only)" : ""
            }.`}
            successActionLabel="Return to Swipe Deck"
            onSuccessAction={() => router.replace("/(tabs)/people" as any)}
            failureTitle="Invalid age range"
            failureMessage={errorMessage}
            onRetry={() => setStatus("idle")}
          >
            <Card testID="scr-13-card" variant="elevated">
              <View style={styles.formBody}>
                <TextField
                  testID="scr-13-min-age"
                  label="Minimum Age (18+)"
                  value={minAge}
                  onChangeText={setMinAge}
                  keyboardType="numeric"
                  required
                />
                <TextField
                  testID="scr-13-max-age"
                  label="Maximum Age"
                  value={maxAge}
                  onChangeText={setMaxAge}
                  keyboardType="numeric"
                  required
                />

                <View style={styles.switchRow}>
                  <View style={styles.switchLabelWrap}>
                    <Text style={[styles.switchTitle, { color: palette.text }]}>
                      Verified Profiles Only
                    </Text>
                    <Text
                      style={[
                        styles.switchSubtitle,
                        { color: palette.textSecondary },
                      ]}
                    >
                      Only show candidates with verified liveness status.
                    </Text>
                  </View>
                  <Switch
                    testID="scr-13-verified-switch"
                    accessibilityRole="switch"
                    accessibilityLabel="Verified Profiles Only"
                    value={verifiedOnly}
                    onValueChange={setVerifiedOnly}
                  />
                </View>

                <Button
                  testID="scr-13-save-btn"
                  label="Save Preferences"
                  variant="primary"
                  size="lg"
                  onPress={handleSaveFilters}
                />
              </View>
            </Card>

            <Card testID="scr-13-upsell-card" variant="muted">
              <View style={styles.upsellBody}>
                <Text
                  accessibilityRole="header"
                  style={[styles.switchTitle, { color: palette.text }]}
                >
                  Advanced Reserve Filters
                </Text>
                <Text
                  style={[
                    styles.switchSubtitle,
                    { color: palette.textSecondary },
                  ]}
                >
                  Unlock advanced lifestyle filters and Incognito mode with Humbble Reserve.
                </Text>
                <Button
                  testID="scr-13-upgrade-btn"
                  label="Explore Humbble Reserve"
                  variant="charcoal"
                  size="sm"
                  shape="pill"
                  onPress={() => router.push("/(paywall)/upgrade" as any)}
                />
              </View>
            </Card>
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
  formBody: {
    gap: Spacing.lg,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  switchLabelWrap: {
    flex: 1,
    gap: Spacing.xxs,
  },
  switchTitle: {
    ...Typography.bodySemiBold,
  },
  switchSubtitle: {
    ...Typography.bodySmall,
  },
  upsellBody: {
    gap: Spacing.sm,
    alignItems: "flex-start",
  },
});
