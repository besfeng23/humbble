import { Stack } from "expo-router";
import React from "react";

export default function PublicStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="quiz" />
      <Stack.Screen name="pricing" />
      <Stack.Screen name="how-it-works" />
      <Stack.Screen name="faq" />
      <Stack.Screen name="safety" />
      <Stack.Screen name="affiliate-program" />
      <Stack.Screen name="legal/[slug]" />
    </Stack>
  );
}
