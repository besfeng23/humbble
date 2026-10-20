import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { AuthGuard } from '@/components/layout';

export default function OnboardingStackLayout() {
  const params = useLocalSearchParams<{ preview?: string }>();
  const locationSearch = typeof window !== 'undefined' && window.location && typeof window.location.search === 'string' ? window.location.search : '';
  const browserPreview = locationSearch ? new URLSearchParams(locationSearch).get('preview') : params.preview;
  const previewAllowed = __DEV__ && ['dob', 'underage', 'verify'].includes(String(browserPreview ?? ''));
  const stack = <Stack screenOptions={{ headerShown: false, headerShadowVisible: false }}>
    <Stack.Screen name="basics" />
    <Stack.Screen name="intentions" />
    <Stack.Screen name="photos-prompts" />
    <Stack.Screen name="verify" />
  </Stack>;
  return previewAllowed ? stack : <AuthGuard mode="protected" redirectTo="/auth/signin" testID="onboarding-stack-guard">{stack}</AuthGuard>;
}
