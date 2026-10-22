import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ModerationLayout } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card, TextField } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function ModerationCaseDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ caseId?: string }>();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const caseId = params.caseId ?? "case-101";
  const [reason, setReason] = useState(
    "Confirmed policy violation; applying immediate suspension and audit log entry."
  );
  const [decision, setDecision] = useState<string>("open");
  const [status, setStatus] = useState<FormStatus>("idle");

  const handleAction = (nextDecision: "warned" | "suspended" | "dismissed") => {
    if (!reason.trim()) {
      setStatus("failure");
      return;
    }
    setDecision(nextDecision);
    setStatus("success");
  };

  return (
    <ModerationLayout
      testID="scr-24-moderation-case"
      title={`Moderation Case: ${caseId}`}
      subtitle="Case details and actions"
      fallbackHref="/(admin)/moderation"
      activeNavId="moderation-sample-case"
    >
      <FormStateView
        testID="scr-24-form-state"
        status={status}
        pendingTitle="Recording audited moderation action..."
        successTitle={`Enforcement decision recorded: ${decision}`}
        successMessage="Immutable audit_events entry appended alongside case transition."
        successActionLabel="Return to Queue"
        onSuccessAction={() => router.replace("/(admin)/moderation" as any)}
        failureTitle="Audit reason required"
        failureMessage="Every moderation action requires a documented reason for the immutable audit log."
        onRetry={() => setStatus("idle")}
      >
        <Card testID="scr-24-evidence-card" variant="elevated">
          <View style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: palette.text }]}
            >
              Case Summary & Scoped Evidence ({caseId})
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              Evidence access is scoped strictly to this case and recorded in audit_events. Current case state: {decision}.
            </Text>

            <TextField
              testID="scr-24-reason-input"
              label="Mandatory Audit Reason"
              value={reason}
              onChangeText={setReason}
              required
            />

            <View style={styles.actionsRow}>
              <Button
                testID="scr-24-suspend-btn"
                label="Suspend Account"
                variant="danger"
                onPress={() => handleAction("suspended")}
              />
              <Button
                testID="scr-24-warn-btn"
                label="Issue Warning"
                variant="primary"
                onPress={() => handleAction("warned")}
              />
              <Button
                testID="scr-24-dismiss-btn"
                label="Dismiss Case"
                variant="secondary"
                onPress={() => handleAction("dismissed")}
              />
            </View>
          </View>
        </Card>
      </FormStateView>
    </ModerationLayout>
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
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
});
