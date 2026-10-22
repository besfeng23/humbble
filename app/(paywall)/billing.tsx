import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SettingsLayout } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { usePremium } from "@/hooks/usePremium";
import { cancelSubscription } from "@/lib/billing";

export default function SubscriptionBillingScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const premium = usePremium();
  const subscriptionStatus: "free" | "active" | "cancelled" = !premium.isPremium
    ? "free"
    : premium.cancelAtPeriodEnd ? "cancelled" : "active";
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [status, setStatus] = useState<FormStatus>("idle");

  const handleConfirmCancel = async () => {
    setConfirmingCancel(false);
    setStatus("pending");
    const result = await cancelSubscription();
    await premium.refresh();
    setStatus(result.ok ? "success" : "failure");
  };

  return (
    <SettingsLayout
      testID="scr-21-billing"
      title="Subscription Billing & Cancellation"
      subtitle="SCR-21 • 2-Click Self-Service Cancellation"
      fallbackHref="/(tabs)/profile"
      activeNavId="settings-billing"
    >
      <FormStateView
        testID="scr-21-form-state"
        status={status}
        pendingTitle="Updating subscription..."
        successTitle="Subscription cancellation scheduled"
        successMessage="Auto-renewal is turned off (cancel_at_period_end = true). Your entitlement remains active through the end of the current billing period."
        failureTitle="Could not update subscription"
        failureMessage="Please retry or check your connection."
        onRetry={() => setStatus("idle")}
      >
        <Card testID="scr-21-status-card" variant="elevated">
          <View style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: palette.text }]}
            >
              Current Plan:{" "}
              {subscriptionStatus === "free"
                ? "Humbble Free"
                : "Humbble Premium (monthly)"}
            </Text>
            <Text
              testID="scr-21-subscription-state"
              style={[styles.stateText, { color: palette.textSecondary }]}
            >
              Status: {subscriptionStatus}
            </Text>

            {subscriptionStatus === "active" && !confirmingCancel ? (
              <Button
                testID="scr-21-cancel-step-1-btn"
                label="Cancel Monthly Subscription (Click 1 of 2)"
                variant="danger"
                size="md"
                onPress={() => setConfirmingCancel(true)}
              />
            ) : null}

            {confirmingCancel ? (
              <View style={styles.confirmRow}>
                <Button
                  testID="scr-21-cancel-step-2-btn"
                  label="Confirm Cancellation Now (Click 2 of 2)"
                  variant="danger"
                  size="md"
                  onPress={handleConfirmCancel}
                />
                <Button
                  testID="scr-21-keep-plan-btn"
                  label="Keep My Plan"
                  variant="secondary"
                  size="md"
                  onPress={() => setConfirmingCancel(false)}
                />
              </View>
            ) : null}

            <Button
              testID="scr-21-view-upgrade-btn"
              label="View Plan Details (SCR-20)"
              variant="secondary"
              size="sm"
              onPress={() => router.push("/(paywall)/upgrade" as any)}
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
  heading: {
    ...Typography.h3,
  },
  stateText: {
    ...Typography.body,
  },
  confirmRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
});
