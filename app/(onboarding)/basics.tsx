import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { AuthPrimaryButton, AuthScreen } from '@/components/layout/AuthScreen';
import { Button, TextField } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { ageFromBirthDate, isAdult } from '@/lib/auth/age';
import { useAuth } from '@/lib/AuthProvider';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export const UNDERAGE_MESSAGE = 'You must be at least 18 to continue.';
function mappedAgeError(error: { code?: string; message?: string }): boolean {
  return error.code === '23514' || error.code === 'P0001' || /birth.?date|18 years|under.?age|must be at least 18/i.test(error.message ?? '');
}
function initialDisplayName(user: { user_metadata?: Record<string, unknown> } | null): string {
  const candidate = String(user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '').trim();
  return candidate.length >= 2 && candidate.length <= 40 && /^[A-Za-z][A-Za-z0-9 .'_\-]{1,39}$/.test(candidate) ? candidate : 'New Member';
}

export default function OnboardingBasicsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ preview?: string }>();
  const { user, signOut } = useAuth();
  const palette = Colors[useColorScheme() ?? 'light'];
  const [birthDate, setBirthDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [underageBlocked, setUnderageBlocked] = useState(__DEV__ && params.preview === 'underage');
  const unavailable = !isSupabaseConfigured;

  const doSignOut = async () => {
    try { await signOut(); } finally { router.replace('/auth/signin' as any); }
  };
  const submit = async () => {
    if (busy || unavailable || !user) return;
    setError(null);
    const age = ageFromBirthDate(birthDate);
    if (age === null) { setError('Enter a valid date of birth in YYYY-MM-DD format.'); return; }
    if (!isAdult(birthDate)) { setUnderageBlocked(true); setError(null); return; }
    setBusy(true);
    try {
      const { data: existing, error: readError } = await supabase.from('profiles').select('id,birth_date').eq('id', user.id).maybeSingle();
      if (readError) { setError('Could not save your details. Try again.'); return; }
      if (existing) {
        // The database intentionally locks birth_date after profile creation. Do not attempt to bypass it.
        if (!isAdult(existing.birth_date)) { setUnderageBlocked(true); setError(null); return; }
        if (existing.birth_date !== birthDate) { setError('Date of birth can only be set when your profile is first created.'); return; }
      } else {
        const { error: insertError } = await supabase.from('profiles').insert({ id: user.id, display_name: initialDisplayName(user), birth_date: birthDate });
        if (insertError) {
          if (mappedAgeError(insertError)) { setUnderageBlocked(true); setError(null); }
          else setError('Could not save your details. Try again.');
          return;
        }
      }
      // verification_status and is_discoverable are intentionally omitted; database defaults/locks remain authoritative.
      router.replace('/(onboarding)/verify' as any);
    } catch {
      setError('Could not save your details. Try again.');
    } finally { setBusy(false); }
  };

  if (underageBlocked) return <AuthScreen testID="underage-block-screen" title="You can’t continue" subtitle={UNDERAGE_MESSAGE}>
    <Button testID="underage-signout" label="Sign out" size="lg" variant="charcoal" onPress={() => void doSignOut()} />
  </AuthScreen>;

  return <AuthScreen testID="onboarding-basics-screen" title="Date of birth" subtitle="Enter your date of birth to continue.">
    {unavailable ? <Text numberOfLines={1} accessibilityRole="alert" style={{ color: palette.text, fontSize: 14 }}>Sign-in is unavailable in this build</Text> : null}
    <TextField testID="birth-date-field" label="Date of birth" placeholder="YYYY-MM-DD" value={birthDate} onChangeText={setBirthDate} autoCapitalize="none" keyboardType="numbers-and-punctuation" maxLength={10} returnKeyType="go" onSubmitEditing={submit} error={error} required />
    <AuthPrimaryButton testID="birth-date-continue" label={busy ? "Saving details..." : "Continue"} disabled={unavailable || busy || !user} loading={busy} onPress={submit} />
  </AuthScreen>;
}
