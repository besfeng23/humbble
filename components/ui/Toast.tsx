import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Colors } from "@/constants/Colors";
import {
  getMotionConfig,
  resolveAnimationDuration,
  useReducedMotion,
} from "@/constants/Motion";
import { Radii } from "@/constants/Radii";
import { HitSlop, Spacing, TouchTargets } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastProps {
  /** Message text displayed inside the toast/banner */
  message: string;
  /** Optional bold title above the message */
  title?: string;
  /** Semantic variant matching Humbble's alert banners */
  variant?: ToastVariant;
  /** Controls visibility; defaults to true */
  visible?: boolean;
  /** Optional dismiss handler; renders an accessible close button when provided */
  onDismiss?: () => void;
  /** Accessible label for the dismiss button */
  dismissLabel?: string;
  /** Override system reduced-motion setting */
  reduceMotion?: boolean;
  /** Screen reader label override */
  accessibilityLabel?: string;
  /** Optional container style override */
  style?: StyleProp<ViewStyle>;
  /** Test identifier */
  testID?: string;
}

export function Toast({
  message,
  title,
  variant = "info",
  visible = true,
  onDismiss,
  dismissLabel = "Dismiss notification",
  reduceMotion: reduceMotionProp,
  accessibilityLabel,
  style,
  testID = "toast",
}: ToastProps) {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const reduceMotion = useReducedMotion(reduceMotionProp);
  const motion = getMotionConfig(reduceMotion);
  const transitionDuration = resolveAnimationDuration(
    motion.durationNormal,
    reduceMotion
  );

  if (!visible) {
    return null;
  }

  const getVariantTokens = () => {
    switch (variant) {
      case "error":
        return {
          backgroundColor: palette.errorSurface,
          textColor: palette.errorText,
          borderColor: palette.errorBorder,
          liveRegion: "assertive" as const,
        };
      case "warning":
        return {
          backgroundColor: palette.warningSurface,
          textColor: palette.warningText,
          borderColor: palette.warningBorder,
          liveRegion: "polite" as const,
        };
      case "success":
        return {
          backgroundColor: palette.successSurface,
          textColor: palette.successText,
          borderColor: palette.successBorder,
          liveRegion: "polite" as const,
        };
      case "info":
      default:
        return {
          backgroundColor: palette.infoSurface,
          textColor: palette.infoText,
          borderColor: palette.infoBorder,
          liveRegion: "polite" as const,
        };
    }
  };

  const tokens = getVariantTokens();
  const combinedLabel =
    accessibilityLabel ?? (title ? `${title}. ${message}` : message);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion={tokens.liveRegion}
      accessibilityLabel={combinedLabel}
      accessibilityValue={{
        text: transitionDuration === 0 ? "reduced-motion" : "standard-motion",
      }}
      style={[
        styles.container,
        {
          backgroundColor: tokens.backgroundColor,
          borderColor: tokens.borderColor,
        },
        style,
      ]}
    >
      <View style={styles.textContainer}>
        {title ? (
          <Text
            testID={`${testID}-title`}
            style={[styles.title, { color: tokens.textColor }]}
          >
            {title}
          </Text>
        ) : null}
        <Text
          testID={`${testID}-message`}
          style={[styles.message, { color: tokens.textColor }]}
        >
          {message}
        </Text>
      </View>

      {onDismiss ? (
        <Pressable
          testID={`${testID}-dismiss`}
          hitSlop={HitSlop.default}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
          style={({ pressed }) => [
            styles.dismissButton,
            {
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.dismissText, { color: tokens.textColor }]}>
            ×
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderRadius: Radii.sm,
    borderWidth: 1,
    width: "100%",
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...Typography.label,
    marginBottom: Spacing.xxs,
  },
  message: {
    ...Typography.bodySmall,
  },
  dismissButton: {
    minWidth: TouchTargets.wcagMinimum,
    minHeight: TouchTargets.wcagMinimum,
    marginLeft: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissText: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "700",
  },
});

export default Toast;
