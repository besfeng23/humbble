import { useRouter } from 'expo-router';
import React from 'react';
import { AuthNotice, AuthScreen } from '@/components/layout/AuthScreen';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/AuthProvider';

export default function OnboardingVerifyScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  return <AuthScreen testID="verification-unavailable-screen" title="Verification">
    <AuthNotice testID="verification-unavailable">Verification not available yet.</AuthNotice>
    <Button testID="verification-signout" label="Sign out" size="lg" variant="charcoal" onPress={() => { void signOut().finally(() => router.replace('/auth/signin' as any)); }} />
  </AuthScreen>;
}
