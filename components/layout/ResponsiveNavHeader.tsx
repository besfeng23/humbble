import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

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

import { navigateBackOrFallback, type NavItem } from "./navigation";

export interface ResponsiveNavHeaderProps {
  /** Screen or section title */
  title: string;
  /** Optional subtitle below title */
  subtitle?: string;
  /** Shows a predictable Back button when true */
  showBack?: boolean;
  /** Accessible label for Back button */
  backLabel?: string;
  /** Deterministic fallback route when history stack cannot go back */
  fallbackHref?: string;
  /** Optional custom back handler */
  onBackPress?: () => void;
  /** Keyboard- and touch-accessible navigation items */
  navItems?: readonly NavItem[];
  /** Currently active nav item ID or href */
  activeNavId?: string;
  /** Optional trailing action node */
  rightSlot?: React.ReactNode;
  /** Override reduced-motion preference */
  reduceMotion?: boolean;
  /** Optional container style override */
  style?: StyleProp<ViewStyle>;
  /** Test identifier prefix */
  testID?: string;
}

export function ResponsiveNavHeader({
  title,
  subtitle,
  showBack = false,
  backLabel = "Back",
  fallbackHref = "/(tabs)/people",
  onBackPress,
  navItems,
  activeNavId,
  rightSlot,
  reduceMotion: reduceMotionProp,
  style,
  testID = "nav-header",
}: ResponsiveNavHeaderProps) {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const reduceMotion = useReducedMotion(reduceMotionProp);
  const motion = getMotionConfig(reduceMotion);
  const [backFocused, setBackFocused] = useState(false);
  const [focusedNavId, setFocusedNavId] = useState<string | null>(null);

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
      return;
    }
    navigateBackOrFallback(router, fallbackHref);
  };

  return (
    <View
      testID={testID}
      accessibilityRole="header"
      style={[
        styles.wrapper,
        {
          backgroundColor: palette.surface,
          borderBottomColor: palette.border,
        },
        style,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.leftRow}>
          {showBack ? (
            <Pressable
              testID={`${testID}-back-button`}
              hitSlop={HitSlop.default}
              onPress={handleBack}
              onFocus={() => setBackFocused(true)}
              onBlur={() => setBackFocused(false)}
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              accessibilityHint="Navigates to the previous screen"
              style={({ pressed }) => [
                styles.backButton,
                {
                  backgroundColor: pressed
                    ? palette.secondaryPressed
                    : palette.secondary,
                  borderColor: backFocused ? palette.focusRing : "transparent",
                  borderWidth: backFocused ? 2 : 0,
                  opacity: pressed ? MotionTransforms.pressedOpacity : 1,
                  transform: [
                    { scale: pressed ? motion.pressedScale : 1 },
                  ],
                },
              ]}
            >
              <Text
                style={[styles.backButtonText, { color: palette.onSecondary }]}
              >
                ← {backLabel}
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.titleContainer}>
            <Text
              testID={`${testID}-title`}
              accessibilityRole="header"
              style={[styles.title, { color: palette.text }]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                testID={`${testID}-subtitle`}
                style={[styles.subtitle, { color: palette.textSecondary }]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        {rightSlot ? (
          <View testID={`${testID}-right-slot`} style={styles.rightSlot}>
            {rightSlot}
          </View>
        ) : null}
      </View>

      {navItems && navItems.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.navBarContent}
          testID={`${testID}-nav-list`}
        >
          {navItems.map((item) => {
            const isSelected =
              activeNavId === item.id || activeNavId === item.href;
            const isFocused = focusedNavId === item.id;

            return (
              <Pressable
                key={item.id}
                testID={`${testID}-nav-${item.id}`}
                hitSlop={HitSlop.compact}
                onPress={() => router.push(item.href as any)}
                onFocus={() => setFocusedNavId(item.id)}
                onBlur={() =>
                  setFocusedNavId((prev) => (prev === item.id ? null : prev))
                }
                accessibilityRole="tab"
                accessibilityLabel={item.accessibilityLabel ?? item.label}
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => [
                  styles.navPill,
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
                    transform: [{ scale: pressed ? motion.pressedScale : 1 }],
                  },
                ]}
              >
                <Text
                  style={[
                    styles.navPillText,
                    {
                      color: isSelected ? palette.onPrimary : palette.text,
                      fontWeight: isSelected ? "700" : "600",
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  leftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  backButton: {
    minHeight: TouchTargets.minimum,
    minWidth: TouchTargets.minimum,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    justifyContent: "center",
    alignItems: "center",
  },
  backButtonText: {
    ...Typography.label,
    fontWeight: "700",
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    ...Typography.h2,
  },
  subtitle: {
    ...Typography.caption,
  },
  rightSlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  navBarContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xxs,
  },
  navPill: {
    minHeight: TouchTargets.minimum,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    justifyContent: "center",
    alignItems: "center",
  },
  navPillText: {
    ...Typography.bodySmall,
  },
});

export default ResponsiveNavHeader;
