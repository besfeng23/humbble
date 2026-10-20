import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import {
  MaxContentWidth,
  getBreakpointForWidth,
} from "@/constants/Breakpoints";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { useColorScheme } from "@/hooks/useColorScheme";

import { AuthGuard } from "./AuthGuard";
import { ResponsiveNavHeader } from "./ResponsiveNavHeader";
import { SETTINGS_NAV_ITEMS } from "./navigation";

export interface SettingsLayoutProps {
  /** Screen title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Predictable fallback route for Back navigation */
  fallbackHref?: string;
  /** Active nav item ID or href */
  activeNavId?: string;
  /** Override reduced motion */
  reduceMotion?: boolean;
  /** Test identifier prefix */
  testID?: string;
  /** Settings/privacy/billing/safety view content */
  children: React.ReactNode;
}

export function SettingsLayout({
  title,
  subtitle,
  fallbackHref = "/(tabs)/profile",
  activeNavId,
  reduceMotion,
  testID = "settings-layout",
  children,
}: SettingsLayoutProps) {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const { width } = useWindowDimensions();
  const breakpoint = getBreakpointForWidth(width || 375);

  return (
    <AuthGuard
      mode="protected"
      redirectTo="/auth/signin"
      reduceMotion={reduceMotion}
      testID={`${testID}-guard`}
    >
      <KeyboardAvoidingView
        testID={testID}
        accessibilityValue={{ text: `breakpoint-${breakpoint}` }}
        style={[styles.root, { backgroundColor: palette.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ResponsiveNavHeader
          testID={`${testID}-header`}
          title={title}
          subtitle={subtitle}
          showBack
          backLabel="Back"
          fallbackHref={fallbackHref}
          navItems={SETTINGS_NAV_ITEMS}
          activeNavId={activeNavId}
          reduceMotion={reduceMotion}
        />

        <ScrollView
          testID={`${testID}-scroll`}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.contentColumn}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.xl,
  },
  contentColumn: {
    width: "100%",
    maxWidth: MaxContentWidth.page,
    alignSelf: "center",
    gap: Spacing.lg,
  },
});

export default SettingsLayout;
