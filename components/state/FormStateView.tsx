import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Spacing } from "@/constants/Spacing";

import { EmptyState } from "./EmptyState";
import { FailureState } from "./FailureState";
import { PendingState } from "./PendingState";
import { SuccessState } from "./SuccessState";

export type FormStatus = "idle" | "pending" | "success" | "failure" | "empty";

export interface FormStateViewProps {
  /** Current form or view status */
  status: FormStatus;
  /** Title shown when status is "pending" */
  pendingTitle?: string;
  /** Supporting message shown when status is "pending" */
  pendingMessage?: string;
  /** Title shown when status is "success" */
  successTitle?: string;
  /** Supporting message shown when status is "success" */
  successMessage?: string;
  /** Action label shown on success state */
  successActionLabel?: string;
  /** Callback invoked when success action is pressed */
  onSuccessAction?: () => void;
  /** Title shown when status is "failure" */
  failureTitle?: string;
  /** Error message shown when status is "failure" */
  failureMessage?: string;
  /** Retry button label on failure state */
  retryLabel?: string;
  /** Callback invoked when retry button is pressed */
  onRetry?: () => void;
  /** Title shown when status is "empty" */
  emptyTitle?: string;
  /** Supporting message shown when status is "empty" */
  emptyMessage?: string;
  /** Action label on empty state */
  emptyActionLabel?: string;
  /** Callback invoked on empty state action */
  onEmptyAction?: () => void;
  /** Whether to keep rendering `children` below the status banner */
  preserveChildren?: boolean;
  /** Compact banner mode */
  compact?: boolean;
  /** Override system reduced-motion setting */
  reduceMotion?: boolean;
  /** Child content (form fields or view content) */
  children?: React.ReactNode;
  /** Optional container style */
  style?: StyleProp<ViewStyle>;
  /** Test identifier prefix */
  testID?: string;
}

export function FormStateView({
  status,
  pendingTitle = "Saving...",
  pendingMessage,
  successTitle = "Saved successfully",
  successMessage,
  successActionLabel,
  onSuccessAction,
  failureTitle = "Action failed",
  failureMessage = "Please check your input and try again.",
  retryLabel = "Try Again",
  onRetry,
  emptyTitle = "Nothing here yet",
  emptyMessage,
  emptyActionLabel,
  onEmptyAction,
  preserveChildren = true,
  compact = false,
  reduceMotion,
  children,
  style,
  testID = "form-state",
}: FormStateViewProps) {
  const renderBanner = () => {
    switch (status) {
      case "pending":
        return (
          <PendingState
            testID={`${testID}-pending`}
            title={pendingTitle}
            message={pendingMessage}
            compact={compact}
            reduceMotion={reduceMotion}
          />
        );
      case "success":
        return (
          <SuccessState
            testID={`${testID}-success`}
            title={successTitle}
            message={successMessage}
            actionLabel={successActionLabel}
            onAction={onSuccessAction}
            compact={compact}
            reduceMotion={reduceMotion}
          />
        );
      case "failure":
        return (
          <FailureState
            testID={`${testID}-failure`}
            title={failureTitle}
            message={failureMessage}
            retryLabel={retryLabel}
            onRetry={onRetry}
            compact={compact}
            reduceMotion={reduceMotion}
          />
        );
      case "empty":
        return (
          <EmptyState
            testID={`${testID}-empty`}
            title={emptyTitle}
            message={emptyMessage}
            actionLabel={emptyActionLabel}
            onAction={onEmptyAction}
            reduceMotion={reduceMotion}
          />
        );
      case "idle":
      default:
        return null;
    }
  };

  const banner = renderBanner();
  const shouldShowChildren = status === "idle" || preserveChildren;

  return (
    <View testID={testID} style={[styles.container, style]}>
      {banner}
      {shouldShowChildren ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: Spacing.lg,
  },
});

export default FormStateView;
