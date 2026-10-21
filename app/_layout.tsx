import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { SafetyReportRetry } from '@/components/safety/SafetyReportRetry';
import { PendingState } from '@/components/state';
import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '@/lib/AuthProvider';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { loading } = useAuth();

  // Keep the root navigator mounted after auth bootstrap; protected route layouts
  // independently redirect once this loading gate has completed.
  if (loading) return <PendingState fullScreen title="Loading..." testID="auth-bootstrap-pending" />;
  return (
    <Stack screenOptions={{ headerShown: false, headerShadowVisible: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'chats' }} />
      <Stack.Screen name="(public)" options={{ headerShown: false, headerShadowVisible: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false, headerShadowVisible: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false, headerShadowVisible: false }} />
      <Stack.Screen name="(paywall)" options={{ headerShown: false, headerShadowVisible: false }} />
      <Stack.Screen name="(safety)" options={{ headerShown: false, headerShadowVisible: false }} />
      <Stack.Screen name="(admin)" options={{ headerShown: false, headerShadowVisible: false }} />
      <Stack.Screen name="charscreenf" options={{ headerShown: false, headerShadowVisible: false }} />
      <Stack.Screen name="+not-found" options={{ headerShadowVisible: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({ SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf') });
  useEffect(() => { if (loaded) void SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return null;
  return <AuthProvider><ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}><RootNavigator /><SafetyReportRetry /><StatusBar style="auto" /></ThemeProvider></AuthProvider>;
}
