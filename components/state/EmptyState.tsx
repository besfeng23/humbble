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

export interface EmptyStateProps {
  /** Empty state heading */
  title: string;
  /** Supporting description */
  message?: string;
  /** Primary CTA label; renders only when `onAction` is also provided */
  actionLabel?: string;
  /** Primary CTA callback */
  onAction?: () => void;
  /** Secondary CTA label; renders only when `onSecondaryAction` is also provided */
  secondaryActionLabel?: string;
  /** Secondary CTA callback */
  onSecondaryAction?: () => void;
  /** Override system reduced-motion setting */
  reduceMotion?: boolean;
  /** Screen reader label override */
  accessibilityLabel?: string;
  /** Optional container style override */
  style?: StyleProp<ViewStyle>;
  /** Test identifier */
  testID?: string;
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  reduceMotion: reduceMotionProp,
  accessibilityLabel,
  style,
  testID = "empty-state",
}: EmptyStateProps) {
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
      accessibilityLabel={combinedLabel}
      style={[
        styles.container,
        {
          backgroundColor: palette.surfaceMuted,
          borderColor: palette.border,
        },
        style,
      ]}
    >
      <Text
        testID={`${testID}-title`}
        accessibilityRole="header"
        style={[styles.title, { color: palette.text }]}
      >
        {title}
      </Text>
      {message ? (
        <Text
          testID={`${testID}-message`}
          style={[styles.message, { color: palette.textSecondary }]}
        >
          {message}
        </Text>
      ) : null}

      {hasPrimaryAction || hasSecondaryAction ? (
        <View style={styles.actionsRow}>
          {hasPrimaryAction && onAction ? (
            <Button
              testID={`${testID}-primary-action`}
              label={actionLabel}
              variant="primary"
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
    padding: Spacing["2xl"],
    borderRadius: Radii.xl,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  title: {
    ...Typography.h3,
    textAlign: "center",
  },
  message: {
    ...Typography.body,
    textAlign: "center",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
});

export default EmptyState;
