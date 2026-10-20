import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { AuthGuard } from '@/components/layout';

export default function OnboardingStackLayout() {
  const params = useLocalSearchParams<{ preview?: string }>();
  const browserPreview = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('preview') : params.preview;
  const previewAllowed = __DEV__ && ['underage', 'verify'].includes(String(browserPreview ?? ''));
  const stack = <Stack screenOptions={{ headerShown: false, headerShadowVisible: false }}>
    <Stack.Screen name="basics" />
    <Stack.Screen name="intentions" />
    <Stack.Screen name="photos-prompts" />
    <Stack.Screen name="verify" />
  </Stack>;
  return previewAllowed ? stack : <AuthGuard mode="protected" redirectTo="/auth/signin" testID="onboarding-stack-guard">{stack}</AuthGuard>;
}
