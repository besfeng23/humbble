import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ImageBackground, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { PublicLayout } from "@/components/layout";
import { Button } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/lib/AuthProvider";
import { captureAttribution, extractAttributionParams } from "@/lib/attribution";

// Same public editorial image as Bubble Live. Illustrative, NOT a member photograph.
const editorialImage =
  "https://2e0349a89f9baad1c16427dab8ebef56.cdn.bubble.io/f1793010812929x251192660270190180/sincera-hero-editorial-couple.jpg";

export const LANDING_TRUST_POINTS = [
  "18+ only.",
  "Profiles are reviewed by our team.",
  "Report or block anyone in one tap.",
  "We never ask you for money.",
] as const;

const steps = [
  { number: "01", title: "Show up as yourself", detail: "Create a profile that reflects your personality and what matters to you." },
  { number: "02", title: "Find your kind of person", detail: "Explore profiles and connect through mutual interest." },
  { number: "03", title: "Say hello, together", detail: "Private conversation opens after you both express interest." },
] as const;

export default function ConversionLandingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { session } = useAuth();
  const palette = Colors[useColorScheme() ?? "light"];
  const { width } = useWindowDimensions();
  const compact = width < 730;

  useEffect(() => {
    void captureAttribution(params as Record<string, unknown>, "/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (session) return <Redirect href="/(tabs)/people" />;

  const openQuiz = () => router.push({
    pathname: "/quiz",
    params: extractAttributionParams(params as Record<string, unknown>),
  } as any);

  return (
    <PublicLayout
      testID="scr-01-landing"
      title="sincera·"
      subtitle="Intentional dating · Filipina & international singles"
      activeNavId="public-home"
    >
      <View style={styles.previewNote}>
        <Text style={styles.previewNoteText}>
          Independent app preview · Existing Sincera Bubble accounts are not connected here.
        </Text>
      </View>
      <View style={[styles.hero, compact ? styles.heroMobile : styles.heroDesktop]}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>REAL PEOPLE. REAL INTENTIONS. MORE POSSIBILITY.</Text>
          <Text testID="sincera-hero-heading" accessibilityRole="header" style={[styles.heading, compact && styles.headingMobile]}>
            Meet someone who <Text style={styles.emphasis}>means it.</Text>
          </Text>
          <Text style={styles.heroDescription}>
            Meet Filipina singles and international men who are open to something genuine.
            Explore thoughtfully, connect when interest is mutual, and see where a conversation takes you.
          </Text>
          <View style={styles.heroActions}>
            <Button
              testID="scr-01-start-cta"
              label="Create my free profile"
              variant="charcoal"
              size="lg"
              shape="pill"
              onPress={() => router.push("/auth/signup" as any)}
            />
            <Pressable testID="scr-01-quiz-link" accessibilityRole="link" onPress={openQuiz} style={styles.linkTarget}>
              <Text style={styles.lightLink}>Explore the experience</Text>
            </Pressable>
          </View>
          <Text style={styles.freeNote}>18+ only · Free to join · No card required</Text>
        </View>
        <View style={[styles.heroMedia, compact && styles.heroMediaMobile]}>
          <ImageBackground
            source={{ uri: editorialImage }}
            resizeMode="cover"
            testID="sincera-editorial-photo"
            accessibilityLabel="Illustrative photograph of adult couple, not Sincera members"
            style={styles.photo}
          >
            <LinearGradient colors={["transparent", "rgba(16, 40, 35, 0.87)"]} style={styles.photoOverlay}>
              <Text style={styles.photoTitle}>Connection starts with mutual interest.</Text>
              <Text style={styles.photoCredit}>Illustrative photograph · Not Sincera members</Text>
            </LinearGradient>
          </ImageBackground>
        </View>
      </View>
      <View testID="scr-01-trust-points" style={[styles.trustStrip, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        {LANDING_TRUST_POINTS.map((point) => (
          <Text key={point} style={[styles.trustPoint, { color: palette.text }]}>{"✓  "}{point}</Text>
        ))}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionEyebrow}>HOW SINCERA WORKS</Text>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: palette.text }]}>
          A little intention goes a long way.
        </Text>
        <View style={styles.steps}>
          {steps.map((step) => (
            <View key={step.number} style={[styles.stepCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={styles.stepNumber}>{step.number}</Text>
              <Text style={[styles.stepTitle, { color: palette.text }]}>{step.title}</Text>
              <Text style={[styles.stepDescription, { color: palette.textSecondary }]}>{step.detail}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.finalSection}>
        <Text style={[styles.finalHeading, { color: palette.text }]}>One great hello. A new possibility.</Text>
        <Text style={[styles.finalDescription, { color: palette.textSecondary }]}>
          Explore shared values, real intentions and the person behind the photo.
          Messaging after a mutual match is free.
        </Text>
        <Pressable
          testID="scr-01-signin-link"
          accessibilityRole="link"
          onPress={() => router.push("/auth/signin" as any)}
          style={styles.linkTarget}
        >
          <Text style={[styles.signinLink, { color: palette.link }]}>Already a member of this preview? Sign in</Text>
        </Pressable>
      </View>
    </PublicLayout>
  );
}

const styles = StyleSheet.create({
  previewNote: { padding: 11, borderRadius: 8, backgroundColor: "#F7EBD9", alignItems: "center" },
  previewNoteText: { fontSize: 12, color: "#44382A", textAlign: "center", lineHeight: 18 },
  hero: { backgroundColor: "#17352F", overflow: "hidden", borderRadius: 22, width: "100%" },
  heroDesktop: { flexDirection: "row", minHeight: 460 },
  heroMobile: { flexDirection: "column" },
  heroCopy: { flex: 1, justifyContent: "center", padding: 25, gap: 20 },
  eyebrow: { color: "#E9BE75", fontSize: 11, lineHeight: 17, fontWeight: "700", letterSpacing: 1.4 },
  heading: { color: "#FFF9EE", fontSize: 44, lineHeight: 53, fontWeight: "700", letterSpacing: -1 },
  headingMobile: { fontSize: 35, lineHeight: 42 },
  emphasis: { fontStyle: "italic", color: "#E9BE75" },
  heroDescription: { color: "#F3EDE3", fontSize: 16, lineHeight: 26, maxWidth: 480 },
  heroActions: { alignItems: "flex-start", gap: 6 },
  linkTarget: { paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  lightLink: { color: "#FFF9EE", textDecorationLine: "underline", fontSize: 15, fontWeight: "600" },
  freeNote: { color: "#E1E4DF", fontSize: 12, lineHeight: 18 },
  heroMedia: { flex: 0.95, minHeight: 460 },
  heroMediaMobile: { flex: 0, height: 310, minHeight: 310 },
  photo: { flex: 1, justifyContent: "flex-end" },
  photoOverlay: { paddingHorizontal: 18, paddingBottom: 20, paddingTop: 100, gap: 8 },
  photoTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", lineHeight: 25 },
  photoCredit: { color: "#F5ECDD", fontSize: 11 },
  trustStrip: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-around", gap: 15, borderWidth: 1, borderRadius: 15, padding: 18 },
  trustPoint: { ...Typography.bodySmall, fontWeight: "600" },
  section: { paddingTop: 18, gap: 20 },
  sectionEyebrow: { color: "#9B713B", fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  sectionTitle: { fontSize: 30, lineHeight: 38, fontWeight: "700" },
  steps: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stepCard: { flexBasis: 215, flexGrow: 1, minHeight: 170, borderRadius: 15, borderWidth: 1, padding: 20, gap: 10 },
  stepNumber: { color: "#9B713B", fontSize: 16, fontWeight: "800" },
  stepTitle: { fontSize: 18, fontWeight: "700" },
  stepDescription: { fontSize: 14, lineHeight: 23 },
  finalSection: { alignItems: "center", gap: 15, paddingVertical: 22 },
  finalHeading: { fontSize: 28, lineHeight: 37, fontWeight: "700", textAlign: "center" },
  finalDescription: { fontSize: 16, lineHeight: 25, textAlign: "center", maxWidth: 580 },
  signinLink: { fontSize: 14, textDecorationLine: "underline", textAlign: "center" },
});
