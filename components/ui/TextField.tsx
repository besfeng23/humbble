import React, { useEffect, useId, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextInputFocusEventData,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { Colors } from "@/constants/Colors";
import { Radii } from "@/constants/Radii";
import { Spacing, TouchTargets } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  /** Visible field label above the input */
  label: string;
  /** Optional helper description below the input */
  helperText?: string;
  /** Validation error message; sets invalid state and live region */
  error?: string | null;
  /** Marks field as required visually and in accessibility metadata */
  required?: boolean;
  /** Disables editing (`editable={false}`) and applies accessible disabled state */
  disabled?: boolean;
  /** Controlled or simulated focus state */
  focused?: boolean;
  /** Outer wrapper style */
  containerStyle?: StyleProp<ViewStyle>;
  /** TextInput style override */
  inputStyle?: StyleProp<TextStyle>;
  /** Label text style override */
  labelStyle?: StyleProp<TextStyle>;
  /** Error text style override */
  errorStyle?: StyleProp<TextStyle>;
  /** Web only: HTML input attributes react-native-web does not forward (e.g. type="date", min, max). */
  webInputAttributes?: WebInputAttributes;
}

export interface WebInputAttributes {
  type?: string;
  min?: string;
  max?: string;
}

/** Apply (or clear) HTML input attributes on a DOM node. No-op for non-DOM refs. */
export function applyWebInputAttributes(node: unknown, attrs: WebInputAttributes | undefined): void {
  const el = node as { setAttribute?: (k: string, v: string) => void; removeAttribute?: (k: string) => void } | null;
  if (!el || typeof el.setAttribute !== "function" || !attrs) return;
  (["type", "min", "max"] as const).forEach((key) => {
    const value = attrs[key];
    if (value) el.setAttribute!(key, value);
    else el.removeAttribute?.(key);
  });
}

export function TextField({
  label,
  helperText,
  error,
  required = false,
  disabled = false,
  focused: focusedProp,
  editable = true,
  accessibilityLabel,
  accessibilityHint,
  placeholderTextColor,
  onFocus,
  onBlur,
  containerStyle,
  inputStyle,
  labelStyle,
  errorStyle,
  testID,
  webInputAttributes,
  ...rest
}: TextFieldProps) {
  const inputRef = useRef<TextInput>(null);
  const webType = webInputAttributes?.type;
  const webMin = webInputAttributes?.min;
  const webMax = webInputAttributes?.max;
  useEffect(() => {
    if (Platform.OS !== "web") return;
    applyWebInputAttributes(inputRef.current, { type: webType, min: webMin, max: webMax });
  }, [webType, webMin, webMax]);
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const generatedId = useId();
  const [internalFocused, setInternalFocused] = useState(false);

  const isFocused = focusedProp ?? internalFocused;
  const isDisabled = disabled || editable === false;
  const hasError = Boolean(error && error.trim().length > 0);

  const labelId = testID ? `${testID}-label` : `textfield-label-${generatedId}`;
  const errorId = testID ? `${testID}-error` : `textfield-error-${generatedId}`;
  const helperId = testID
    ? `${testID}-helper`
    : `textfield-helper-${generatedId}`;

  const handleFocus = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setInternalFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setInternalFocused(false);
    onBlur?.(e);
  };

  const resolvedBorderColor = hasError
    ? palette.errorBorder
    : isFocused
      ? palette.focusRing
      : palette.border;

  const resolvedBackgroundColor = isDisabled
    ? palette.disabledBackground
    : palette.surfaceMuted;

  const resolvedTextColor = isDisabled ? palette.disabledText : palette.text;

  const resolvedHint =
    accessibilityHint ??
    (hasError ? error ?? undefined : helperText ?? undefined);

  return (
    <View style={[styles.container, containerStyle]}>
      <Text
        nativeID={labelId}
        style={[styles.label, { color: palette.text }, labelStyle]}
      >
        {label}
        {required ? (
          <Text
            style={{ color: palette.danger }}
            accessibilityLabel="required"
          >
            {" *"}
          </Text>
        ) : null}
      </Text>

      <TextInput
        {...rest}
        ref={inputRef}
        testID={testID}
        editable={!isDisabled}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholderTextColor={placeholderTextColor ?? palette.textMuted}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={resolvedHint}
        accessibilityLabelledBy={labelId}
        accessibilityState={{
          disabled: isDisabled,
        }}
        style={[
          styles.input,
          {
            backgroundColor: resolvedBackgroundColor,
            color: resolvedTextColor,
            borderColor: resolvedBorderColor,
            borderWidth: isFocused || hasError ? 2 : 1,
          },
          inputStyle,
        ]}
      />

      {hasError ? (
        <Text
          nativeID={errorId}
          testID={testID ? `${testID}-error` : undefined}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[
            styles.errorMessage,
            {
              color: palette.errorText,
              backgroundColor: palette.errorSurface,
              borderColor: palette.errorBorder,
            },
            errorStyle,
          ]}
        >
          {error}
        </Text>
      ) : helperText ? (
        <Text
          nativeID={helperId}
          testID={testID ? `${testID}-helper` : undefined}
          style={[styles.helperText, { color: palette.textSecondary }]}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
    width: "100%",
  },
  label: {
    ...Typography.label,
    marginBottom: Spacing.sm,
  },
  input: {
    ...Typography.body,
    minHeight: TouchTargets.comfortable,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  helperText: {
    ...Typography.caption,
    marginTop: Spacing.xs,
  },
  errorMessage: {
    ...Typography.bodySmall,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.sm,
    borderWidth: 1,
  },
});

export default TextField;
