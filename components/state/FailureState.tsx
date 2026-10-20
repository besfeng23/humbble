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

export interface FailureStateProps {
  /** Error / failure heading */
  title?: string;
  /** Descriptive failure message */
  message: string;
  /** Label for retry button when `onRetry` is provided */
  retryLabel?: string;
  /** Retry callback; retry button renders only when provided */
  onRetry?: () => void;
  /** Optional secondary action label; renders only when `onSecondaryAction` is provided */
  secondaryActionLabel?: string;
  /** Optional secondary action callback */
  onSecondaryAction?: () => void;
  /** Compact inline error style */
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

export function FailureState({
  title = "Something went wrong",
  message,
  retryLabel = "Try Again",
  onRetry,
  secondaryActionLabel,
  onSecondaryAction,
  compact = false,
  reduceMotion: reduceMotionProp,
  accessibilityLabel,
  style,
  testID = "failure-state",
}: FailureStateProps) {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const reduceMotion = useReducedMotion(reduceMotionProp);

  const combinedLabel =
    accessibilityLabel ?? (title ? `${title}. ${message}` : message);

  const hasRetry = Boolean(onRetry);
  const hasSecondary = Boolean(secondaryActionLabel && onSecondaryAction);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={combinedLabel}
      style={[
        styles.container,
        compact ? styles.compact : undefined,
        {
          backgroundColor: palette.errorSurface,
          borderColor: palette.errorBorder,
        },
        style,
      ]}
    >
      <View style={styles.textWrap}>
        {title ? (
          <Text
            testID={`${testID}-title`}
            accessibilityRole="header"
            style={[styles.title, { color: palette.errorText }]}
          >
            {title}
          </Text>
        ) : null}
        <Text
          testID={`${testID}-message`}
          style={[styles.message, { color: palette.errorText }]}
        >
          {message}
        </Text>
      </View>

      {hasRetry || hasSecondary ? (
        <View style={styles.actionsRow}>
          {hasRetry && onRetry ? (
            <Button
              testID={`${testID}-retry-action`}
              label={retryLabel}
              variant="danger"
              size="sm"
              reduceMotion={reduceMotion}
              onPress={onRetry}
            />
          ) : null}
          {hasSecondary && onSecondaryAction ? (
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

export default FailureState;
