import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { foregroundBehavior, type PushData } from '@/lib/notificationFocus';
import 'react-native-reanimated';
import { SafetyReportRetry } from '@/components/safety/SafetyReportRetry';
import { PendingState } from '@/components/state';
import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '@/lib/AuthProvider';

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  // Suppress the foreground banner when the user is already viewing that chat or match.
  handleNotification: async (notification) => foregroundBehavior(notification.request.content.data as PushData),
});

function RootNavigator() {
  const { loading } = useAuth();
  const router = useRouter();
  const lastResponseId = useRef<string | null>(null);
  useEffect(() => {
    const openResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (lastResponseId.current === id) return;
      lastResponseId.current = id;
      const data = response.notification.request.content.data as { type?: string; matchId?: string; conversationId?: string };
      if (data.type === 'match' && data.matchId) router.push({ pathname: '/(tabs)/(chats)/match', params: { matchId: data.matchId } } as any);
      else if (data.type === 'message' && data.conversationId) router.push(`/(tabs)/(chats)/${data.conversationId}` as any);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(openResponse);
    void Notifications.getLastNotificationResponseAsync().then(openResponse).catch(() => undefined);
    return () => subscription.remove();
  }, [router]);

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
