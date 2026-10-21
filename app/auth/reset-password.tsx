import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { AuthPrimaryButton, AuthScreen } from '@/components/layout/AuthScreen';
import { TextField } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/lib/AuthProvider';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { MIN_PASSWORD_LENGTH, validatePasswordPair } from '@/lib/auth/password';

// Keep this length aligned with the development project's Supabase Auth policy.
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const palette = Colors[useColorScheme() ?? 'light'];
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unavailable = !isSupabaseConfigured;
  const submit = async () => {
    if (busy || unavailable) return;
    setError(null);
    const validation = validatePasswordPair(password, confirmation);
    if (validation === 'too_short') { setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if (validation === 'mismatch') { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError('Could not update your password. Request a new recovery link and try again.'); return; }
      try { await signOut(); } catch { /* Password update succeeded; sign-in is still a safe next step. */ }
      router.replace('/auth/signin?reset=complete' as any);
    } catch {
      setError('Could not update your password. Request a new recovery link and try again.');
    } finally { setBusy(false); }
  };
  return <AuthScreen testID="reset-password-screen" title="Choose a new password" subtitle="Use at least 8 characters.">
    {unavailable ? <Text numberOfLines={1} accessibilityRole="alert" style={{ color: palette.text, fontSize: 14 }}>Sign-in is unavailable in this build</Text> : null}
    <TextField testID="reset-password" label="New password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" autoComplete="new-password" required />
    <TextField testID="reset-password-confirm" label="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry textContentType="newPassword" autoComplete="new-password" returnKeyType="go" onSubmitEditing={submit} required />
    {error ? <Text testID="reset-password-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: palette.errorText }}>{error}</Text> : null}
    <AuthPrimaryButton testID="reset-password-submit" label={busy ? "Updating password..." : "Update password"} loading={busy} disabled={unavailable || busy} onPress={submit} />
  </AuthScreen>;
}
