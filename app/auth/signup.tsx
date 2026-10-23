import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthNotice, AuthPrimaryButton, AuthScreen } from '@/components/layout/AuthScreen';
import { TextField } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { buildAuthRedirectUrl } from '@/lib/auth/redirects';
import { useAuth } from '@/lib/AuthProvider';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import { captureAttribution, loadAttribution } from '@/lib/attribution';
import { buildQuizMetadata, loadQuiz } from '@/lib/quiz';

export const TERMS_VERSION = '2026-10';

function ConsentCheckbox({ testID, checked, onToggle, children }: { testID: string; checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return <Pressable testID={testID} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={styles.checkRow}>
    <View style={[styles.box, { borderColor: palette.text, backgroundColor: checked ? palette.text : 'transparent' }]}>{checked ? <Text style={{ color: palette.background, fontWeight: '700' }}>✓</Text> : null}</View>
    <Text style={[styles.checkLabel, { color: palette.text }]}>{children}</Text>
  </Pressable>;
}

export default function SignupScreen() {
  const router = useRouter();
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Both consents start UNTICKED. Terms+privacy is required; marketing is optional.
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const params = useLocalSearchParams();
  useEffect(() => { void captureAttribution(params as Record<string, unknown>, '/auth/signup'); },
  // Capture once per visit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);
  const unavailable = !isSupabaseConfigured;
  if (session) return <Redirect href="/(tabs)/people" />;
  const submit = async () => {
    if (busy || unavailable) return;
    setError(null);
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    if (password.length < MIN_PASSWORD_LENGTH) { setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if (!acceptTerms) { setError('Please agree to the Terms and Privacy Policy to continue.'); return; }
    setBusy(true);
    try {
      const redirectTo = buildAuthRedirectUrl('confirm', { platform: typeof window !== 'undefined' ? 'web' : 'native', browserOrigin: typeof window !== 'undefined' && window.location ? window.location.origin : undefined });
      const attribution = await loadAttribution();
      // Consent + attribution ride in signUp metadata; a server trigger stores them with
      // server timestamps and binds attribution to the account exactly once.
      const data: Record<string, unknown> = { consent: { terms_privacy: true, terms_version: TERMS_VERSION, marketing: marketingOptIn } };
      if (attribution) data.attribution = attribution;
      // Prelander quiz answers (fixed option values only) ride along in metadata; no extra table.
      const quiz = buildQuizMetadata(params as Record<string, unknown>, await loadQuiz());
      if (quiz) data.quiz = quiz;
      const { error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo, data } });
      // Never distinguish an existing address from a new one in user-visible output.
      if (authError && ((authError.status ?? 0) >= 500 || /network|fetch|timeout/i.test(authError.message ?? ''))) {
        setError('Sign-up is temporarily unavailable. Try again.');
        return;
      }
      router.replace({ pathname: '/auth/check-email', params: { flow: 'confirm', email: email.trim() } } as any);
    } catch {
      setError('Sign-up is temporarily unavailable. Try again.');
    } finally { setBusy(false); }
  };
  return <AuthScreen testID="signup-screen" title="Create account" subtitle="Use your email to get started.">
    {unavailable ? <AuthNotice testID="auth-unavailable">Sign-in is unavailable in this build</AuthNotice> : null}
    <TextField testID="signup-email" label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" required />
    <TextField testID="signup-password" label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" returnKeyType="go" onSubmitEditing={submit} required />
    <ConsentCheckbox testID="signup-consent-terms" checked={acceptTerms} onToggle={() => setAcceptTerms((v) => !v)}>
      I am 18 or older and agree to the <Text accessibilityRole="link" style={{ color: palette.link, textDecorationLine: 'underline' }} onPress={() => router.push('/(public)/legal/terms-of-service' as any)}>Terms</Text> and <Text accessibilityRole="link" style={{ color: palette.link, textDecorationLine: 'underline' }} onPress={() => router.push('/(public)/legal/privacy-notice' as any)}>Privacy Policy</Text> (required)
    </ConsentCheckbox>
    <ConsentCheckbox testID="signup-consent-marketing" checked={marketingOptIn} onToggle={() => setMarketingOptIn((v) => !v)}>
      Send me occasional tips and product news by email (optional)
    </ConsentCheckbox>
    {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: palette.errorText }}>{error}</Text> : null}
    <AuthPrimaryButton testID="signup-submit" label={busy ? "Creating account..." : "Create account"} disabled={unavailable || busy} loading={busy} onPress={submit} />
    <Pressable accessibilityRole="link" onPress={() => router.replace('/auth/signin' as any)} style={styles.link}><Text style={{ color: palette.link, textDecorationLine: 'underline' }}>Already have an account? Sign in</Text></Pressable>
    {/* Google and Facebook are intentionally omitted until provider configuration exists. */}
  </AuthScreen>;
}
const styles = StyleSheet.create({ checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 44, paddingVertical: 4 }, box: { width: 24, height: 24, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 1 }, checkLabel: { flex: 1, fontSize: 15, lineHeight: 22 }, link: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' } });
