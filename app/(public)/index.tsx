import { Redirect, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { PublicLayout } from "@/components/layout";
import { Button, Card } from "@/components/ui";
import { BrandPalette, Colors } from "@/constants/Colors";
import { Radii } from "@/constants/Radii";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/lib/AuthProvider";

export default function ConversionLandingScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];

  if (session) {
    return <Redirect href="/(tabs)/people" />;
  }

  return (
    <PublicLayout
      testID="scr-01-landing"
      title="Humbble"
      subtitle="Intentional Dating • Philippines Launch"
      activeNavId="public-home"
    >
      <Card
        testID="scr-01-hero-card"
        variant="accent"
        radius="2xl"
        padding={Spacing["3xl"]}
      >
        <View style={styles.heroContent}>
          <Text
            testID="scr-01-badge"
            style={[
              styles.badge,
              {
                backgroundColor: BrandPalette.charcoal750,
                color: BrandPalette.white,
              },
            ]}
          >
            SCR-01 • 18+ Verified Community
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.heroTitle, { color: palette.onAccent }]}
          >
            Start Intentional Dating with Respect & Safety
          </Text>
          <Text style={[styles.heroSubtitle, { color: palette.onAccent }]}>
            Connect with verified adults who share your values, relationship goals, and cultural interests. Mutual text messaging is always free.
          </Text>

          <View style={styles.ctaRow}>
            <Button
              testID="scr-01-start-cta"
              label="Start Intentional Dating"
              variant="charcoal"
              size="lg"
              shape="pill"
              onPress={() => router.push("/auth/signup" as any)}
            />
            <Button
              testID="scr-01-signin-cta"
              label="Sign In"
              variant="secondary"
              size="lg"
              shape="pill"
              onPress={() => router.push("/auth/signin" as any)}
            />
          </View>
        </View>
      </Card>

      <View style={styles.grid}>
        <Card
          testID="scr-01-pillar-verification"
          variant="elevated"
          style={styles.pillarCard}
        >
          <Text
            accessibilityRole="header"
            style={[styles.pillarTitle, { color: palette.text }]}
          >
            18+ Age Gate & Liveness Verification
          </Text>
          <Text style={[styles.pillarBody, { color: palette.textSecondary }]}>
            Every profile completes mandatory 18+ age verification and privacy-first liveness checks with zero raw biometric retention.
          </Text>
        </Card>

        <Card
          testID="scr-01-pillar-messaging"
          variant="elevated"
          style={styles.pillarCard}
        >
          <Text
            accessibilityRole="header"
            style={[styles.pillarTitle, { color: palette.text }]}
          >
            Free Mutual Messaging & Safety Shield
          </Text>
          <Text style={[styles.pillarBody, { color: palette.textSecondary }]}>
            Once you mutually match, text chat is completely free with one-tap block and report controls on every profile and thread.
          </Text>
        </Card>
      </View>

      <Card testID="scr-01-pricing-callout" variant="outlined">
        <View style={styles.calloutRow}>
          <View style={styles.calloutTextWrap}>
            <Text
              accessibilityRole="header"
              style={[styles.pillarTitle, { color: palette.text }]}
            >
              Transparent Free & Humbble Reserve Plans
            </Text>
            <Text style={[styles.pillarBody, { color: palette.textSecondary }]}>
              Compare Free features with Humbble Reserve monthly membership (₱599.00/month in PH).
            </Text>
          </View>
          <Button
            testID="scr-01-compare-pricing-btn"
            label="Compare Plans"
            variant="primary"
            shape="pill"
            onPress={() => router.push("/(public)/pricing" as any)}
          />
        </View>
      </Card>
    </PublicLayout>
  );
}

const styles = StyleSheet.create({
  heroContent: {
    gap: Spacing.lg,
    alignItems: "flex-start",
  },
  badge: {
    ...Typography.caption,
    fontWeight: "700",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.pill,
    overflow: "hidden",
  },
  heroTitle: {
    ...Typography.display,
  },
  heroSubtitle: {
    ...Typography.body,
  },
  ctaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.lg,
  },
  pillarCard: {
    flex: 1,
    minWidth: 260,
    gap: Spacing.sm,
  },
  pillarTitle: {
    ...Typography.h3,
  },
  pillarBody: {
    ...Typography.bodySmall,
  },
  calloutRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.lg,
  },
  calloutTextWrap: {
    flex: 1,
    minWidth: 220,
    gap: Spacing.xs,
  },
});
