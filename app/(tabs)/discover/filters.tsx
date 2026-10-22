import { useRouter } from 'expo-router';
import { toFriendlyMessage } from '@/lib/friendlyErrors';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AuthGuard, ResponsiveNavHeader } from '@/components/layout';
import { Button, Card, TextField } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { Spacing } from '@/constants/Spacing';
import { Typography } from '@/constants/Typography';
import { useColorScheme } from '@/hooks/useColorScheme';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { saveDiscoveryAgePreferences } from '@/lib/discovery';

export default function DiscoveryFiltersScreen() {
  const router = useRouter();
  const palette = Colors[useColorScheme() ?? 'light'];
  const [minAge, setMinAge] = useState('18');
  const [maxAge, setMaxAge] = useState('99');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) { setLoading(false); return () => { active = false; }; }
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!active || !user) return;
      const { data } = await supabase.from('user_preferences').select('min_age,max_age').eq('user_id', user.id).maybeSingle();
      if (active && data) { setMinAge(String(data.min_age)); setMaxAge(String(data.max_age)); }
    }).catch(() => undefined).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const save = async () => {
    const min = Number(minAge), max = Number(maxAge);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 18 || max > 99 || max < min) { setError('Enter a whole-number age range between 18 and 99.'); return; }
    setBusy(true); setError(null);
    try { await saveDiscoveryAgePreferences(min, max); router.replace('/(tabs)/people' as any); }
    catch (cause) { setError(toFriendlyMessage(cause, 'Could not save preferences.')); }
    finally { setBusy(false); }
  };
  return <AuthGuard mode="protected" redirectTo="/auth/signin" testID="scr-13-guard"><View testID="scr-13-filters" style={[styles.root, { backgroundColor: palette.background }]}><ResponsiveNavHeader testID="scr-13-header" title="Discovery filters" subtitle="Choose your preferred age range." showBack fallbackHref="/(tabs)/people" /><ScrollView contentContainerStyle={styles.content}><Card testID="scr-13-card" variant="elevated"><View style={styles.form}>{loading ? <ActivityIndicator /> : null}<TextField testID="scr-13-min-age" label="Minimum age (18+)" value={minAge} onChangeText={setMinAge} keyboardType="numeric" required /><TextField testID="scr-13-max-age" label="Maximum age" value={maxAge} onChangeText={setMaxAge} keyboardType="numeric" required /><Text style={[styles.note, { color: palette.textSecondary }]}>Discovery already enforces verified, eligible profiles and excludes profiles you have passed, liked, blocked, or reported. Shared-interest and intention filters are not exposed here because the current feed RPC does not apply them.</Text>{error ? <Text accessibilityRole="alert" style={{ color: palette.danger }}>{error}</Text> : null}<Button testID="scr-13-save-btn" label={busy ? 'Saving…' : 'Save preferences'} variant="primary" size="lg" disabled={busy || loading || !isSupabaseConfigured} onPress={() => void save()} /></View></Card></ScrollView></View></AuthGuard>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, content: { padding: Spacing.xl, gap: Spacing.lg }, form: { gap: Spacing.lg }, note: { ...Typography.bodySmall, lineHeight: 20 } });
