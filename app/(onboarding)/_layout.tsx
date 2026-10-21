import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { AuthGuard } from '@/components/layout';

const DEV_PREVIEWS = ['dob', 'underage', 'verify', 'pending', 'failed', 'review', 'empty', 'under-two', 'complete', 'save-error'];
export default function OnboardingStackLayout() {
  const params = useLocalSearchParams<{ preview?: string }>();
  const previewAllowed = __DEV__ && DEV_PREVIEWS.includes(String(params.preview ?? ''));
  const stack = <Stack screenOptions={{ headerShown: false, headerShadowVisible: false }}>
    <Stack.Screen name="basics" />
    <Stack.Screen name="intentions" />
    <Stack.Screen name="photos-prompts" />
    <Stack.Screen name="verify" />
  </Stack>;
  return previewAllowed ? stack : <AuthGuard mode="protected" redirectTo="/auth/signin" testID="onboarding-stack-guard">{stack}</AuthGuard>;
}
