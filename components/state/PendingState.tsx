import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Colors } from "@/constants/Colors";
import { useReducedMotion } from "@/constants/Motion";
import { Radii } from "@/constants/Radii";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

export interface PendingStateProps {
  /** Primary heading displayed alongside the spinner */
  title?: string;
  /** Optional supporting explanation */
  message?: string;
  /** Renders centered in a flex: 1 full-screen container when true */
  fullScreen?: boolean;
  /** Compact inline layout for form sections */
  compact?: boolean;
  /** Override system reduced-motion preference */
  reduceMotion?: boolean;
  /** Screen reader label override */
  accessibilityLabel?: string;
  /** Optional container style override */
  style?: StyleProp<ViewStyle>;
  /** Test identifier */
  testID?: string;
}

export function PendingState({
  title = "Loading...",
  message,
  fullScreen = false,
  compact = false,
  reduceMotion: reduceMotionProp,
  accessibilityLabel,
  style,
  testID = "pending-state",
}: PendingStateProps) {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const reduceMotion = useReducedMotion(reduceMotionProp);

  const combinedLabel =
    accessibilityLabel ?? (message ? `${title}. ${message}` : title);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityLabel={combinedLabel}
      accessibilityState={{ busy: true }}
      accessibilityValue={{
        text: reduceMotion ? "reduced-motion" : "standard-motion",
      }}
      style={[
        styles.base,
        fullScreen
          ? [styles.fullScreen, { backgroundColor: palette.background }]
          : [
              styles.card,
              {
                backgroundColor: palette.surfaceMuted,
                borderColor: palette.border,
              },
            ],
        compact ? styles.compact : undefined,
        style,
      ]}
    >
      <ActivityIndicator
        testID={`${testID}-spinner`}
        size={compact ? "small" : "large"}
        color={palette.tint}
        animating={!reduceMotion}
      />
      <View style={compact ? styles.compactTextWrap : styles.textWrap}>
        {title ? (
          <Text
            testID={`${testID}-title`}
            style={[styles.title, { color: palette.text }]}
          >
            {title}
          </Text>
        ) : null}
        {message ? (
          <Text
            testID={`${testID}-message`}
            style={[styles.message, { color: palette.textSecondary }]}
          >
            {message}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
  fullScreen: {
    flex: 1,
    padding: Spacing["3xl"],
    gap: Spacing.lg,
  },
  card: {
    width: "100%",
    padding: Spacing.xl,
    borderRadius: Radii.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  compact: {
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  textWrap: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  compactTextWrap: {
    flex: 1,
    alignItems: "flex-start",
    gap: Spacing.xxs,
  },
  title: {
    ...Typography.bodySemiBold,
    textAlign: "center",
  },
  message: {
    ...Typography.bodySmall,
    textAlign: "center",
  },
});

export default PendingState;
