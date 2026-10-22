import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from "react-native";

import {
  MaxContentWidth,
  getBreakpointForWidth,
  isWidthAtLeast,
} from "@/constants/Breakpoints";
import { BrandPalette, Colors } from "@/constants/Colors";
import { Radii } from "@/constants/Radii";
import { HitSlop, Spacing, TouchTargets } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

import { AuthGuard } from "./AuthGuard";
import { navigateBackOrFallback } from "./navigation";
import { textShadow } from "@/constants/Shadows";

export interface AuthLayoutProps {
  /** Hero heading over the warm gold gradient */
  heroTitle: string;
  /** Supporting subtitle under hero heading */
  heroSubtitle: string;
  /** Form card title (e.g., "LOGIN", "SIGN UP", "PASSWORD RECOVERY") */
  formTitle: string;
  /** Optional background image source preserving signin/signup aesthetic */
  backgroundSource?: ImageSourcePropType;
  /** Shows predictable Back button in top bar */
  showBack?: boolean;
  /** Fallback route when back history is empty */
  fallbackHref?: string;
  /** Back button label */
  backLabel?: string;
  /** Whether to wrap with guest-only AuthGuard (defaults to true) */
  guardGuestOnly?: boolean;
  /** Override reduced motion */
  reduceMotion?: boolean;
  /** Test identifier prefix */
  testID?: string;
  /** Form body content */
  children: React.ReactNode;
}

export function AuthLayout({
  heroTitle,
  heroSubtitle,
  formTitle,
  backgroundSource,
  showBack = true,
  fallbackHref = "/(public)",
  backLabel = "Overview",
  guardGuestOnly = true,
  reduceMotion,
  testID = "auth-layout",
  children,
}: AuthLayoutProps) {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const { width, height } = useWindowDimensions();
  const effectiveWidth = width || 375;
  const effectiveHeight = height || 760;
  const breakpoint = getBreakpointForWidth(effectiveWidth);
  const isWide = isWidthAtLeast(effectiveWidth, "md");

  const innerContent = (
    <KeyboardAvoidingView
      testID={testID}
      accessibilityValue={{ text: `breakpoint-${breakpoint}` }}
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <LinearGradient
        colors={[
          BrandPalette.gold500,
          BrandPalette.gold500,
          BrandPalette.charcoal750,
        ]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <ImageBackground
          source={
            backgroundSource ?? require("../../assets/images/sign-in.jpg")
          }
          style={styles.backgroundImage}
          imageStyle={styles.backgroundImageStyle}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContainer,
              { minHeight: effectiveHeight },
            ]}
          >
            {/* Top Navigation Bar */}
            <View style={styles.topNavRow}>
              {showBack ? (
                <Pressable
                  testID={`${testID}-back-button`}
                  hitSlop={HitSlop.default}
                  onPress={() => navigateBackOrFallback(router, fallbackHref)}
                  accessibilityRole="button"
                  accessibilityLabel={`Back to ${backLabel}`}
                  style={({ pressed }) => [
                    styles.navChip,
                    { opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={styles.navChipText}>← {backLabel}</Text>
                </Pressable>
              ) : (
                <View />
              )}

              <View style={styles.topNavRight}>
                <Pressable
                  testID={`${testID}-pricing-link`}
                  hitSlop={HitSlop.default}
                  onPress={() => router.push("/(public)/pricing" as any)}
                  accessibilityRole="link"
                  accessibilityLabel="View Pricing"
                  style={({ pressed }) => [
                    styles.navChip,
                    { opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={styles.navChipText}>Pricing</Text>
                </Pressable>

                <Pressable
                  testID={`${testID}-legal-link`}
                  hitSlop={HitSlop.default}
                  onPress={() =>
                    router.push("/(public)/legal/privacy-notice" as any)
                  }
                  accessibilityRole="link"
                  accessibilityLabel="Privacy Notice"
                  style={({ pressed }) => [
                    styles.navChip,
                    { opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={styles.navChipText}>Privacy</Text>
                </Pressable>
              </View>
            </View>

            {/* Hero Section */}
            <View style={styles.headerSection}>
              <Text
                testID={`${testID}-hero-title`}
                accessibilityRole="header"
                style={styles.welcomeText}
              >
                {heroTitle}
              </Text>
              <Text testID={`${testID}-hero-subtitle`} style={styles.subtitle}>
                {heroSubtitle}
              </Text>
            </View>

            {/* Responsive Form Sheet */}
            <View
              testID={`${testID}-form-sheet`}
              style={[
                styles.formContainer,
                isWide ? styles.formContainerWide : undefined,
                {
                  borderColor: palette.border,
                },
              ]}
            >
              <Text
                testID={`${testID}-form-title`}
                accessibilityRole="header"
                style={styles.formTitle}
              >
                {formTitle}
              </Text>
              {children}
            </View>
          </ScrollView>
        </ImageBackground>
      </LinearGradient>
    </KeyboardAvoidingView>
  );

  if (!guardGuestOnly) {
    return innerContent;
  }

  return (
    <AuthGuard
      mode="guest-only"
      authenticatedRedirectTo="/(tabs)/people"
      reduceMotion={reduceMotion}
      testID={`${testID}-guard`}
    >
      {innerContent}
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
  },
  backgroundImageStyle: {
    opacity: 0.3,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "space-between",
  },
  topNavRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    width: "100%",
    maxWidth: MaxContentWidth.page,
    alignSelf: "center",
  },
  topNavRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  navChip: {
    minHeight: TouchTargets.minimum,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    backgroundColor: "rgba(26, 26, 26, 0.78)",
    justifyContent: "center",
    alignItems: "center",
  },
  navChipText: {
    ...Typography.label,
    color: BrandPalette.white,
  },
  headerSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing["3xl"],
  },
  welcomeText: {
    ...Typography.display,
    color: BrandPalette.white,
    textAlign: "center",
    marginBottom: Spacing.md,
    ...textShadow("rgba(0,0,0,0.35)", 1, 1, 3),
  },
  subtitle: {
    ...Typography.body,
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    ...textShadow("rgba(0,0,0,0.35)", 1, 1, 3),
  },
  formContainer: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderTopLeftRadius: Radii.pill,
    borderTopRightRadius: Radii.pill,
    padding: Spacing["4xl"],
    paddingBottom: Spacing["6xl"],
    width: "100%",
  },
  formContainerWide: {
    maxWidth: MaxContentWidth.form,
    alignSelf: "center",
    borderBottomLeftRadius: Radii.pill,
    borderBottomRightRadius: Radii.pill,
    marginBottom: Spacing["4xl"],
    borderWidth: 1,
  },
  formTitle: {
    ...Typography.h1,
    textAlign: "center",
    marginBottom: Spacing.lg,
    color: BrandPalette.charcoal600,
  },
});

export default AuthLayout;
