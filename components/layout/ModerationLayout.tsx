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
import { Radii } from "@/constants/Radii";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

import { AuthGuard } from "./AuthGuard";
import { ResponsiveNavHeader } from "./ResponsiveNavHeader";
import { MODERATION_NAV_ITEMS } from "./navigation";

export interface ModerationLayoutProps {
  /** Screen title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Fallback route when back history is empty */
  fallbackHref?: string;
  /** Active nav item ID or href */
  activeNavId?: string;
  /** Override reduced motion */
  reduceMotion?: boolean;
  /** Test identifier prefix */
  testID?: string;
  /** Moderation view content */
  children: React.ReactNode;
}

export function ModerationLayout({
  title,
  subtitle = "Trust & Safety moderation",
  fallbackHref = "/(tabs)/profile",
  activeNavId,
  reduceMotion,
  testID = "moderation-layout",
  children,
}: ModerationLayoutProps) {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const { width } = useWindowDimensions();
  const breakpoint = getBreakpointForWidth(width || 375);

  const rightSlot = (
    <Button
      testID={`${testID}-exit-btn`}
      label="Exit moderation"
      variant="secondary"
      size="sm"
      reduceMotion={reduceMotion}
      onPress={() => router.replace("/(tabs)/profile" as any)}
    />
  );

  return (
    <AuthGuard
      mode="moderator"
      redirectTo="/auth/signin"
      fallbackHref={fallbackHref}
      reduceMotion={reduceMotion}
      testID={`${testID}-guard`}
    >
      <View
        testID={testID}
        accessibilityValue={{ text: `breakpoint-${breakpoint}` }}
        style={[styles.root, { backgroundColor: palette.background }]}
      >
        <ResponsiveNavHeader
          testID={`${testID}-header`}
          title={title}
          subtitle={subtitle}
          showBack
          backLabel="Back"
          fallbackHref={fallbackHref}
          navItems={MODERATION_NAV_ITEMS}
          activeNavId={activeNavId}
          rightSlot={rightSlot}
          reduceMotion={reduceMotion}
        />

        <View
          testID={`${testID}-sla-banner`}
          style={[
            styles.slaBanner,
            {
              backgroundColor: palette.infoSurface,
              borderBottomColor: palette.infoBorder,
            },
          ]}
        >
          <Text style={[styles.slaBannerText, { color: palette.infoText }]}>
            Internal pilot targets: urgent reports are triaged within 4h, all others within 24h. Viewing a case and every action are recorded in the audit log.
          </Text>
        </View>

        <ScrollView
          testID={`${testID}-scroll`}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.contentColumn}>{children}</View>
        </ScrollView>
      </View>
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  slaBanner: {
    width: "100%",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
  },
  slaBannerText: {
    ...Typography.caption,
    fontWeight: "600",
    textAlign: "center",
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
    borderRadius: Radii.lg,
  },
});

export default ModerationLayout;
