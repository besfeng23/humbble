import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SettingsLayout } from '@/components/layout';
import { Colors } from '@/constants/Colors';
import { Spacing, TouchTargets } from '@/constants/Spacing';
import { Typography } from '@/constants/Typography';
import { useColorScheme } from '@/hooks/useColorScheme';
import {
  blockPerson,
  MAX_REPORT_NOTE_LENGTH,
  REPORT_CATEGORIES,
  submitSafetyReport,
  unmatchPerson,
  type SafetyReportCategory,
} from '@/lib/safety';


type Step = 'menu' | 'report' | 'report-note' | 'block' | 'unmatch' | 'done';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

function Row({ testID, icon, label, onPress, palette }: { testID: string; icon?: IconName; label: string; onPress: () => void; palette: (typeof Colors)['light'] }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.surfaceMuted }]}>
      {icon ? <Ionicons name={icon} size={20} color={palette.text} /> : null}
      <Text style={[styles.rowLabel, { color: palette.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
    </Pressable>
  );
}

export default function SafetyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ targetId?: string; targetName?: string; source?: string; matched?: string; step?: string }>();
  const targetId = String(params.targetId ?? '');
  const targetName = String(params.targetName ?? 'this person');
  const source = String(params.source ?? 'safety');
  const matched = params.matched === '1';
  const palette = Colors[useColorScheme() ?? 'light'];
  const initialStep = (['report', 'block', 'unmatch'] as string[]).includes(String(params.step)) ? (params.step as Step) : 'menu';
  const [step, setStep] = useState<Step>(initialStep === 'unmatch' && !matched ? 'menu' : initialStep);
  const [category, setCategory] = useState<SafetyReportCategory | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const run = async (task: () => Promise<string>) => {
    if (!targetId || busy) return;
    setBusy(true); setError('');
    try { setMessage(await task()); setStep('done'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'That did not work. Try again.'); }
    finally { setBusy(false); }
  };

  const confirmBlock = () => run(async () => { await blockPerson(targetId); return `${targetName} is blocked.`; });
  const confirmUnmatch = () => run(async () => (await unmatchPerson(targetId)) ? `You unmatched ${targetName}.` : 'No active match.');
  const sendReport = () => run(async () => {
    if (!category) throw new Error('Choose a reason.');
    const result = await submitSafetyReport({ reportedUserId: targetId, category, contextSummary: note });
    return result.status === 'submitted' ? 'Report sent.' : 'Saved. It will send when you’re back online.';
  });

  const back = () => { setError(''); setStep(step === 'report-note' ? 'report' : 'menu'); };
  const done = () => {
    if (source === 'chat' || source === 'conversation-list') router.replace('/(tabs)/(chats)' as any);
    else router.replace('/(tabs)/discover' as any);
  };

  const confirm = (testID: string, label: string, onPress: () => void) => (
    <View style={styles.confirmRow}>
      <Pressable testID="safety-cancel-btn" accessibilityRole="button" onPress={back} disabled={busy} style={styles.textButton}>
        <Text style={[styles.textButtonLabel, { color: palette.textSecondary }]}>Cancel</Text>
      </Pressable>
      <Pressable testID={testID} accessibilityRole="button" onPress={onPress} disabled={busy} style={[styles.textButton, styles.outline, { borderColor: palette.dangerSolid }]}>
        {busy ? <ActivityIndicator color={palette.dangerSolid} /> : <Text style={[styles.textButtonLabel, { color: palette.dangerSolid }]}>{label}</Text>}
      </Pressable>
    </View>
  );

  return (
    <SettingsLayout fadeEdge testID="scr-22-report-modal" title={targetId ? targetName : 'Safety'} fallbackHref={source === 'chat' ? '/(tabs)/(chats)' : '/(tabs)/discover'} activeNavId="settings-report">
      {step === 'menu' ? (
        <View testID="safety-menu" style={styles.list}>
          <Row testID="safety-block-btn" icon="ban-outline" label="Block" palette={palette} onPress={() => setStep('block')} />
          <Row testID="safety-report-btn" icon="flag-outline" label="Report" palette={palette} onPress={() => setStep('report')} />
          {matched ? <Row testID="safety-unmatch-btn" icon="heart-dislike-outline" label="Unmatch" palette={palette} onPress={() => setStep('unmatch')} /> : null}
        </View>
      ) : null}

      {step === 'report' ? (
        <View testID="safety-report-category-group" accessibilityRole="radiogroup" style={styles.list}>
          {REPORT_CATEGORIES.map(item => (
            <Row key={item.id} testID={`safety-report-category-${item.id}`} label={item.label} palette={palette} onPress={() => { setCategory(item.id); setStep('report-note'); }} />
          ))}
        </View>
      ) : null}

      {step === 'report-note' ? (
        <View testID="safety-report-note-step" style={styles.step}>
          <Text style={[styles.title, { color: palette.text }]}>{REPORT_CATEGORIES.find(item => item.id === category)?.label}</Text>
          <TextInput testID="safety-report-note" placeholder="Add a note (optional)" placeholderTextColor={palette.textSecondary} value={note} maxLength={MAX_REPORT_NOTE_LENGTH} onChangeText={setNote} multiline style={[styles.input, { color: palette.text, borderColor: palette.border }]} />
          {confirm('safety-report-submit-btn', 'Send report', () => void sendReport())}
        </View>
      ) : null}

      {step === 'block' || step === 'unmatch' ? (
        <View testID="safety-confirm-action" style={styles.step}>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>{step === 'block' ? `Block ${targetName}?` : `Unmatch ${targetName}?`}</Text>
          <Text style={[styles.detail, { color: palette.textSecondary }]}>{step === 'block' ? 'You won’t see each other again.' : 'Your chat will end.'}</Text>
          {confirm('safety-confirm-btn', step === 'block' ? 'Block' : 'Unmatch', () => void (step === 'block' ? confirmBlock() : confirmUnmatch()))}
        </View>
      ) : null}

      {step === 'done' ? (
        <View style={styles.step}>
          <Text accessibilityRole="alert" testID="safety-status-message" style={[styles.title, { color: palette.text }]}>{message}</Text>
          <Pressable testID="safety-done-btn" accessibilityRole="button" onPress={done} style={styles.textButton}>
            <Text style={[styles.textButtonLabel, { color: palette.text }]}>Done</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text accessibilityRole="alert" testID="safety-error-message" style={[styles.detail, { color: palette.errorText }]}>{error}</Text> : null}

      {step === 'menu' ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/(public)/legal/complaints-handling' as any)} style={styles.help}>
          <Text style={[styles.detail, { color: palette.textSecondary }]}>Safety Help & Appeals (draft)</Text>
        </Pressable>
      ) : null}
    </SettingsLayout>
  );
}

const styles = StyleSheet.create({
  list: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: TouchTargets.comfortable, paddingHorizontal: Spacing.sm, borderRadius: 12 },
  rowLabel: { ...Typography.body, flex: 1 },
  step: { gap: Spacing.md, paddingHorizontal: Spacing.sm },
  title: { ...Typography.bodySemiBold },
  detail: { ...Typography.bodySmall, lineHeight: 20 },
  input: { minHeight: 88, borderWidth: 1, borderRadius: 12, padding: Spacing.md, textAlignVertical: 'top', ...Typography.body },
  confirmRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
  textButton: { minHeight: TouchTargets.minimum, paddingHorizontal: Spacing.lg, justifyContent: 'center', alignItems: 'center', borderRadius: 22 },
  outline: { borderWidth: 1 },
  textButtonLabel: { ...Typography.bodySemiBold },
  help: { paddingHorizontal: Spacing.sm, paddingTop: Spacing.lg },
});
