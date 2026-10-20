import { Stack } from "expo-router";
import React from "react";

export default function PublicStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="pricing" />
      <Stack.Screen name="legal/[slug]" />
    </Stack>
  );
}
