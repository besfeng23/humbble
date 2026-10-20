import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SettingsLayout, navigateBackOrFallback } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card, TextField } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Radii } from "@/constants/Radii";
import { Spacing, TouchTargets } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

const REPORT_CATEGORIES = [
  {
    id: "romance_scam_or_money_request",
    label: "Romance scam or money request",
  },
  {
    id: "fake_profile_or_impersonation",
    label: "Fake profile or impersonation",
  },
  {
    id: "harassment_or_abuse",
    label: "Harassment or abuse",
  },
  {
    id: "underage_concern",
    label: "Underage concern (Priority Escalation)",
  },
  {
    id: "non_consensual_or_explicit_media",
    label: "Non-consensual or explicit media",
  },
  {
    id: "spam_or_off_platform_solicitation",
    label: "Spam or off-platform solicitation",
  },
] as const;

export default function BlockAndReportModalScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [selectedCategory, setSelectedCategory] = useState<string>(
    REPORT_CATEGORIES[0].id
  );
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");

  const handleSubmitReportAndBlock = () => {
    if (!selectedCategory) {
      setStatus("failure");
      return;
    }
    setStatus("success");
  };

  return (
    <SettingsLayout
      testID="scr-22-report-modal"
      title="Block & Report Safety Shield"
      subtitle="SCR-22 • Free & Immediate Bidirectional Protection"
      fallbackHref="/(tabs)/people"
      activeNavId="settings-report"
    >
      <FormStateView
        testID="scr-22-form-state"
        status={status}
        pendingTitle="Submitting safety report & blocking account..."
        successTitle="User blocked & report submitted"
        successMessage="Connection is immediately severed in both directions. Our Trust & Safety team will triage this report."
        successActionLabel="Return to Safety"
        onSuccessAction={() =>
          navigateBackOrFallback(router, "/(tabs)/people")
        }
        failureTitle="Please select a report category"
        failureMessage="Select a category below so Trust & Safety can prioritize your report."
        onRetry={() => setStatus("idle")}
      >
        <Card testID="scr-22-card" variant="elevated">
          <View style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: palette.text }]}
            >
              Select Report Category
            </Text>

            <View
              testID="scr-22-category-group"
              accessibilityRole="radiogroup"
              style={styles.radioList}
            >
              {REPORT_CATEGORIES.map((category) => {
                const isSelected = selectedCategory === category.id;
                return (
                  <Pressable
                    key={category.id}
                    testID={`scr-22-category-${category.id}`}
                    onPress={() => setSelectedCategory(category.id)}
                    accessibilityRole="radio"
                    accessibilityLabel={category.label}
                    accessibilityState={{ checked: isSelected }}
                    style={[
                      styles.radioOption,
                      {
                        backgroundColor: isSelected
                          ? palette.primary
                          : palette.surfaceMuted,
                        borderColor: isSelected
                          ? palette.primaryPressed
                          : palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: isSelected ? palette.onPrimary : palette.text,
                        fontWeight: isSelected ? "700" : "500",
                      }}
                    >
                      {isSelected ? "● " : "○ "}
                      {category.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextField
              testID="scr-22-details-input"
              label="Optional Context (up to 1,000 characters)"
              placeholder="Share any relevant context for Trust & Safety..."
              value={details}
              onChangeText={setDetails}
            />

            <View style={styles.actions}>
              <Button
                testID="scr-22-submit-btn"
                label="Block User & Submit Report"
                variant="danger"
                size="lg"
                onPress={handleSubmitReportAndBlock}
              />
              <Button
                testID="scr-22-cancel-btn"
                label="Cancel"
                variant="secondary"
                size="md"
                onPress={() =>
                  navigateBackOrFallback(router, "/(tabs)/people")
                }
              />
            </View>
          </View>
        </Card>
      </FormStateView>
    </SettingsLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.lg,
  },
  heading: {
    ...Typography.h3,
  },
  radioList: {
    gap: Spacing.sm,
  },
  radioOption: {
    minHeight: TouchTargets.comfortable,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.lg,
    borderWidth: 1,
    justifyContent: "center",
  },
  actions: {
    gap: Spacing.md,
  },
});
