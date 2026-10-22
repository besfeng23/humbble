import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { SettingsLayout } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function PrivacyAndSafetySettingsScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [incognitoEnabled, setIncognitoEnabled] = useState(false);
  const [status, setStatus] = useState<FormStatus>("idle");

  const handleSaveSettings = () => {
    setStatus("success");
  };

  return (
    <SettingsLayout
      testID="scr-18-settings"
      title="Privacy, Notification & Safety Settings"
      subtitle="Privacy, consent & blocked people"
      fallbackHref="/(tabs)/profile"
      activeNavId="settings-main"
      fadeEdge
    >
      <FormStateView
        testID="scr-18-form-state"
        status={status}
        pendingTitle="Saving privacy preferences..."
        successTitle="Preferences saved"
        successMessage={
          analyticsConsent
            ? "Pseudonymous analytics enabled."
            : "PostHog analytics capture disabled."
        }
        failureTitle="Could not update settings"
        failureMessage="Network error while saving settings."
        onRetry={() => setStatus("idle")}
      >
        <Card testID="scr-18-toggles-card" variant="elevated">
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={[styles.label, { color: palette.text }]}>Push notifications</Text>
                <Text style={[styles.sublabel, { color: palette.textSecondary }]}>Choose alerts for mutual matches and new messages.</Text>
              </View>
              <Button testID="scr-18-notification-settings-btn" label="Manage" variant="secondary" size="sm" onPress={() => router.push("/(tabs)/profile/notifications" as any)} />
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={[styles.label, { color: palette.text }]}>
                  Pseudonymous Analytics Consent (PostHog)
                </Text>
                <Text
                  style={[styles.sublabel, { color: palette.textSecondary }]}
                >
                  Optional PII-minimized product analytics. Opting out revokes capture immediately.
                </Text>
              </View>
              <Switch
                testID="scr-18-analytics-switch"
                accessibilityRole="switch"
                accessibilityLabel="Pseudonymous Analytics Consent"
                value={analyticsConsent}
                onValueChange={setAnalyticsConsent}
              />
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={[styles.label, { color: palette.text }]}>
                  Incognito Discovery Mode (Humbble Reserve)
                </Text>
                <Text
                  style={[styles.sublabel, { color: palette.textSecondary }]}
                >
                  Only appear to people you have already liked.
                </Text>
              </View>
              <Switch
                testID="scr-18-incognito-switch"
                accessibilityRole="switch"
                accessibilityLabel="Incognito Discovery Mode"
                value={incognitoEnabled}
                onValueChange={(nextValue) => {
                  setIncognitoEnabled(nextValue);
                }}
              />
            </View>

            <Button
              testID="scr-18-save-btn"
              label="Save Settings"
              variant="primary"
              size="md"
              onPress={handleSaveSettings}
            />
          </View>
        </Card>

        <Card testID="scr-18-blocked-users-card" variant="outlined">
          <View style={styles.section}>
            <Text style={[styles.label, { color: palette.text }]}>Blocked users</Text>
            <Text style={[styles.sublabel, { color: palette.textSecondary }]}>Review blocked accounts and unblock someone if you choose. Old matches are never restored.</Text>
            <Button testID="scr-18-blocked-users-btn" label="Manage blocked users" variant="secondary" size="md" onPress={() => router.push("/(tabs)/profile/blocked-users" as any)} />
          </View>
        </Card>

        <Card testID="scr-18-links-card" variant="outlined">
          <View style={styles.linksRow}>
            <Button
              testID="scr-18-to-privacy-delete"
              label="Data Export & Account Deletion"
              variant="danger"
              size="sm"
              onPress={() =>
                router.push("/(tabs)/profile/privacy-delete" as any)
              }
            />
            <Button
              testID="scr-18-to-legal"
              label="Read Privacy Notice"
              variant="secondary"
              size="sm"
              onPress={() =>
                router.push("/(public)/legal/privacy-notice" as any)
              }
            />
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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  switchInfo: {
    flex: 1,
    gap: Spacing.xxs,
  },
  label: {
    ...Typography.bodySemiBold,
  },
  sublabel: {
    ...Typography.bodySmall,
  },
  linksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
});
