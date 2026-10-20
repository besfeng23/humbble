import { useRouter } from "expo-router";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { Button } from "@/components/ui/Button";
import {
  MaxContentWidth,
  getBreakpointForWidth,
} from "@/constants/Breakpoints";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/lib/AuthProvider";

import { ResponsiveNavHeader } from "./ResponsiveNavHeader";
import { PUBLIC_NAV_ITEMS } from "./navigation";

export interface PublicLayoutProps {
  /** Page heading in the public header */
  title?: string;
  /** Optional subtitle in the header */
  subtitle?: string;
  /** Shows a predictable Back button when true */
  showBack?: boolean;
  /** Fallback route when history is empty */
  fallbackHref?: string;
  /** Active nav item ID or href */
  activeNavId?: string;
  /** Override reduced motion */
  reduceMotion?: boolean;
  /** Test identifier prefix */
  testID?: string;
  /** Page content */
  children: React.ReactNode;
}

export function PublicLayout({
  title = "Humbble",
  subtitle = "Intentional connections • Philippines launch preview",
  showBack = false,
  fallbackHref = "/(public)",
  activeNavId,
  reduceMotion,
  testID = "public-layout",
  children,
}: PublicLayoutProps) {
  const router = useRouter();
  const { session } = useAuth();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const { width } = useWindowDimensions();
  const breakpoint = getBreakpointForWidth(width || 375);

  const ctaButton = session ? (
    <Button
      testID={`${testID}-open-app-btn`}
      label="Open App"
      variant="primary"
      size="sm"
      shape="pill"
      reduceMotion={reduceMotion}
      onPress={() => router.push("/(tabs)/people" as any)}
    />
  ) : (
    <Button
      testID={`${testID}-signin-btn`}
      label="Sign In"
      variant="charcoal"
      size="sm"
      shape="pill"
      reduceMotion={reduceMotion}
      onPress={() => router.push("/auth/signin" as any)}
    />
  );

  return (
    <View
      testID={testID}
      accessibilityValue={{ text: `breakpoint-${breakpoint}` }}
      style={[styles.root, { backgroundColor: palette.background }]}
    >
      <ResponsiveNavHeader
        testID={`${testID}-header`}
        title={title}
        subtitle={subtitle}
        showBack={showBack}
        fallbackHref={fallbackHref}
        navItems={PUBLIC_NAV_ITEMS}
        activeNavId={activeNavId}
        rightSlot={ctaButton}
        reduceMotion={reduceMotion}
      />

      <ScrollView
        testID={`${testID}-scroll`}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.contentColumn}>{children}</View>

        <View
          testID={`${testID}-footer`}
          style={[
            styles.footer,
            {
              borderTopColor: palette.border,
              backgroundColor: palette.surfaceMuted,
            },
          ]}
        >
          <Text style={[styles.footerText, { color: palette.textSecondary }]}>
            Humbble • 18+ Intentional Dating • DRAFT — COUNSEL REVIEW REQUIRED
          </Text>
          <View style={styles.footerLinks}>
            <Button
              testID={`${testID}-footer-terms`}
              label="Terms of Service"
              variant="ghost"
              size="sm"
              reduceMotion={reduceMotion}
              onPress={() =>
                router.push("/(public)/legal/terms-of-service" as any)
              }
            />
            <Button
              testID={`${testID}-footer-privacy`}
              label="Privacy Notice"
              variant="ghost"
              size="sm"
              reduceMotion={reduceMotion}
              onPress={() =>
                router.push("/(public)/legal/privacy-notice" as any)
              }
            />
            <Button
              testID={`${testID}-footer-safety`}
              label="Community Standards"
              variant="ghost"
              size="sm"
              reduceMotion={reduceMotion}
              onPress={() =>
                router.push("/(public)/legal/community-standards" as any)
              }
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "space-between",
  },
  contentColumn: {
    width: "100%",
    maxWidth: MaxContentWidth.page,
    alignSelf: "center",
    padding: Spacing.xl,
    gap: Spacing.xl,
  },
  footer: {
    width: "100%",
    borderTopWidth: 1,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing["3xl"],
  },
  footerText: {
    ...Typography.caption,
    textAlign: "center",
  },
  footerLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.sm,
  },
});

export default PublicLayout;
