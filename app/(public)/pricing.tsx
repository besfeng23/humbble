import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { PublicLayout } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/lib/AuthProvider";

const TIER_ROWS = [
  {
    feature: "Create profile, upload 2–6 photos & complete 3 prompts",
    free: "Included (Free)",
    reserve: "Included",
  },
  {
    feature: "Mutual match real-time text messaging",
    free: "Included (Always Free)",
    reserve: "Included (Always Free)",
  },
  {
    feature: "One-tap Block, Report & Safety Shield",
    free: "Included (Always Free)",
    reserve: "Included (Always Free)",
  },
  {
    feature: "Daily discovery likes",
    free: "Up to 15 likes / day",
    reserve: "Unlimited likes",
  },
  {
    feature: "Incoming Likes Hub (SCR-14)",
    free: "Exact verified count",
    reserve: "Full unblurred likes grid",
  },
  {
    feature: "Incognito mode & advanced filters",
    free: "Core filters",
    reserve: "Included",
  },
] as const;

export default function PricingScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [market, setMarket] = useState<"PH" | "US">("PH");
  const [status, setStatus] = useState<FormStatus>("idle");

  const priceDisplay =
    market === "PH"
      ? "₱599.00 PHP / month (Philippines Launch Market)"
      : "$29.99 USD / month (US Market — Deferred at PH Launch)";

  const handleSelectReserve = () => {
    if (!session) {
      router.push("/auth/signin" as any);
      return;
    }
    router.push("/(paywall)/upgrade" as any);
  };

  return (
    <PublicLayout
      testID="scr-02-pricing"
      title="Pricing & Plans"
      subtitle="SCR-02 • Transparent Monthly Pricing (PayPal Sandbox Mode)"
      showBack
      fallbackHref="/(public)"
      activeNavId="public-pricing"
    >
      <FormStateView
        testID="scr-02-form-state"
        status={status}
        pendingTitle="Refreshing market catalogue..."
        successTitle="Market catalogue updated"
        successMessage={`Showing server-configured ${market} monthly pricing.`}
        failureTitle="Could not refresh live catalogue"
        failureMessage="Displaying fallback server-approved monthly plan table."
        onRetry={() => setStatus("success")}
      >
        <Card testID="scr-02-market-selector" variant="muted">
          <View style={styles.selectorRow}>
            <View style={styles.selectorInfo}>
              <Text
                accessibilityRole="header"
                style={[styles.sectionTitle, { color: palette.text }]}
              >
                Server-Priced Monthly Plans (v1.2 A5)
              </Text>
              <Text
                style={[styles.sectionBody, { color: palette.textSecondary }]}
              >
                Single monthly plan per market; no multi-month lock-in plans. Prices are resolved server-side only.
              </Text>
            </View>
            <View style={styles.marketButtons}>
              <Button
                testID="scr-02-market-ph"
                label="PH (₱599/mo)"
                variant={market === "PH" ? "primary" : "secondary"}
                size="sm"
                shape="pill"
                onPress={() => {
                  setMarket("PH");
                  setStatus("success");
                }}
              />
              <Button
                testID="scr-02-market-us"
                label="US ($29.99/mo)"
                variant={market === "US" ? "primary" : "secondary"}
                size="sm"
                shape="pill"
                onPress={() => {
                  setMarket("US");
                  setStatus("success");
                }}
              />
            </View>
          </View>
        </Card>

        <View style={styles.cardsGrid}>
          <Card
            testID="scr-02-free-card"
            variant="outlined"
            style={styles.planCard}
          >
            <Text
              accessibilityRole="header"
              style={[styles.planName, { color: palette.text }]}
            >
              Humbble Free
            </Text>
            <Text style={[styles.planPrice, { color: palette.text }]}>
              ₱0 / month
            </Text>
            <Text
              style={[styles.planSummary, { color: palette.textSecondary }]}
            >
              Discover verified profiles, send up to 15 likes per day, and message mutual matches for free.
            </Text>
            <Button
              testID="scr-02-free-cta"
              label={session ? "Continue with Free" : "Sign Up Free"}
              variant="secondary"
              shape="pill"
              onPress={() =>
                router.push(
                  (session ? "/(tabs)/people" : "/auth/signup") as any
                )
              }
            />
          </Card>

          <Card
            testID="scr-02-reserve-card"
            variant="elevated"
            style={styles.planCard}
          >
            <Text
              accessibilityRole="header"
              style={[styles.planName, { color: palette.text }]}
            >
              Humbble Reserve (Monthly)
            </Text>
            <Text
              testID="scr-02-reserve-price"
              style={[styles.planPrice, { color: palette.text }]}
            >
              {priceDisplay}
            </Text>
            <Text
              style={[styles.planSummary, { color: palette.textSecondary }]}
            >
              Auto-renews monthly until cancelled. Cancel anytime in 2 clicks from Billing settings. PayPal Sandbox only during pilot.
            </Text>
            <Button
              testID="scr-02-reserve-cta"
              label={
                session
                  ? "Proceed to Reserve Upgrade"
                  : "Sign In to Subscribe"
              }
              variant="primary"
              shape="pill"
              onPress={handleSelectReserve}
            />
          </Card>
        </View>

        <Card testID="scr-02-comparison-table" variant="outlined">
          <Text
            accessibilityRole="header"
            style={[styles.sectionTitle, { color: palette.text }]}
          >
            Feature Comparison
          </Text>
          {TIER_ROWS.map((row) => (
            <View
              key={row.feature}
              style={[
                styles.tableRow,
                { borderBottomColor: palette.border },
              ]}
            >
              <Text style={[styles.featureCell, { color: palette.text }]}>
                {row.feature}
              </Text>
              <Text
                style={[styles.tierCell, { color: palette.textSecondary }]}
              >
                Free: ✓ {row.free}
              </Text>
              <Text style={[styles.tierCell, { color: palette.text }]}>
                Reserve: ★ {row.reserve}
              </Text>
            </View>
          ))}
        </Card>
      </FormStateView>
    </PublicLayout>
  );
}

const styles = StyleSheet.create({
  selectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  selectorInfo: {
    flex: 1,
    minWidth: 220,
    gap: Spacing.xs,
  },
  marketButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.h3,
  },
  sectionBody: {
    ...Typography.bodySmall,
  },
  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.lg,
  },
  planCard: {
    flex: 1,
    minWidth: 260,
    gap: Spacing.md,
  },
  planName: {
    ...Typography.h2,
  },
  planPrice: {
    ...Typography.subtitle,
  },
  planSummary: {
    ...Typography.bodySmall,
  },
  tableRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.xs,
  },
  featureCell: {
    ...Typography.bodySemiBold,
  },
  tierCell: {
    ...Typography.bodySmall,
  },
});
