import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { AuthNotice, AuthPrimaryButton, AuthScreen } from '@/components/layout/AuthScreen';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { buildAuthRedirectUrl } from '@/lib/auth/redirects';
import { MAX_RESENDS_PER_SESSION, mailAppUrl, secondsUntilResend } from '@/lib/auth/resend';

export default function CheckEmailScreen() {
  const router = useRouter();
  const palette = Colors[useColorScheme() ?? 'light'];
  const { flow, email: rawEmail } = useLocalSearchParams<{ flow?: string; email?: string }>();
  const email = typeof rawEmail === 'string' && rawEmail.includes('@') ? rawEmail : null;
  const isConfirm = flow === 'confirm';
  const [lastSentAt, setLastSentAt] = useState<number | null>(isConfirm ? Date.now() : null);
  const [sends, setSends] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    timer.current = setInterval(() => setNow(Date.now()), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);
  const wait = secondsUntilResend(lastSentAt, now);
  const exhausted = sends >= MAX_RESENDS_PER_SESSION;
  const canResend = isConfirm && !!email && isSupabaseConfigured && !busy && wait === 0 && !exhausted;

  const resend = async () => {
    if (!canResend || !email) return;
    setBusy(true); setNotice(null);
    try {
      const redirectTo = buildAuthRedirectUrl('confirm', { platform: typeof window !== 'undefined' ? 'web' : 'native', browserOrigin: typeof window !== 'undefined' && window.location ? window.location.origin : undefined });
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } });
      // Never reveal whether the address exists; only surface rate limiting / outages generically.
      setNotice(error && (error.status === 429 || /rate|too many/i.test(error.message ?? '')) ? 'Please wait a little before requesting another email.' : error && (error.status ?? 0) >= 500 ? 'Could not resend right now. Try again shortly.' : 'If this address can be used, we sent a new link.');
    } catch {
      setNotice('Could not resend right now. Try again shortly.');
    } finally {
      setSends((n) => n + 1); setLastSentAt(Date.now()); setBusy(false);
    }
  };

  const resendLabel = exhausted ? 'Resend limit reached' : wait > 0 ? `Resend email in ${wait}s` : busy ? 'Sending...' : 'Resend confirmation email';
  return <AuthScreen testID="check-email-screen" title="Check your inbox" subtitle={email ? `If ${email} can be used, we've sent a confirmation link. It can take a minute; check spam too.` : "If this address can be used, we've sent a link."}>
    <AuthPrimaryButton testID="check-email-open-mail" label="Open mail app" onPress={() => { void Linking.openURL(mailAppUrl(email)).catch(() => undefined); }} />
    {isConfirm && email ? <Pressable testID="check-email-resend" accessibilityRole="button" accessibilityState={{ disabled: !canResend }} disabled={!canResend} onPress={resend} style={styles.link}>
      <Text style={{ color: canResend ? palette.link : palette.textSecondary, textDecorationLine: canResend ? 'underline' : 'none' }}>{resendLabel}</Text>
    </Pressable> : null}
    {notice ? <AuthNotice testID="check-email-notice">{notice}</AuthNotice> : null}
    {isConfirm ? <Pressable testID="check-email-change" accessibilityRole="link" onPress={() => router.replace('/auth/signup' as any)} style={styles.link}>
      <Text style={{ color: palette.link, textDecorationLine: 'underline' }}>Wrong email? Change it</Text>
    </Pressable> : null}
    <Pressable testID="check-email-signin" accessibilityRole="link" onPress={() => router.replace('/auth/signin' as any)} style={styles.link}>
      <Text style={{ color: palette.link, textDecorationLine: 'underline' }}>Return to sign in</Text>
    </Pressable>
  </AuthScreen>;
}
const styles = StyleSheet.create({ link: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' } });
