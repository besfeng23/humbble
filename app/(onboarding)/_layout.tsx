import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { AuthGuard } from '@/components/layout';

export default function OnboardingStackLayout() {
  const params = useLocalSearchParams<{ preview?: string }>();
  // Dev previews are explicit Expo Router query params only. Do not infer a
  // preview from ambient window.location, which can leak between web tests and
  // accidentally bypass the logged-out redirect.
  const previewAllowed = __DEV__ && ['dob', 'underage', 'verify'].includes(String(params.preview ?? ''));
  const stack = <Stack screenOptions={{ headerShown: false, headerShadowVisible: false }}>
    <Stack.Screen name="basics" />
    <Stack.Screen name="intentions" />
    <Stack.Screen name="photos-prompts" />
    <Stack.Screen name="verify" />
  </Stack>;
  return previewAllowed ? stack : <AuthGuard mode="protected" redirectTo="/auth/signin" testID="onboarding-stack-guard">{stack}</AuthGuard>;
}
