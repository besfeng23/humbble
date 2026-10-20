import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
  type GestureResponderEvent,
  type NativeSyntheticEvent,
  type PressableProps,
  type StyleProp,
  type TargetedEvent,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { BrandPalette, Colors } from "@/constants/Colors";
import {
  MotionTransforms,
  getMotionConfig,
  useReducedMotion,
} from "@/constants/Motion";
import { Radii } from "@/constants/Radii";
import { HitSlop, Spacing, TouchTargets } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

export type ButtonVariant =
  | "primary"
  | "charcoal"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  /** Button label text or custom React node */
  children?: React.ReactNode;
  /** Explicit text label; also used as fallback for accessibilityLabel */
  label?: string;
  /** Visual variant preserving Humbble's gold, charcoal, and neutral pill styles */
  variant?: ButtonVariant;
  /** Size preset */
  size?: ButtonSize;
  /** Pill shape (borderRadius: 30) vs rounded rectangle (borderRadius: 12) */
  shape?: "rounded" | "pill";
  /** Disables interaction and applies accessible disabled state */
  disabled?: boolean;
  /** Shows loading indicator and disables interaction */
  loading?: boolean;
  /** Controlled or simulated keyboard/accessibility focus state */
  focused?: boolean;
  /** Override system reduced-motion setting (useful for testing) */
  reduceMotion?: boolean;
  /** Accessibility role, defaults to "button" */
  accessibilityRole?: AccessibilityRole;
  /** Screen reader label; defaults to `label` or string `children` */
  accessibilityLabel?: string;
  /** Optional accessibility hint */
  accessibilityHint?: string;
  /** Container style override */
  style?: StyleProp<ViewStyle>;
  /** Label text style override */
  textStyle?: StyleProp<TextStyle>;
  /** Optional leading icon or element */
  leftIcon?: React.ReactNode;
  /** Optional trailing icon or element */
  rightIcon?: React.ReactNode;
}

export function Button({
  children,
  label,
  variant = "primary",
  size = "md",
  shape = "rounded",
  disabled = false,
  loading = false,
  focused: focusedProp,
  reduceMotion: reduceMotionProp,
  accessibilityRole = "button",
  accessibilityLabel,
  accessibilityHint,
  onPress,
  onFocus,
  onBlur,
  style,
  textStyle,
  leftIcon,
  rightIcon,
  testID,
  ...rest
}: ButtonProps) {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const reduceMotion = useReducedMotion(reduceMotionProp);
  const motion = getMotionConfig(reduceMotion);
  const [internalFocused, setInternalFocused] = useState(false);

  const isFocused = focusedProp ?? internalFocused;
  const isDisabled = Boolean(disabled || loading);

  const resolvedLabel =
    accessibilityLabel ??
    label ??
    (typeof children === "string" ? children : undefined);

  const handlePress = (event: GestureResponderEvent) => {
    if (isDisabled) {
      return;
    }
    onPress?.(event);
  };

  const handleFocus = (event: NativeSyntheticEvent<TargetedEvent>) => {
    setInternalFocused(true);
    onFocus?.(event);
  };

  const handleBlur = (event: NativeSyntheticEvent<TargetedEvent>) => {
    setInternalFocused(false);
    onBlur?.(event);
  };

  const getVariantColors = (pressed: boolean) => {
    if (isDisabled) {
      return {
        backgroundColor: palette.disabledBackground,
        textColor: palette.disabledText,
        borderColor: palette.border,
        borderWidth: variant === "outline" ? 1 : 0,
      };
    }

    switch (variant) {
      case "primary":
        return {
          backgroundColor: pressed ? palette.primaryPressed : palette.primary,
          textColor: palette.onPrimary,
          borderColor: "transparent",
          borderWidth: 0,
        };
      case "charcoal":
        return {
          backgroundColor: BrandPalette.charcoal750,
          textColor: BrandPalette.white,
          borderColor: "transparent",
          borderWidth: 0,
        };
      case "secondary":
        return {
          backgroundColor: pressed ? palette.secondaryPressed : palette.secondary,
          textColor: palette.onSecondary,
          borderColor: "transparent",
          borderWidth: 0,
        };
      case "outline":
        return {
          backgroundColor: pressed ? palette.surfaceMuted : "transparent",
          textColor: palette.text,
          borderColor: palette.borderStrong,
          borderWidth: 1.5,
        };
      case "ghost":
        return {
          backgroundColor: pressed ? palette.surfaceMuted : "transparent",
          textColor: palette.text,
          borderColor: "transparent",
          borderWidth: 0,
        };
      case "danger":
        return {
          backgroundColor: palette.dangerSolid,
          textColor: palette.onDangerSolid,
          borderColor: "transparent",
          borderWidth: 0,
        };
    }
  };

  const sizeStyles = SIZE_MAP[size];
  const radius = shape === "pill" ? Radii.pill : Radii.lg;

  return (
    <Pressable
      {...rest}
      testID={testID}
      disabled={isDisabled}
      hitSlop={HitSlop.default}
      onPress={handlePress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={resolvedLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled: isDisabled,
        busy: loading,
      }}
      style={({ pressed }) => {
        const isActivePress = pressed && !isDisabled;
        const colors = getVariantColors(isActivePress);

        return [
          styles.base,
          sizeStyles.container,
          {
            backgroundColor: colors.backgroundColor,
            borderRadius: radius,
            borderColor: isFocused ? palette.focusRing : colors.borderColor,
            borderWidth: isFocused ? 2 : colors.borderWidth,
            opacity: isActivePress ? MotionTransforms.pressedOpacity : 1,
            transform: [
              {
                scale: isActivePress ? motion.pressedScale : 1,
              },
            ],
          },
          isFocused ? styles.focused : undefined,
          style,
        ];
      }}
    >
      {({ pressed }) => {
        const colors = getVariantColors(pressed && !isDisabled);
        const content = label ?? children;

        return (
          <View style={styles.contentRow}>
            {loading ? (
              <ActivityIndicator
                testID={testID ? `${testID}-spinner` : "button-loading-spinner"}
                size="small"
                color={colors.textColor}
                style={styles.spinner}
              />
            ) : (
              leftIcon
            )}
            {typeof content === "string" || typeof content === "number" ? (
              <Text
                style={[
                  styles.textBase,
                  sizeStyles.text,
                  { color: colors.textColor },
                  textStyle,
                ]}
              >
                {content}
              </Text>
            ) : (
              content
            )}
            {!loading ? rightIcon : null}
          </View>
        );
      }}
    </Pressable>
  );
}

const SIZE_MAP: Record<
  ButtonSize,
  { container: ViewStyle; text: TextStyle }
> = {
  sm: {
    container: {
      minHeight: TouchTargets.minimum,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.lg,
    },
    text: {
      ...Typography.label,
      fontWeight: "700",
    },
  },
  md: {
    container: {
      minHeight: TouchTargets.minimum,
      paddingVertical: Spacing.lg,
      paddingHorizontal: Spacing.xl,
    },
    text: Typography.button,
  },
  lg: {
    container: {
      minHeight: TouchTargets.comfortable,
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing["3xl"],
    },
    text: Typography.buttonLarge,
  },
};

const styles = StyleSheet.create({
  base: {
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  textBase: {
    textAlign: "center",
  },
  spinner: {
    marginRight: Spacing.xs,
  },
  focused: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 2,
  },
});

export default Button;
