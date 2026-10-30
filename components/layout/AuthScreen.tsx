import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
    <SafeAreaView style={[styles.fill, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, isWide ? { minHeight: height, justifyContent: 'center' } : styles.scrollCompact]} keyboardShouldPersistTaps="handled">
          <View style={styles.content} testID={testID}>
            <Text style={styles.wordmark}>sincera·</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>{title}</Text>
            {subtitle ? <Text style={[styles.subtitle, { color: palette.textSecondary }]}>{subtitle}</Text> : null}
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A quiet, readable inline notice shared by unavailable and recovery states. */
export function AuthNotice({ testID, children }: { testID: string; children: React.ReactNode }) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <View testID={`${testID}-notice`} accessibilityRole="alert" style={[styles.notice, { backgroundColor: palette.warningSurface, borderColor: palette.warningBorder }]}>
      <Text testID={testID} style={[Typography.body, { color: palette.text }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl },
  scrollCompact: { justifyContent: 'flex-start', paddingTop: Spacing['3xl'], paddingBottom: Spacing.xl },
  content: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: Spacing.lg, padding: 24, backgroundColor: '#FFFDFA', borderRadius: 20, borderWidth: 1, borderColor: '#E9E0D3' },
  wordmark: { fontFamily: 'Georgia', color: '#17362D', fontSize: 30, fontWeight: '700', marginBottom: 10 },
  title: { ...Typography.h1, fontFamily: 'Georgia', fontSize: 34, lineHeight: 40 },
  subtitle: { ...Typography.body },
  notice: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, marginVertical: Spacing.xs },
  disabledOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.18)', borderRadius: 12 },
});

/** A primary auth action keeps its normal hue when disabled; the fill is dimmed while its label stays readable. */
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
        borderRadius: 28,
        paddingHorizontal: Spacing['3xl'],
        paddingVertical: Spacing.xl,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.primary,
        borderColor: focused ? palette.focusRing : 'transparent',
        borderWidth: focused ? 2 : 0,
        overflow: 'hidden',
        opacity: pressed && !isDisabled ? 0.86 : 1,
      })}
    >
      {isDisabled ? <View testID={`${testID}-disabled-overlay`} pointerEvents="none" style={styles.disabledOverlay} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md }}>{loading ? <ActivityIndicator size="small" color={palette.onPrimary} /> : null}<Text style={[Typography.buttonLarge, { color: palette.onPrimary }]}>{label}</Text></View>
    </Pressable>
  );
}
