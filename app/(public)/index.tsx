import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PublicLayout } from "@/components/layout";
import { Button } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/lib/AuthProvider";
import { captureAttribution } from "@/lib/attribution";

/**
 * Truthful trust points only. Identity/liveness verification is NOT live yet, so the
 * landing page must not claim it. Keep this list short and verifiable.
 */
export const LANDING_TRUST_POINTS = [
  "18+ only.",
  "Profiles are reviewed by our team.",
  "Report or block anyone in one tap.",
  "We never ask you for money.",
] as const;

export default function ConversionLandingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { session } = useAuth();
  const palette = Colors[useColorScheme() ?? "light"];

  useEffect(() => {
    void captureAttribution(params as Record<string, unknown>, "/");
    // Capture once per landing visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (session) {
    return <Redirect href="/(tabs)/people" />;
  }

  return (
    <PublicLayout testID="scr-01-landing" title="Humbble" subtitle="Intentional dating, 18+ only" activeNavId="public-home">
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={[styles.heroTitle, { color: palette.text }]}>
          Intentional dating for people who want something real.
        </Text>
        <Text style={[styles.heroSubtitle, { color: palette.textSecondary }]}>
          Meet adults looking for a serious relationship. Messaging after a mutual match is free.
        </Text>
      </View>

      <View testID="scr-01-trust-points" style={styles.trustList}>
        {LANDING_TRUST_POINTS.map((point) => (
          <Text key={point} style={[styles.trustItem, { color: palette.text }]}>
            {"\u2713  "}{point}
          </Text>
        ))}
      </View>

      <Button
        testID="scr-01-start-cta"
        label="Create your free account"
        variant="charcoal"
        size="lg"
        shape="pill"
        onPress={() => router.push("/auth/signup" as any)}
      />
      <Pressable
        testID="scr-01-signin-link"
        accessibilityRole="link"
        onPress={() => router.push("/auth/signin" as any)}
        style={styles.signinLink}
      >
        <Text style={{ color: palette.link, textDecorationLine: "underline" }}>
          Already a member? Sign in
        </Text>
      </Pressable>
    </PublicLayout>
  );
}

const styles = StyleSheet.create({
  hero: { gap: Spacing.md },
  heroTitle: { ...Typography.display },
  heroSubtitle: { ...Typography.body },
  trustList: { gap: Spacing.sm },
  trustItem: { ...Typography.body },
  signinLink: { minHeight: 44, alignSelf: "center", justifyContent: "center" },
});
