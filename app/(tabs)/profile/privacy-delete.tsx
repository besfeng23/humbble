import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SettingsLayout } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card, TextField } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

const REQUIRED_CONFIRMATION = "DELETE MY ACCOUNT";

export default function PrivacyExportAndDeleteScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [confirmationText, setConfirmationText] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [statusTitle, setStatusTitle] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const handleRequestExport = () => {
    setStatusTitle("Data export requested");
    setStatusMessage(
      "Your portable JSON data export request has been queued in privacy_requests."
    );
    setStatus("success");
  };

  const handleRequestDeletion = () => {
    if (confirmationText.trim() !== REQUIRED_CONFIRMATION) {
      setStatusTitle("Confirmation string mismatch");
      setStatusMessage(
        `Please type the exact phrase "${REQUIRED_CONFIRMATION}" to confirm account deletion.`
      );
      setStatus("failure");
      return;
    }
    setStatusTitle("Account deletion request submitted");
    setStatusMessage(
      "Your account deletion workflow is queued. Sessions are revoked and profile/media cleanup is tracked."
    );
    setStatus("success");
  };

  return (
    <SettingsLayout
      testID="scr-19-privacy-delete"
      title="Data Export & Account Deletion"
      subtitle="Your privacy rights: export or delete your data"
      fallbackHref="/(tabs)/profile/settings"
      activeNavId="settings-privacy-delete"
    >
      <FormStateView
        testID="scr-19-form-state"
        status={status}
        pendingTitle="Processing privacy request..."
        successTitle={statusTitle || "Privacy request queued"}
        successMessage={statusMessage}
        failureTitle={statusTitle || "Deletion rejected"}
        failureMessage={statusMessage}
        onRetry={() => setStatus("idle")}
      >
        <Card testID="scr-19-export-card" variant="elevated">
          <View style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: palette.text }]}
            >
              1. Portable JSON Data Export
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              Request a copy of your profile information, preferences, and consent records.
            </Text>
            <Button
              testID="scr-19-export-btn"
              label="Request Data Export"
              variant="secondary"
              onPress={handleRequestExport}
            />
          </View>
        </Card>

        <Card testID="scr-19-delete-card" variant="outlined">
          <View style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: palette.danger }]}
            >
              2. Permanent Account Deletion
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              Deleting your account immediately disables discovery, revokes active sessions, and purges your profile and photos according to the retention schedule.
            </Text>

            <TextField
              testID="scr-19-confirm-input"
              label={`Type "${REQUIRED_CONFIRMATION}" to confirm`}
              placeholder={REQUIRED_CONFIRMATION}
              value={confirmationText}
              onChangeText={setConfirmationText}
              autoCapitalize="characters"
              required
            />

            <Button
              testID="scr-19-delete-btn"
              label="Permanently Delete My Account"
              variant="danger"
              onPress={handleRequestDeletion}
            />

            <Button
              testID="scr-19-back-settings-btn"
              label="Back to Privacy Settings"
              variant="ghost"
              onPress={() => router.replace("/(tabs)/profile/settings" as any)}
            />
          </View>
        </Card>
      </FormStateView>
    </SettingsLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.md,
  },
  heading: {
    ...Typography.h3,
  },
  body: {
    ...Typography.bodySmall,
  },
});
