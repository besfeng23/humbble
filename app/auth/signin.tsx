import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { AuthPrimaryButton, AuthScreen } from '@/components/layout/AuthScreen';
import { PendingState } from '@/components/state';
import { TextField } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { Spacing } from '@/constants/Spacing';
import { useColorScheme } from '@/hooks/useColorScheme';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthProvider';

export function getSignInError(error: { code?: string; status?: number; message?: string }): string {
  if (error.code === 'email_not_confirmed') return 'Please confirm your email before signing in.';
  if (error.status === 429 || (error.status ?? 0) >= 500 || /network|fetch|timeout|rate.?limit|too many requests/i.test(error.message ?? '')) return 'Sign-in is temporarily unavailable. Try again.';
  return 'Email or password is incorrect';
}

export default function SigninScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reason?: string; reset?: string }>();
  const { authMessage, session } = useAuth();
  const palette = Colors[useColorScheme() ?? 'light'];
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
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) { setError(getSignInError(authError)); return; }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        setError('Sign-in is temporarily unavailable. Try again.');
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id,is_discoverable,verification_status')
        .eq('id', data.session.user.id)
        .maybeSingle();
      if (profileError) {
        setError('Sign-in is temporarily unavailable. Try again.');
        return;
      }
      const next = !profile
        ? '/(onboarding)/basics'
        : profile.verification_status === 'verified' && profile.is_discoverable
          ? '/(tabs)/people'
          : '/(onboarding)/verify';
      router.replace(next as any);
    } catch {
      setError('Sign-in is temporarily unavailable. Try again.');
    } finally { setBusy(false); }
  };

  return <AuthScreen testID="signin-screen" title="Sign in" subtitle="Sign in to continue.">
    {unavailable ? <Text testID="auth-unavailable" numberOfLines={1} accessibilityRole="alert" style={[styles.notice, { color: palette.text, fontSize: 14 }]}>Sign-in is unavailable in this build</Text> : null}
    {params.reason === 'reauth' || authMessage === 'Please sign in again.' ? <Text accessibilityRole="alert" style={{ color: palette.textSecondary }}>Please sign in again.</Text> : null}
    {params.reset === 'complete' ? <Text style={{ color: palette.textSecondary }}>Password updated. Sign in with your new password.</Text> : null}
    <TextField testID="signin-email" label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" required />
    <TextField testID="signin-password" label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" returnKeyType="go" onSubmitEditing={submit} required />
    {error ? <Text testID="signin-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.error, { color: palette.errorText }]}>{error}</Text> : null}
    {busy ? <PendingState compact title="Signing in..." /> : null}
    <AuthPrimaryButton testID="signin-submit" label={busy ? "Signing in..." : "Sign in"} disabled={unavailable || busy} loading={busy} onPress={submit} />
    <Pressable accessibilityRole="link" onPress={() => router.push('/auth/recovery' as any)} style={styles.link}><Text style={[styles.quietLinkText, { color: palette.textSecondary }]}>Forgot password?</Text></Pressable>
    <Pressable testID="signin-create-account" accessibilityRole="link" onPress={() => router.push('/auth/signup' as any)} style={styles.link}><Text style={[styles.linkText, { color: palette.link }]}>Create account</Text></Pressable>
    {/* Google and Facebook remain absent until provider configuration is approved. */}
  </AuthScreen>;
}
const styles = StyleSheet.create({ notice: { marginBottom: Spacing.xs }, error: { marginBottom: Spacing.xs }, link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, linkText: { textDecorationLine: 'underline' }, quietLinkText: { fontSize: 14 } });
