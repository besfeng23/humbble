import { Stack } from "expo-router";
import React from "react";

import { AuthGuard } from "@/components/layout";

export default function ChatsStackLayout() {
  return (
    <AuthGuard mode="protected" redirectTo="/auth/signin" testID="chats-stack-guard">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="index"
          options={{ title: "chats", headerShown: false }}
        />
        <Stack.Screen name="chatScreen" options={{ headerShown: false }} />
        <Stack.Screen
          name="[conversationId]"
          options={{ headerShown: false }}
        />
      </Stack>
    </AuthGuard>
  );
}
