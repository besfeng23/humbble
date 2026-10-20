import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { AuthScreen } from '@/components/layout/AuthScreen';
import { Button } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function CheckEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ flow?: string }>();
  const palette = Colors[useColorScheme() ?? 'light'];
  return <AuthScreen testID="check-email-screen" title="Check your inbox" subtitle="If this address can be used, we've sent a link.">
    <Button testID="check-email-signin" label="Return to sign in" size="lg" onPress={() => router.replace('/auth/signin' as any)} />
    <Pressable accessibilityRole="link" onPress={() => router.replace((params.flow === 'recovery' ? '/auth/recovery' : '/auth/signup') as any)} style={{ minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' }}><Text style={{ color: palette.link, textDecorationLine: 'underline' }}>Try again</Text></Pressable>
  </AuthScreen>;
}
