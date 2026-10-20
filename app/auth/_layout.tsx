import { Stack } from "expo-router";
import React from "react";

export default function AuthStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="signin" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="recovery" />
    </Stack>
  );
}
