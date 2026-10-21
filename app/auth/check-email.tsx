import { useRouter } from 'expo-router';
import React from 'react';
import { AuthScreen } from '@/components/layout/AuthScreen';
import { Button } from '@/components/ui';

export default function CheckEmailScreen() {
  const router = useRouter();
  return <AuthScreen testID="check-email-screen" title="Check your inbox" subtitle="If this address can be used, we've sent a link.">
    <Button testID="check-email-signin" label="Return to sign in" size="lg" onPress={() => router.replace('/auth/signin' as any)} />
  </AuthScreen>;
}
