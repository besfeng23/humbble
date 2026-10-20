import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SettingsLayout } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Radii } from "@/constants/Radii";
import { Spacing, TouchTargets } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function ReserveUpgradePaywallScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [autoRenewalConsent, setAutoRenewalConsent] = useState(false);
  const [status, setStatus] = useState<FormStatus>("idle");

  const handleStartSandboxCheckout = () => {
    if (!autoRenewalConsent) {
      setStatus("failure");
      return;
    }
    setStatus("success");
  };

  return (
    <SettingsLayout
      testID="scr-20-upgrade"
      title="Humbble Reserve Upgrade"
      subtitle="SCR-20 • Monthly Subscription (PayPal Sandbox Only — v1.2 A5)"
      fallbackHref="/(tabs)/profile"
      activeNavId="settings-upgrade"
    >
      <FormStateView
        testID="scr-20-form-state"
        status={status}
        pendingTitle="Initiating PayPal Sandbox checkout..."
        successTitle="Approval pending (PayPal Sandbox)"
        successMessage="Browser return alone never grants entitlement. Entitlement activates only after server-verified PAYMENT.SALE.COMPLETED."
        successActionLabel="Inspect Billing Status (SCR-21)"
        onSuccessAction={() => router.push("/(paywall)/billing" as any)}
        failureTitle="Auto-renewal consent required"
        failureMessage="Please check the affirmative recurring billing disclosure box before starting checkout."
        onRetry={() => setStatus("idle")}
      >
        <Card testID="scr-20-plan-card" variant="elevated">
          <View style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: palette.text }]}
            >
              Humbble Reserve — Monthly Plan
            </Text>
            <Text style={[styles.price, { color: palette.text }]}>
              Philippines: ₱599.00 PHP / month (US: $29.99 USD / month)
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              Server-resolved monthly pricing only (no 3-month or 6-month plans per Plan v1.2 Amendment A5). Includes unlimited daily likes, full incoming likes grid, Incognito mode, and advanced filters. Mutual messaging and safety tools remain free for everyone.
            </Text>

            <Pressable
              testID="scr-20-consent-checkbox"
              onPress={() => setAutoRenewalConsent((prev) => !prev)}
              accessibilityRole="checkbox"
              accessibilityLabel="I agree to recurring monthly billing at ₱599.00/month until I cancel"
              accessibilityState={{ checked: autoRenewalConsent }}
              style={[
                styles.consentBox,
                {
                  backgroundColor: palette.surfaceMuted,
                  borderColor: autoRenewalConsent
                    ? palette.primaryPressed
                    : palette.borderStrong,
                },
              ]}
            >
              <Text style={[styles.checkboxMark, { color: palette.text }]}>
                {autoRenewalConsent ? "[✓]" : "[ ]"}
              </Text>
              <Text style={[styles.consentText, { color: palette.text }]}>
                I understand Humbble Reserve renews monthly at ₱599.00 PHP/month until cancelled, and I can cancel anytime in 2 clicks from Billing settings.
              </Text>
            </Pressable>

            <Button
              testID="scr-20-checkout-btn"
              label="Continue with PayPal Sandbox"
              variant="primary"
              size="lg"
              onPress={handleStartSandboxCheckout}
            />

            <View style={styles.secondaryRow}>
              <Button
                testID="scr-20-to-billing-btn"
                label="Manage Billing & Cancellation"
                variant="secondary"
                size="sm"
                onPress={() => router.push("/(paywall)/billing" as any)}
              />
              <Button
                testID="scr-20-to-refund-policy-btn"
                label="Renewal & Refund Disclosures"
                variant="ghost"
                size="sm"
                onPress={() =>
                  router.push("/(public)/legal/refund-policy" as any)
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
    ...Typography.h2,
  },
  price: {
    ...Typography.subtitle,
  },
  body: {
    ...Typography.bodySmall,
  },
  consentBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    minHeight: TouchTargets.comfortable,
  },
  checkboxMark: {
    ...Typography.bodySemiBold,
  },
  consentText: {
    ...Typography.bodySmall,
    flex: 1,
  },
  secondaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
});
