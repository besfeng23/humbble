import { Redirect, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { AuthScreen } from '@/components/layout/AuthScreen';
import { Colors } from '@/constants/Colors';
import { Spacing } from '@/constants/Spacing';
import { useColorScheme } from '@/hooks/useColorScheme';

const destinations = [
  ['Sign in', '/auth/signin'], ['Sign up', '/auth/signup'], ['Check email', '/auth/check-email?preview=done'],
  ['Password recovery', '/auth/recovery'], ['Reset password', '/auth/reset-password'], ['Callback failure', '/auth/callback?preview=fail'],
  ['Date of birth', '/(onboarding)/basics?preview=dob'], ['Under-18 block', '/(onboarding)/basics?preview=underage'],
  ['Photos empty', '/(onboarding)/photos-prompts?preview=empty'], ['Photos below minimum', '/(onboarding)/photos-prompts?preview=under-two'],
  ['Photos complete', '/(onboarding)/photos-prompts?preview=complete'], ['Photo save error', '/(onboarding)/photos-prompts?preview=save-error'],
  ['Verification unavailable', '/(onboarding)/verify?preview=verify'], ['Verification pending', '/(onboarding)/verify?preview=pending'],
  ['Verification failed', '/(onboarding)/verify?preview=failed'], ['Verification review', '/(onboarding)/verify?preview=review'],
] as const;
export default function AuthPreviewScreen() {
  const router = useRouter();
  const palette = Colors[useColorScheme() ?? 'light'];
  if (!__DEV__) return <Redirect href="/auth/signin" />;
  return <AuthScreen testID="auth-preview" title="Authentication preview" subtitle="Open each state without a live Supabase connection.">
    <ScrollView contentContainerStyle={styles.links}>{destinations.map(([label, path]) => <Pressable key={label} accessibilityRole="link" onPress={() => router.push(path as any)} style={styles.link}><Text style={{ color: palette.link, textDecorationLine: 'underline' }}>{label}</Text></Pressable>)}</ScrollView>
  </AuthScreen>;
}
const styles = StyleSheet.create({ links: { gap: Spacing.sm }, link: { minHeight: 44, justifyContent: 'center' } });
