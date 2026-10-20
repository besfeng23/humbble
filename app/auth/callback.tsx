import { useLocalSearchParams, useRouter } from 'expo-router';
import { useURL } from 'expo-linking';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { AuthScreen } from '@/components/layout/AuthScreen';
import { Button } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { PendingState } from '@/components/state';
import { validateNextPath, isAllowedAuthRedirectUrl, buildAuthRedirectUrl, DEFAULT_AUTH_NEXT, AUTH_RESET_NEXT } from '@/lib/auth/redirects';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const palette = Colors[useColorScheme() ?? 'light'];
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const linkUrl = useURL();
  const started = useRef(false);
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState(false);
  const [email, setEmail] = useState('');
  const [flow, setFlow] = useState<'confirm' | 'recovery'>('confirm');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fromParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => fromParams.set(key, Array.isArray(value) ? value[0] : value));
    let query = fromParams;
    let fragment = new URLSearchParams();
    let routeUrl = linkUrl ?? (typeof window === 'undefined' ? 'humbble://auth/callback' : '');
    if (typeof window !== 'undefined') {
      routeUrl = window.location.href;
      query = new URLSearchParams(window.location.search);
      fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      // PKCE codes, token hashes, and auth parameters must not remain in browser history.
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (linkUrl) {
      try { fragment = new URL(linkUrl).hash ? new URLSearchParams(new URL(linkUrl).hash.slice(1)) : fragment; } catch { /* Invalid links fail the allowlist check below. */ }
    }
    const getParam = (key: string) => query.get(key) ?? fragment.get(key) ?? fromParams.get(key) ?? undefined;
    const code = getParam('code');
    const tokenHash = getParam('token_hash');
    const type = getParam('type');
    const next = validateNextPath(getParam('next'));
    const receivedEmail = getParam('email')?.trim() ?? '';
    setEmail(receivedEmail);
    setFlow(type === 'recovery' || next === AUTH_RESET_NEXT ? 'recovery' : 'confirm');

    const fail = () => { setFailure(true); setBusy(false); };
    if (__DEV__ && getParam('preview') === 'fail') { fail(); return; }
    if (!isSupabaseConfigured || !routeUrl || !isAllowedAuthRedirectUrl(routeUrl)) { fail(); return; }

    void (async () => {
      try {
        let success = false;
        if (code) {
          // Web auto-detection may already have exchanged the PKCE code during client initialization.
          const { data: current, error: sessionError } = await supabase.auth.getSession();
          if (!sessionError && current.session) success = true;
          else {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            success = !error;
          }
        } else if (tokenHash && ['signup', 'email', 'recovery', 'magiclink', 'invite', 'email_change'].includes(type ?? '')) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any });
          success = !error;
        }
        if (!success) { fail(); return; }
        const isRecovery = type === 'recovery' || next === AUTH_RESET_NEXT;
        router.replace((isRecovery ? AUTH_RESET_NEXT : (next ?? DEFAULT_AUTH_NEXT)) as any);
      } catch {
        fail();
      }
    })();
  }, [linkUrl, params, router]);

  const sendNewLink = async () => {
    if (!isSupabaseConfigured || !email) { router.replace((flow === 'recovery' ? '/auth/recovery' : '/auth/signup') as any); return; }
    setBusy(true);
    try {
      const redirectTo = buildAuthRedirectUrl(flow, { platform: typeof window !== 'undefined' ? 'web' : 'native', browserOrigin: typeof window !== 'undefined' ? window.location.origin : undefined });
      if (flow === 'recovery') await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      else await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } });
    } catch { /* Keep retry response neutral. */ }
    router.replace({ pathname: '/auth/check-email', params: { flow } } as any);
  };

  if (failure) return <AuthScreen testID="callback-failure" title="This link can’t be used" subtitle="It may have expired. Request a new link to continue."><Button testID="callback-resend" label="Send a new link" size="lg" loading={busy} onPress={() => void sendNewLink()} /><Pressable accessibilityRole="link" onPress={() => router.replace('/auth/signin' as any)} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}><Text style={{ color: palette.link, textDecorationLine: 'underline' }}>Return to sign in</Text></Pressable></AuthScreen>;
  return <PendingState fullScreen title="Checking your link" message="Please wait while we verify it." testID="callback-pending" />;
}
