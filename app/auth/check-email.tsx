import { useRouter } from 'expo-router';
import React from 'react';
import { AuthPrimaryButton, AuthScreen } from '@/components/layout/AuthScreen';

export default function CheckEmailScreen() {
  const router = useRouter();
  return <AuthScreen testID="check-email-screen" title="Check your inbox" subtitle="If this address can be used, we've sent a link.">
    <AuthPrimaryButton testID="check-email-signin" label="Return to sign in" onPress={() => router.replace('/auth/signin' as any)} />
  </AuthScreen>;
}
