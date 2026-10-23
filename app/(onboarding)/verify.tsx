import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { AuthNotice, AuthPrimaryButton, AuthScreen } from '@/components/layout/AuthScreen';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/AuthProvider';
import { isVerificationProviderConfigured, requestVerification, selectVerificationAdapter, VERIFICATION_COMING_SOON, type VerificationState } from '@/lib/onboarding/profile';

const statusCopy: Record<VerificationState, string> = {
  not_started: 'Verification has not started.', pending: 'Verification is pending. Retry later or request review.',
  verified: 'Verified by an authorized provider.', failed: 'Verification could not be completed. You may retry later.',
  requires_review: 'Verification needs review. No selfie or biometric data is collected by this screen.',
};

export default function OnboardingVerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ preview?: string }>();
  const { signOut, user } = useAuth();
  const preview = __DEV__ ? String(params.preview ?? '') : '';
  const previewAllowed = ['verify', 'pending', 'failed', 'review'].includes(preview);
  const requestedResult: VerificationState = preview === 'failed' ? 'failed' : preview === 'review' || preview === 'verify' ? 'requires_review' : 'pending';
  const adapter = useMemo(() => selectVerificationAdapter(!__DEV__, requestedResult), [requestedResult]);
  const [state, setState] = useState<VerificationState>(preview === 'pending' ? 'pending' : preview === 'failed' ? 'failed' : preview === 'review' || preview === 'verify' ? 'requires_review' : 'not_started');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(() => statusCopy[state]);

  // Verification is optional: it never blocks completing onboarding or using discovery.
  const goToDiscovery = () => router.replace('/(tabs)/people' as any);
  const doSignOut = async () => { try { await signOut(); } finally { router.replace('/auth/signin' as any); } };
  const providerReady = isVerificationProviderConfigured();
  if (!previewAllowed && !providerReady) {
    return <AuthScreen testID="verification-coming-soon-screen" title="Get a Verified badge" subtitle="Optional, coming soon.">
      <AuthNotice testID="verification-coming-soon">{VERIFICATION_COMING_SOON.title}</AuthNotice>
      <Text testID="verification-coming-soon-detail" accessibilityRole="text">{VERIFICATION_COMING_SOON.message}</Text>
      <AuthPrimaryButton testID="verification-skip" label="Skip for now" onPress={goToDiscovery} />
      <Button testID="verification-back-profile" label="Review my profile" size="lg" variant="secondary" onPress={() => router.replace('/(onboarding)/photos-prompts' as any)} />
      <Button testID="verification-signout" label="Sign out" size="lg" variant="charcoal" onPress={() => { void doSignOut(); }} />
    </AuthScreen>;
  }

  const checkStatus = async () => {
    if (busy || (!user?.id && !previewAllowed)) return;
    setBusy(true);
    const result = await requestVerification(adapter, user?.id ?? 'development-preview', !__DEV__, state === 'not_started' ? 'pending' : state);
    setState(result.state);
    setNotice(result.reason ?? statusCopy[result.state]);
    setBusy(false);
  };

  return <AuthScreen testID="verification-unavailable-screen" title="Get a Verified badge" subtitle="Optional. Confirm it's really you.">
    <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
      <Text testID="verification-state" accessibilityRole="text">Status: {state.replace('_', ' ')}</Text>
      <Text testID="verification-state-detail">{notice}</Text>
    </View>
    <AuthPrimaryButton testID="verification-check-status" label={busy ? 'Checking…' : 'Check status'} loading={busy} disabled={busy} onPress={() => void checkStatus()} />
    <AuthPrimaryButton testID="verification-skip" label="Skip for now" onPress={goToDiscovery} />
    <Button testID="verification-back-profile" label="Review my profile" size="lg" variant="secondary" onPress={() => router.replace('/(onboarding)/photos-prompts' as any)} />
    <Button testID="verification-signout" label="Sign out" size="lg" variant="charcoal" onPress={() => { void doSignOut(); }} />
  </AuthScreen>;
}
