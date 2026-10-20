import { Stack } from "expo-router";
import React from "react";

import { AuthGuard } from "@/components/layout";

export default function SafetyStackLayout() {
  return (
    <AuthGuard mode="protected" redirectTo="/auth/signin" testID="safety-stack-guard">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="report-modal" />
      </Stack>
    </AuthGuard>
  );
}
