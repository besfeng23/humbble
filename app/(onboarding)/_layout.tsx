import { Stack } from "expo-router";
import React from "react";

import { AuthGuard } from "@/components/layout";

export default function OnboardingStackLayout() {
  return (
    <AuthGuard mode="protected" redirectTo="/auth/signin" testID="onboarding-stack-guard">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="basics" />
        <Stack.Screen name="intentions" />
        <Stack.Screen name="photos-prompts" />
        <Stack.Screen name="verify" />
      </Stack>
    </AuthGuard>
  );
}
