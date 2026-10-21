import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaxContentWidth, getBreakpointForWidth } from '@/constants/Breakpoints';
import { Colors } from '@/constants/Colors';
import { Radii } from '@/constants/Radii';
import { Spacing } from '@/constants/Spacing';
import { Typography } from '@/constants/Typography';
import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthGuard } from './AuthGuard';
import { ResponsiveNavHeader } from './ResponsiveNavHeader';
import { ONBOARDING_STEP_ITEMS } from './navigation';

export interface OnboardingLayoutProps {
  step: number; totalSteps?: number; title: string; subtitle?: string; fallbackHref?: string;
  reduceMotion?: boolean; testID?: string; children: React.ReactNode;
  /** Explicitly bypass the guard only for __DEV__ preview routes. */
  skipAuthGuard?: boolean;
}

export function OnboardingLayout({ step, totalSteps = 4, title, subtitle, fallbackHref = '/(tabs)/profile', reduceMotion, testID = 'onboarding-layout', children, skipAuthGuard = false }: OnboardingLayoutProps) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { width } = useWindowDimensions();
  const breakpoint = getBreakpointForWidth(width || 375);
  const clampedStep = Math.max(1, Math.min(totalSteps, step));
  const progressPercent = Math.round((clampedStep / totalSteps) * 100);
  const activeStepItem = ONBOARDING_STEP_ITEMS.find((item) => item.step === clampedStep);
  const content = <KeyboardAvoidingView testID={testID} accessibilityValue={{ text: `breakpoint-${breakpoint}` }} style={[styles.root, { backgroundColor: palette.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ResponsiveNavHeader testID={`${testID}-header`} title={title} subtitle={`Step ${clampedStep} of ${totalSteps}${subtitle ? ` • ${subtitle}` : ''}`} showBack fallbackHref={fallbackHref} navItems={ONBOARDING_STEP_ITEMS} activeNavId={activeStepItem?.id} reduceMotion={reduceMotion} />
    <View testID={`${testID}-progress`} accessible accessibilityRole="progressbar" accessibilityLabel={`Onboarding progress: Step ${clampedStep} of ${totalSteps}`} accessibilityValue={{ min: 1, max: totalSteps, now: clampedStep, text: `Step ${clampedStep} of ${totalSteps} (${progressPercent}%)` }} style={[styles.progressTrack, { backgroundColor: palette.surfaceMuted }]}>
      <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: palette.primary }]} />
    </View>
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.formColumn}>{subtitle ? <Text testID={`${testID}-description`} style={[styles.subtitle, { color: palette.textSecondary }]}>{subtitle}</Text> : null}{children}</View>
    </ScrollView>
  </KeyboardAvoidingView>;
  return skipAuthGuard && __DEV__ ? content : <AuthGuard mode="protected" redirectTo="/auth/signin" reduceMotion={reduceMotion} testID={`${testID}-guard`}>{content}</AuthGuard>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, progressTrack: { width: '100%', height: 6, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: Radii.full },
  scrollContent: { flexGrow: 1, padding: Spacing.xl }, formColumn: { width: '100%', maxWidth: MaxContentWidth.form, alignSelf: 'center', gap: Spacing.lg }, subtitle: { ...Typography.body },
});
export default OnboardingLayout;
