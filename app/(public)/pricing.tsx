import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { PublicLayout } from "@/components/layout";
import { Button, Card } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/lib/AuthProvider";
import { type BillingPlan, PAYMENTS_ARE_TEST_ONLY, TEST_PAYMENTS_NOTICE, countryHintFromLocale, deviceLocale, formatPrice, getBillingPlan } from "@/lib/billing";

const TIER_ROWS = [
  { feature: "Daily likes", free: "Up to 15", reserve: "Unlimited" },
  { feature: "See who liked you", free: "Count only", reserve: "Full list" },
  { feature: "Messaging after a match", free: "Included", reserve: "Included" },
] as const;

export default function PricingScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [plan, setPlan] = useState<BillingPlan | null>(null);

  // Signed-in members see their server-resolved local price (profile country >
  // locale hint > PH). Guests see generic copy; prices are never hardcoded here.
  useEffect(() => {
    if (!session) { setPlan(null); return; }
    let live = true;
    void getBillingPlan(countryHintFromLocale(deviceLocale())).then((p) => { if (live) setPlan(p); });
    return () => { live = false; };
  }, [session]);

  const priceDisplay = plan ? `${formatPrice(plan.amount, plan.currency)} / month` : "Monthly, in your local currency";

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
      title="Pricing"
      subtitle="One monthly plan. Cancel anytime."
      showBack
      fallbackHref="/(public)"
      activeNavId="public-pricing"
    >
      <View style={styles.stack}>
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
              Free
            </Text>
            <Text
              style={[styles.planSummary, { color: palette.textSecondary }]}
            >
              Discover profiles, send up to 15 likes a day, and message your matches for free.
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
              Humbble Premium
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
              Renews monthly until cancelled. Cancel anytime from Billing.
            </Text>
            {PAYMENTS_ARE_TEST_ONLY ? (
              <Text
                testID="scr-02-test-payments-note"
                style={[styles.planSummary, { color: palette.textSecondary }]}
              >
                {TEST_PAYMENTS_NOTICE}
              </Text>
            ) : null}
            <Button
              testID="scr-02-reserve-cta"
              label={
                session
                  ? "Continue"
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
            Free vs Premium
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
                Free: {row.free}
              </Text>
              <Text style={[styles.tierCell, { color: palette.text }]}>
                Premium: {row.reserve}
              </Text>
            </View>
          ))}
        </Card>
      </View>
    </PublicLayout>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.lg,
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
