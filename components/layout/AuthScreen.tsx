import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Spacing, TouchTargets } from '@/constants/Spacing';
import { Typography } from '@/constants/Typography';
import { useColorScheme } from '@/hooks/useColorScheme';

export function AuthScreen({ title, subtitle, children, testID }: { title: string; subtitle?: string; children: React.ReactNode; testID?: string }) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { width, height } = useWindowDimensions();
  const isWide = width >= 768;
  return (
    <KeyboardAvoidingView style={[styles.fill, { backgroundColor: palette.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, isWide ? { minHeight: height, justifyContent: 'center' } : styles.scrollCompact]} keyboardShouldPersistTaps="handled">
        <View style={styles.content} testID={testID}>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: palette.textSecondary }]}>{subtitle}</Text> : null}
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({ fill: { flex: 1 }, scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl }, scrollCompact: { justifyContent: 'flex-start', paddingTop: Spacing['3xl'] }, content: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: Spacing.lg }, title: { ...Typography.h1 }, subtitle: { ...Typography.body }, });

/** A primary auth action keeps its normal color when disabled; state is communicated by dimming. */
export function AuthPrimaryButton({ testID, label, disabled = false, loading = false, onPress }: { testID: string; label: string; disabled?: boolean; loading?: boolean; onPress: () => void }) {
  const palette = Colors[useColorScheme() ?? 'light'];
  const [focused, setFocused] = React.useState(false);
  const isDisabled = disabled || loading;
  return (
    <Pressable
      testID={testID}
      disabled={isDisabled}
      onPress={() => { if (!isDisabled) onPress(); }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => ({
        minHeight: TouchTargets.comfortable,
        borderRadius: 12,
        paddingHorizontal: Spacing['3xl'],
        paddingVertical: Spacing.xl,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.primary,
        borderColor: focused ? palette.focusRing : 'transparent',
        borderWidth: focused ? 2 : 0,
        opacity: isDisabled ? 0.5 : pressed ? 0.86 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md }}>{loading ? <ActivityIndicator size="small" color={palette.onPrimary} /> : null}<Text style={[Typography.buttonLarge, { color: palette.onPrimary }]}>{label}</Text></View>
    </Pressable>
  );
}
