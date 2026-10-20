import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  MaxContentWidth,
  getBreakpointForWidth,
  isWidthAtLeast,
} from "@/constants/Breakpoints";
import { Colors } from "@/constants/Colors";
import {
  MotionTransforms,
  getMotionConfig,
  useReducedMotion,
} from "@/constants/Motion";
import { Radii } from "@/constants/Radii";
import { HitSlop, Spacing, TouchTargets } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

import { AuthGuard } from "./AuthGuard";
import { DATING_NAV_ITEMS } from "./navigation";

export interface DatingLayoutProps {
  /** Active tab or route identifier */
  activeNavId?: string;
  /** Optional explicit viewport width override (useful for responsive testing) */
  viewportWidth?: number;
  /** Override reduced-motion setting */
  reduceMotion?: boolean;
  /** Test identifier prefix */
  testID?: string;
  /** Dating view content (e.g. Tabs or detail screen) */
  children: React.ReactNode;
}

export function DatingLayout({
  activeNavId,
  viewportWidth,
  reduceMotion: reduceMotionProp,
  testID = "dating-layout",
  children,
}: DatingLayoutProps) {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const reduceMotion = useReducedMotion(reduceMotionProp);
  const motion = getMotionConfig(reduceMotion);
  const { width } = useWindowDimensions();
  const effectiveWidth = viewportWidth ?? (width || 375);
  const breakpoint = getBreakpointForWidth(effectiveWidth);
  const isWide = isWidthAtLeast(effectiveWidth, "md");
  const [focusedId, setFocusedId] = useState<string | null>(null);

  return (
    <AuthGuard
      mode="protected"
      redirectTo="/auth/signin"
      reduceMotion={reduceMotion}
      testID={`${testID}-guard`}
    >
      <SafeAreaView
        testID={testID}
        accessibilityValue={{ text: `breakpoint-${breakpoint}` }}
        style={[styles.safeArea, { backgroundColor: palette.background }]}
      >
        {isWide ? (
          <View
            testID={`${testID}-desktop-nav`}
            accessibilityRole="tablist"
            style={[
              styles.desktopNavBar,
              {
                backgroundColor: palette.surface,
                borderBottomColor: palette.border,
              },
            ]}
          >
            <View style={styles.desktopNavInner}>
              <Text
                style={[styles.brandTitle, { color: palette.text }]}
                accessibilityRole="header"
              >
                Humbble
              </Text>
              <View style={styles.desktopNavLinks}>
                {DATING_NAV_ITEMS.map((item) => {
                  const isSelected =
                    activeNavId === item.id || activeNavId === item.href;
                  const isFocused = focusedId === item.id;

                  return (
                    <Pressable
                      key={item.id}
                      testID={`${testID}-nav-${item.id}`}
                      hitSlop={HitSlop.compact}
                      onPress={() => router.push(item.href as any)}
                      onFocus={() => setFocusedId(item.id)}
                      onBlur={() =>
                        setFocusedId((prev) =>
                          prev === item.id ? null : prev
                        )
                      }
                      accessibilityRole="tab"
                      accessibilityLabel={
                        item.accessibilityLabel ?? item.label
                      }
                      accessibilityState={{ selected: isSelected }}
                      style={({ pressed }) => [
                        styles.desktopNavPill,
                        {
                          backgroundColor: isSelected
                            ? palette.primary
                            : pressed
                              ? palette.secondaryPressed
                              : palette.surfaceMuted,
                          borderColor: isFocused
                            ? palette.focusRing
                            : isSelected
                              ? palette.primaryPressed
                              : palette.border,
                          borderWidth: isFocused ? 2 : 1,
                          opacity: pressed ? MotionTransforms.pressedOpacity : 1,
                          transform: [
                            { scale: pressed ? motion.pressedScale : 1 },
                          ],
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.desktopNavText,
                          {
                            color: isSelected
                              ? palette.onPrimary
                              : palette.text,
                            fontWeight: isSelected ? "700" : "600",
                          },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        ) : null}

        <View
          testID={`${testID}-content`}
          style={[styles.content, isWide ? styles.contentWide : undefined]}
        >
          {children}
        </View>
      </SafeAreaView>
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  desktopNavBar: {
    width: "100%",
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  desktopNavInner: {
    width: "100%",
    maxWidth: MaxContentWidth.page,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.lg,
  },
  brandTitle: {
    ...Typography.h2,
    fontWeight: "700",
  },
  desktopNavLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.sm,
  },
  desktopNavPill: {
    minHeight: TouchTargets.minimum,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    justifyContent: "center",
    alignItems: "center",
  },
  desktopNavText: {
    ...Typography.bodySmall,
  },
  content: {
    flex: 1,
    width: "100%",
  },
  contentWide: {
    maxWidth: MaxContentWidth.page,
    alignSelf: "center",
  },
});

export default DatingLayout;
