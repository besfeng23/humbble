import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Colors } from "@/constants/Colors";
import { MaxContentWidth } from "@/constants/Breakpoints";
import { useReducedMotion } from "@/constants/Motion";
import { Radii } from "@/constants/Radii";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

import { Button, type ButtonVariant } from "./Button";

export interface DialogAction {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export interface DialogProps {
  /** Controls visibility of the modal dialog */
  visible: boolean;
  /** Accessible dialog title */
  title: string;
  /** Optional descriptive message */
  description?: string;
  /** Optional custom body content */
  children?: React.ReactNode;
  /** Callback invoked when the user requests to close the dialog (backdrop or system back) */
  onClose?: () => void;
  /** Primary action button configuration */
  primaryAction?: DialogAction;
  /** Secondary / cancel action button configuration */
  secondaryAction?: DialogAction;
  /** Whether tapping the backdrop calls `onClose`; defaults to true */
  dismissOnBackdropPress?: boolean;
  /** Override system reduced-motion setting */
  reduceMotion?: boolean;
  /** Screen reader label for the dialog container; defaults to `title` */
  accessibilityLabel?: string;
  /** Optional container style override */
  style?: StyleProp<ViewStyle>;
  /** Test identifier */
  testID?: string;
}

export function Dialog({
  visible,
  title,
  description,
  children,
  onClose,
  primaryAction,
  secondaryAction,
  dismissOnBackdropPress = true,
  reduceMotion: reduceMotionProp,
  accessibilityLabel,
  style,
  testID = "dialog",
}: DialogProps) {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const reduceMotion = useReducedMotion(reduceMotionProp);

  if (!visible) {
    return null;
  }

  const animationType = reduceMotion ? "none" : "fade";

  return (
    <Modal
      transparent
      visible={visible}
      animationType={animationType}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, { backgroundColor: palette.scrim }]}>
        <Pressable
          testID={`${testID}-backdrop`}
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (dismissOnBackdropPress) {
              onClose?.();
            }
          }}
        />
        <View
          testID={testID}
          accessible
          accessibilityViewIsModal
          accessibilityLiveRegion="polite"
          accessibilityLabel={accessibilityLabel ?? title}
          style={[
            styles.dialogSurface,
            {
              backgroundColor: palette.surfaceElevated,
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

          {description ? (
            <Text
              testID={`${testID}-description`}
              style={[styles.description, { color: palette.textSecondary }]}
            >
              {description}
            </Text>
          ) : null}

          {children ? <View style={styles.body}>{children}</View> : null}

          {primaryAction || secondaryAction ? (
            <View style={styles.actionsRow}>
              {secondaryAction ? (
                <Button
                  testID={secondaryAction.testID ?? `${testID}-secondary-action`}
                  label={secondaryAction.label}
                  accessibilityLabel={
                    secondaryAction.accessibilityLabel ?? secondaryAction.label
                  }
                  variant={secondaryAction.variant ?? "secondary"}
                  disabled={secondaryAction.disabled}
                  loading={secondaryAction.loading}
                  reduceMotion={reduceMotion}
                  onPress={secondaryAction.onPress}
                  style={styles.actionButton}
                />
              ) : null}
              {primaryAction ? (
                <Button
                  testID={primaryAction.testID ?? `${testID}-primary-action`}
                  label={primaryAction.label}
                  accessibilityLabel={
                    primaryAction.accessibilityLabel ?? primaryAction.label
                  }
                  variant={primaryAction.variant ?? "primary"}
                  disabled={primaryAction.disabled}
                  loading={primaryAction.loading}
                  reduceMotion={reduceMotion}
                  onPress={primaryAction.onPress}
                  style={styles.actionButton}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["2xl"],
  },
  dialogSurface: {
    width: "100%",
    maxWidth: MaxContentWidth.dialog,
    borderRadius: Radii.xl,
    padding: Spacing["3xl"],
    borderWidth: 1,
    elevation: 6,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  title: {
    ...Typography.h3,
    marginBottom: Spacing.md,
  },
  description: {
    ...Typography.body,
    marginBottom: Spacing.xl,
  },
  body: {
    marginBottom: Spacing.xl,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.lg,
    marginTop: Spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});

export default Dialog;
