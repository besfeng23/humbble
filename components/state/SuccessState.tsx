import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/Colors";
import { useReducedMotion } from "@/constants/Motion";
import { Radii } from "@/constants/Radii";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

export interface SuccessStateProps {
  /** Primary success title */
  title: string;
  /** Optional descriptive message */
  message?: string;
  /** Primary CTA label; button renders only when `onAction` is also provided */
  actionLabel?: string;
  /** Primary CTA callback */
  onAction?: () => void;
  /** Secondary CTA label; button renders only when `onSecondaryAction` is also provided */
  secondaryActionLabel?: string;
  /** Secondary CTA callback */
  onSecondaryAction?: () => void;
  /** Compact inline banner style */
  compact?: boolean;
  /** Override system reduced-motion setting */
  reduceMotion?: boolean;
  /** Screen reader label override */
  accessibilityLabel?: string;
  /** Optional container style override */
  style?: StyleProp<ViewStyle>;
  /** Test identifier */
  testID?: string;
}

export function SuccessState({
  title,
  message,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  compact = false,
  reduceMotion: reduceMotionProp,
  accessibilityLabel,
  style,
  testID = "success-state",
}: SuccessStateProps) {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const reduceMotion = useReducedMotion(reduceMotionProp);

  const combinedLabel =
    accessibilityLabel ?? (message ? `${title}. ${message}` : title);

  const hasPrimaryAction = Boolean(actionLabel && onAction);
  const hasSecondaryAction = Boolean(secondaryActionLabel && onSecondaryAction);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={combinedLabel}
      style={[
        styles.container,
        compact ? styles.compact : undefined,
        {
          backgroundColor: palette.successSurface,
          borderColor: palette.successBorder,
        },
        style,
      ]}
    >
      <View style={styles.textWrap}>
        <Text
          testID={`${testID}-title`}
          accessibilityRole="header"
          style={[styles.title, { color: palette.successText }]}
        >
          {title}
        </Text>
        {message ? (
          <Text
            testID={`${testID}-message`}
            style={[styles.message, { color: palette.successText }]}
          >
            {message}
          </Text>
        ) : null}
      </View>

      {hasPrimaryAction || hasSecondaryAction ? (
        <View style={styles.actionsRow}>
          {hasPrimaryAction && onAction ? (
            <Button
              testID={`${testID}-primary-action`}
              label={actionLabel}
              variant="charcoal"
              size="sm"
              reduceMotion={reduceMotion}
              onPress={onAction}
            />
          ) : null}
          {hasSecondaryAction && onSecondaryAction ? (
            <Button
              testID={`${testID}-secondary-action`}
              label={secondaryActionLabel}
              variant="secondary"
              size="sm"
              reduceMotion={reduceMotion}
              onPress={onSecondaryAction}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    padding: Spacing.xl,
    borderRadius: Radii.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  compact: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  textWrap: {
    gap: Spacing.xs,
  },
  title: {
    ...Typography.bodySemiBold,
  },
  message: {
    ...Typography.bodySmall,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
});

export default SuccessState;
