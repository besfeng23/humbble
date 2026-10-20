import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityRole,
  type GestureResponderEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type TargetedEvent,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import { Colors } from "@/constants/Colors";
import {
  MotionTransforms,
  getMotionConfig,
  useReducedMotion,
} from "@/constants/Motion";
import { Radii, type RadiusToken } from "@/constants/Radii";
import { Spacing } from "@/constants/Spacing";
import { useColorScheme } from "@/hooks/useColorScheme";

export type CardVariant = "elevated" | "outlined" | "muted" | "accent";

export interface CardProps extends Omit<ViewProps, "style"> {
  children?: React.ReactNode;
  /** Visual card surface style */
  variant?: CardVariant;
  /** Border radius token; defaults to "lg" (12px) */
  radius?: RadiusToken;
  /** Inner padding; defaults to Spacing.xl (16px) */
  padding?: number;
  /** Optional press handler; renders an accessible Pressable when provided */
  onPress?: (event: GestureResponderEvent) => void;
  /** Optional focus handler when interactive */
  onFocus?: (event: NativeSyntheticEvent<TargetedEvent>) => void;
  /** Optional blur handler when interactive */
  onBlur?: (event: NativeSyntheticEvent<TargetedEvent>) => void;
  /** Disables interaction when `onPress` is provided */
  disabled?: boolean;
  /** Controlled focus state for interactive cards */
  focused?: boolean;
  /** Override system reduced-motion setting */
  reduceMotion?: boolean;
  /** Accessibility role; defaults to "button" when interactive */
  accessibilityRole?: AccessibilityRole;
  /** Screen reader label */
  accessibilityLabel?: string;
  /** Screen reader hint */
  accessibilityHint?: string;
  /** Style override */
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  variant = "elevated",
  radius = "lg",
  padding = Spacing.xl,
  onPress,
  onFocus,
  onBlur,
  disabled = false,
  focused: focusedProp,
  reduceMotion: reduceMotionProp,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
  ...rest
}: CardProps) {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const reduceMotion = useReducedMotion(reduceMotionProp);
  const motion = getMotionConfig(reduceMotion);
  const [internalFocused, setInternalFocused] = useState(false);

  const isFocused = focusedProp ?? internalFocused;

  const getSurfaceStyle = (): ViewStyle => {
    switch (variant) {
      case "elevated":
        return {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          borderWidth: 1,
          ...styles.elevatedShadow,
        };
      case "outlined":
        return {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          borderWidth: 1,
        };
      case "muted":
        return {
          backgroundColor: palette.surfaceMuted,
          borderColor: "transparent",
          borderWidth: 0,
        };
      case "accent":
        return {
          backgroundColor: palette.accent,
          borderColor: "transparent",
          borderWidth: 0,
        };
    }
  };

  const baseCardStyle: ViewStyle = {
    borderRadius: Radii[radius],
    padding,
    ...getSurfaceStyle(),
  };

  if (onPress) {
    const handleFocus = (e: NativeSyntheticEvent<TargetedEvent>) => {
      setInternalFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: NativeSyntheticEvent<TargetedEvent>) => {
      setInternalFocused(false);
      onBlur?.(e);
    };

    return (
      <Pressable
        {...rest}
        testID={testID}
        disabled={disabled}
        onPress={(e) => {
          if (!disabled) {
            onPress(e);
          }
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        accessibilityRole={accessibilityRole ?? "button"}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        style={({ pressed }) => {
          const isActivePress = pressed && !disabled;
          return [
            baseCardStyle,
            isFocused
              ? {
                  borderColor: palette.focusRing,
                  borderWidth: 2,
                }
              : undefined,
            disabled ? { opacity: 0.6 } : undefined,
            isActivePress
              ? {
                  opacity: MotionTransforms.pressedOpacity,
                  transform: [{ scale: motion.pressedScale }],
                }
              : undefined,
            style,
          ];
        }}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View
      {...rest}
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[baseCardStyle, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  elevatedShadow: {
    elevation: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
});

export default Card;
