import { Stack } from 'expo-router';
import React from 'react';

export default function AuthStackLayout() {
  return <Stack screenOptions={{ headerShown: false, headerShadowVisible: false, animation: 'default' }}>
    <Stack.Screen name="signin" />
    <Stack.Screen name="signup" />
    <Stack.Screen name="recovery" />
    <Stack.Screen name="callback" />
    <Stack.Screen name="reset-password" />
    <Stack.Screen name="check-email" />
    <Stack.Screen name="preview" />
  </Stack>;
}
