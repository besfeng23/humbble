import { Stack } from "expo-router";
import React from "react";

import { AuthGuard } from "@/components/layout";

export default function AdminModerationStackLayout() {
  return (
    <AuthGuard
      mode="moderator"
      redirectTo="/auth/signin"
      fallbackHref="/(tabs)/profile"
      testID="admin-stack-guard"
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="moderation/index" />
        <Stack.Screen name="moderation/[reportId]" />
      </Stack>
    </AuthGuard>
  );
}
