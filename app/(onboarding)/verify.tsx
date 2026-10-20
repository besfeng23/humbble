import { useRouter } from 'expo-router';
import React from 'react';
import { AuthScreen } from '@/components/layout/AuthScreen';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/AuthProvider';

export default function OnboardingVerifyScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  return <AuthScreen testID="verification-unavailable-screen" title="Verification" subtitle="Verification not available yet.">
    <Button testID="verification-signout" label="Sign out" size="lg" variant="charcoal" onPress={() => { void signOut().finally(() => router.replace('/auth/signin' as any)); }} />
  </AuthScreen>;
}
