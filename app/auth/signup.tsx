import { Redirect, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { AuthNotice, AuthPrimaryButton, AuthScreen } from '@/components/layout/AuthScreen';
import { TextField } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { buildAuthRedirectUrl } from '@/lib/auth/redirects';
import { useAuth } from '@/lib/AuthProvider';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';

export default function SignupScreen() {
  const router = useRouter();
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unavailable = !isSupabaseConfigured;
  if (session) return <Redirect href="/(tabs)/people" />;
  const submit = async () => {
    if (busy || unavailable) return;
    setError(null);
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    if (password.length < MIN_PASSWORD_LENGTH) { setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    setBusy(true);
    try {
      const redirectTo = buildAuthRedirectUrl('confirm', { platform: typeof window !== 'undefined' ? 'web' : 'native', browserOrigin: typeof window !== 'undefined' && window.location ? window.location.origin : undefined });
      const { error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo } });
      // Never distinguish an existing address from a new one in user-visible output.
      if (authError && ((authError.status ?? 0) >= 500 || /network|fetch|timeout/i.test(authError.message ?? ''))) {
        setError('Sign-up is temporarily unavailable. Try again.');
        return;
      }
      router.replace({ pathname: '/auth/check-email', params: { flow: 'confirm' } } as any);
    } catch {
      setError('Sign-up is temporarily unavailable. Try again.');
    } finally { setBusy(false); }
  };
  return <AuthScreen testID="signup-screen" title="Create account" subtitle="Use your email to get started.">
    {unavailable ? <AuthNotice testID="auth-unavailable">Sign-in is unavailable in this build</AuthNotice> : null}
    <TextField testID="signup-email" label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" required />
    <TextField testID="signup-password" label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" returnKeyType="go" onSubmitEditing={submit} required />
    {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: palette.errorText }}>{error}</Text> : null}
    <AuthPrimaryButton testID="signup-submit" label={busy ? "Creating account..." : "Create account"} disabled={unavailable || busy} loading={busy} onPress={submit} />
    <Pressable accessibilityRole="link" onPress={() => router.replace('/auth/signin' as any)} style={styles.link}><Text style={{ color: palette.link, textDecorationLine: 'underline' }}>Already have an account? Sign in</Text></Pressable>
    {/* Google and Facebook are intentionally omitted until provider configuration exists. */}
  </AuthScreen>;
}
const styles = StyleSheet.create({ link: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' } });
