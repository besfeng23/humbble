import { Stack } from "expo-router";
import React from "react";

import { AuthGuard } from "@/components/layout";

export default function PaywallStackLayout() {
  return (
    <AuthGuard mode="protected" redirectTo="/auth/signin" testID="paywall-stack-guard">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="upgrade" />
        <Stack.Screen name="billing" />
      </Stack>
    </AuthGuard>
  );
}
