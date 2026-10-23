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
import { PAYMENTS_ARE_TEST_ONLY, TEST_PAYMENTS_NOTICE, cancelSubscription } from "@/lib/billing";
import { GENERIC_ERROR_MESSAGE } from "@/lib/friendlyErrors";

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

  const endDate = premium.validUntil ? new Date(premium.validUntil) : null;
  const endLabel = endDate && !Number.isNaN(endDate.getTime()) ? endDate.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null;
  const stateText = subscriptionStatus === "free"
    ? "You’re on the free plan."
    : subscriptionStatus === "cancelled"
      ? `Active until ${endLabel ?? "the end of this billing period"}. It won’t renew.`
      : "Renews monthly until cancelled.";

  return (
    <SettingsLayout
      testID="scr-21-billing"
      title="Subscription"
      fallbackHref="/(tabs)/profile"
      activeNavId="settings-billing"
    >
      <FormStateView
        testID="scr-21-form-state"
        status={status}
        pendingTitle="Updating subscription…"
        successTitle="Cancellation scheduled"
        successMessage="Your subscription won’t renew. Premium stays on until the end of this billing period."
        failureTitle="Couldn’t update subscription"
        failureMessage={GENERIC_ERROR_MESSAGE}
        onRetry={() => setStatus("idle")}
      >
        <Card testID="scr-21-status-card" variant="elevated">
          <View style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: palette.text }]}
            >
              {subscriptionStatus === "free" ? "Humbble Free" : "Humbble Premium"}
            </Text>
            <Text
              testID="scr-21-subscription-state"
              style={[styles.stateText, { color: palette.textSecondary }]}
            >
              {stateText}
            </Text>

            {subscriptionStatus === "active" && !confirmingCancel ? (
              <Button
                testID="scr-21-cancel-step-1-btn"
                label="Cancel subscription"
                variant="danger"
                size="md"
                onPress={() => setConfirmingCancel(true)}
              />
            ) : null}

            {confirmingCancel ? (
              <View style={styles.confirmRow}>
                <Button
                  testID="scr-21-cancel-step-2-btn"
                  label="Confirm cancellation"
                  variant="danger"
                  size="md"
                  onPress={handleConfirmCancel}
                />
                <Button
                  testID="scr-21-keep-plan-btn"
                  label="Keep my plan"
                  variant="secondary"
                  size="md"
                  onPress={() => setConfirmingCancel(false)}
                />
              </View>
            ) : null}

            <Button
              testID="scr-21-view-upgrade-btn"
              label={subscriptionStatus === "free" ? "See Premium" : "Plan details"}
              variant="secondary"
              size="sm"
              onPress={() => router.push("/(paywall)/upgrade" as any)}
            />
            {PAYMENTS_ARE_TEST_ONLY && subscriptionStatus !== "free" ? (
              <Text testID="scr-21-test-payments-note" style={[styles.note, { color: palette.textSecondary }]}>
                {TEST_PAYMENTS_NOTICE}
              </Text>
            ) : null}
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
  note: {
    ...Typography.bodySmall,
  },
  confirmRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
});
