import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { AuthScreen } from '@/components/layout/AuthScreen';
import { Button, TextField } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { buildAuthRedirectUrl } from '@/lib/auth/redirects';

export default function RecoveryScreen() {
  const router = useRouter();
  const palette = Colors[useColorScheme() ?? 'light'];
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unavailable = !isSupabaseConfigured;
  const submit = async () => {
    if (busy || unavailable) return;
    if (!email.trim() || !email.includes('@')) { setError('Enter a valid email address.'); return; }
    setError(null); setBusy(true);
    try {
      const redirectTo = buildAuthRedirectUrl('recovery', { platform: typeof window !== 'undefined' ? 'web' : 'native', browserOrigin: typeof window !== 'undefined' ? window.location.origin : undefined });
      // Always return the same neutral response for known, unknown, or throttled addresses.
      await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    } catch { /* Enumeration-safe response intentionally does not disclose the failure reason. */ }
    finally { setBusy(false); router.replace({ pathname: '/auth/check-email', params: { flow: 'recovery' } } as any); }
  };
  return <AuthScreen testID="recovery-screen" title="Reset password" subtitle="Request a password recovery link.">
    {unavailable ? <Text accessibilityRole="alert" style={{ color: palette.textSecondary }}>Sign-in is unavailable in this build</Text> : null}
    <TextField testID="recovery-email" label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" onSubmitEditing={submit} required />
    {error ? <Text accessibilityRole="alert" style={{ color: palette.errorText }}>{error}</Text> : null}
    <Button testID="recovery-submit" label="Send recovery link" size="lg" loading={busy} disabled={unavailable || busy} onPress={submit} />
    <Pressable accessibilityRole="link" onPress={() => router.replace('/auth/signin' as any)} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}><Text style={{ color: palette.link, textDecorationLine: 'underline' }}>Return to sign in</Text></Pressable>
  </AuthScreen>;
}
