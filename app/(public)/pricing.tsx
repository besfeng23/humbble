import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { PublicLayout } from "@/components/layout";
import { Button, Card } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { FontFamilies, Typography } from "@/constants/Typography";
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

  const priceDisplay = plan ? `${formatPrice(plan.amount, plan.currency)} / month · price proposal` : "Monthly pricing proposal · not on sale";

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
      subtitle="Free membership · Premium proposed"
      showBack
      fallbackHref="/(public)"
      activeNavId="public-pricing"
    >
      <View style={styles.stack}>
        <View style={styles.pricingHero}>
          <Text style={styles.kicker}>PRICING</Text>
          <Text accessibilityRole="header" style={styles.pricingTitle}>Simple, transparent membership.</Text>
          <Text style={styles.pricingLead}>Free membership stays available for profile discovery, mutual matches, private conversations and safety tools. Paid tiers are proposed only; no checkout is active.</Text>
        </View>
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
              FREE MEMBERSHIP
            </Text>
            <Text style={[styles.planPrice, { color: palette.text }]}>
              Free — always
            </Text>
            <Text
              style={[styles.planSummary, { color: palette.textSecondary }]}
            >
              Create and edit your profile · Discover compatible members · Like and match · Message mutual matches · Block and report anyone. Current preview allowance is 15 likes/day; Bubble Live advertises 20 and backend parity is not yet complete.
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
              Premium price preview · not yet on sale
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
              Not on sale. Future plans may renew monthly. Cancel anytime from Billing.
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
              label="Not yet on sale"
              disabled={true}
              variant="primary"
              shape="pill"
              onPress={handleSelectReserve}
            />
          </Card>
        </View>

        <Text testID="scr-02-provider-approval-note" style={[styles.sectionBody, { color: palette.textSecondary }]}>
          No live Sincera subscriptions are available. Payment-provider approval, secure checkout, and cancellation testing are required before paid plans can launch.
        </Text>

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
        <View style={styles.billingNotes}>
          <Text style={styles.notesTitle}>Payments</Text>
          <Text style={styles.note}>PayPal online-dating merchant approval and verified live checkout are not complete. No production payment can be taken from this preview.</Text>
          <Text style={styles.notesTitle}>Billing and renewal</Text>
          <Text style={styles.note}>Any future plan would display its price, billing period, renewal terms and cancellation steps before payment.</Text>
          <Text style={styles.notesTitle}>How to cancel</Text>
          <Text style={styles.note}>Paid subscriptions are not active. When approved, cancellation must be verified with the payment provider, not just reflected in the page.</Text>
        </View>
      </View>
    </PublicLayout>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.lg,
  },
  pricingHero: { paddingVertical: 18, gap: 12 },
  kicker: { fontSize: 12, color: "#966B2D", letterSpacing: 1.7, fontWeight: "700" },
  pricingTitle: { fontFamily: FontFamilies.editorial, fontSize: 48, lineHeight: 54, fontWeight: "600", color: "#17362D" },
  pricingLead: { fontSize: 17, lineHeight: 26, color: "#536056", maxWidth: 870 },
  billingNotes: { borderTopWidth: 1, borderTopColor: "#E8DFD3", paddingVertical: 20, gap: 9 },
  notesTitle: { fontFamily: FontFamilies.editorial, fontSize: 25, color: "#17362D", fontWeight: "600" },
  note: { color: "#596158", fontSize: 14, lineHeight: 23 },
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
