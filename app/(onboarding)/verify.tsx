import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { AuthNotice, AuthPrimaryButton, AuthScreen } from '@/components/layout/AuthScreen';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/AuthProvider';
import { requestVerification, selectVerificationAdapter, type VerificationState } from '@/lib/onboarding/profile';

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
  const [notice, setNotice] = useState(() => previewAllowed ? statusCopy[state] : 'Verification not available yet.');

  const checkStatus = async () => {
    if (busy || (!user?.id && !previewAllowed)) return;
    setBusy(true);
    const result = await requestVerification(adapter, user?.id ?? 'development-preview', !__DEV__, state === 'not_started' ? 'pending' : state);
    setState(result.state);
    setNotice(result.reason ?? statusCopy[result.state]);
    setBusy(false);
  };
  const doSignOut = async () => { try { await signOut(); } finally { router.replace('/auth/signin' as any); } };

  return <AuthScreen testID="verification-unavailable-screen" title="Verification" subtitle="A later step, when an approved provider is available.">
    {!previewAllowed ? <AuthNotice testID="verification-unavailable">Verification not available yet.</AuthNotice> : null}
    <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
      <Text testID="verification-state" accessibilityRole="text">Status: {state.replace('_', ' ')}</Text>
      {notice !== 'Verification not available yet.' ? <Text testID="verification-state-detail">{notice}</Text> : null}
    </View>
    <AuthPrimaryButton testID="verification-check-status" label={busy ? 'Checking…' : 'Check status'} loading={busy} disabled={busy} onPress={() => void checkStatus()} />
    <AuthPrimaryButton testID="verification-back-profile" label="Review my profile" onPress={() => router.replace('/(onboarding)/photos-prompts' as any)} />
    <Button testID="verification-signout" label="Sign out" size="lg" variant="charcoal" onPress={() => { void doSignOut(); }} />
  </AuthScreen>;
}
