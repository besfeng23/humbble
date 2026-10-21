import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthNotice } from '@/components/layout/AuthScreen';
import { OnboardingLayout } from '@/components/layout';
import { Button } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { Radii } from '@/constants/Radii';
import { Spacing, TouchTargets } from '@/constants/Spacing';
import { Typography } from '@/constants/Typography';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/lib/AuthProvider';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const INTENTIONS = [
  { id: 'serious_relationship', label: 'Serious relationship' },
  { id: 'long_term_dating', label: 'Long-term dating' },
  { id: 'cultural_connection_and_dating', label: 'Cultural connection & dating' },
] as const;
const INTEREST_TAGS = ['Coffee & Cafes', 'Culinary Arts', 'Live Music', 'Weekend Roadtrips', 'Book Clubs', 'Fitness & Running'] as const;

export default function OnboardingIntentionsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const palette = Colors[useColorScheme() ?? 'light'];
  const [selectedIntention, setSelectedIntention] = useState<string>('serious_relationship');
  const [selectedTags, setSelectedTags] = useState<string[]>(['Coffee & Cafes', 'Culinary Arts', 'Live Music']);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured) { setLoaded(true); return; }
    let active = true;
    void supabase.from('profiles').select('relationship_intention,shared_interests').eq('id', user.id).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (error) setNotice('Could not load saved preferences. You can try again.');
      if (data) {
        setSelectedIntention(data.relationship_intention);
        setSelectedTags(data.shared_interests ?? []);
      }
      setLoaded(true);
    });
    return () => { active = false; };
  }, [user?.id]);

  const toggleTag = (tag: string) => setSelectedTags((prev) => prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]);
  const handleContinue = async () => {
    if (!loaded || loading || !user?.id || !isSupabaseConfigured) { setNotice('Saving preferences is unavailable in this build.'); return; }
    if (!INTENTIONS.some((item) => item.id === selectedIntention) || selectedTags.length < 3) { setNotice('Select a relationship intention and at least three interests.'); return; }
    setLoading(true); setNotice('');
    const { error } = await supabase.from('profiles').update({ relationship_intention: selectedIntention as (typeof INTENTIONS)[number]['id'], shared_interests: selectedTags }).eq('id', user.id);
    setLoading(false);
    if (error) { setNotice('Could not save your preferences. Please retry.'); return; }
    router.push('/(onboarding)/photos-prompts' as any);
  };

  return <OnboardingLayout testID="scr-08-onboarding-intentions" step={2} totalSteps={4} title="Onboarding: Intentions" subtitle="Choose what matters to you and what you enjoy." fallbackHref="/(onboarding)/basics">
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.heading, { color: palette.text }]}>Relationship intention</Text>
      <View style={styles.wrap}>{INTENTIONS.map((item) => {
        const selected = selectedIntention === item.id;
        return <Pressable key={item.id} testID={`scr-08-intention-${item.id}`} onPress={() => setSelectedIntention(item.id)} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected }} style={[styles.chip, { backgroundColor: selected ? palette.primary : palette.surfaceMuted, borderColor: selected ? palette.primaryPressed : palette.border }]}>
          <Text style={{ color: selected ? palette.onPrimary : palette.text, fontWeight: selected ? '700' : '500' }}>{item.label}</Text>
        </Pressable>;
      })}</View>
      <Text accessibilityRole="header" style={[styles.heading, { color: palette.text }]}>Shared interests (choose at least 3)</Text>
      <View style={styles.wrap}>{INTEREST_TAGS.map((tag) => {
        const selected = selectedTags.includes(tag);
        return <Pressable key={tag} testID={`scr-08-tag-${tag}`} onPress={() => toggleTag(tag)} accessibilityRole="button" accessibilityLabel={tag} accessibilityState={{ selected }} style={[styles.chip, { backgroundColor: selected ? palette.primary : palette.surfaceMuted, borderColor: selected ? palette.primaryPressed : palette.border }]}>
          <Text style={{ color: selected ? palette.onPrimary : palette.text, fontWeight: selected ? '700' : '500' }}>{tag}</Text>
        </Pressable>;
      })}</View>
      {notice ? <AuthNotice testID="intentions-notice">{notice}</AuthNotice> : null}
      <Button testID="scr-08-continue-btn" label={loading ? 'Saving…' : 'Save & Continue to Photos'} variant="primary" size="lg" disabled={loading || !loaded} onPress={() => void handleContinue()} />
      <Button testID="scr-08-back-btn" label="Back to Basics" variant="secondary" onPress={() => router.replace('/(onboarding)/basics' as any)} />
    </View>
  </OnboardingLayout>;
}

const styles = StyleSheet.create({
  section: { gap: Spacing.lg }, heading: { ...Typography.h3 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { minHeight: TouchTargets.comfortable, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radii.pill, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
});
