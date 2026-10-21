import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SettingsLayout, navigateBackOrFallback } from '@/components/layout';
import { Button, Card, TextField } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { Spacing, TouchTargets } from '@/constants/Spacing';
import { Typography } from '@/constants/Typography';
import { useColorScheme } from '@/hooks/useColorScheme';
import {
  getQueuedSafetyReportCount,
  retryQueuedSafetyReports,
  submitSafetyReport,
  blockPerson,
  unmatchPerson,
  MAX_REPORT_NOTE_LENGTH,
  type SafetyReportCategory,
} from '@/lib/safety';

const REPORT_CATEGORIES: { id: SafetyReportCategory; label: string }[] = [
  { id: 'fake_profile', label: 'Fake profile' },
  { id: 'scam_money_request', label: 'Scam or money request' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'underage', label: 'Underage concern' },
  { id: 'explicit_content', label: 'Explicit content' },
  { id: 'other', label: 'Other' },
];

type PendingAction = 'block' | 'unmatch' | null;

export default function BlockAndReportModalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ targetId?: string; targetName?: string; source?: string; help?: string }>();
  const targetId = String(params.targetId ?? '');
  const targetName = String(params.targetName ?? 'this person');
  const source = String(params.source ?? 'safety');
  const palette = Colors[useColorScheme() ?? 'light'];
  const [selectedCategory, setSelectedCategory] = useState<SafetyReportCategory>('scam_money_request');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [queuedReports, setQueuedReports] = useState(0);

  const refreshQueue = useCallback(async () => {
    try { setQueuedReports(await getQueuedSafetyReportCount()); } catch { /* Keep existing count visible if local storage is temporarily unavailable. */ }
  }, []);

  const retryQueued = useCallback(async () => {
    try {
      const result = await retryQueuedSafetyReports();
      await refreshQueue();
      setStatusMessage(result.remaining
        ? `${result.remaining} report${result.remaining === 1 ? '' : 's'} still waiting for a connection. Retry again when online.`
        : result.sent ? `Saved report${result.sent === 1 ? '' : 's'} sent securely.` : 'No reports are waiting to retry.');
    } catch {
      setErrorMessage('Pending reports could not be retried. They remain saved on this device.');
    }
  }, [refreshQueue]);

  useEffect(() => {
    void refreshQueue();
    void retryQueuedSafetyReports().then(refreshQueue).catch(() => undefined);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') void retryQueuedSafetyReports().then(refreshQueue).catch(() => undefined);
    });
    return () => listener.remove();
  }, [refreshQueue]);

  const submitReport = async () => {
    if (!targetId || submitting) return;
    setSubmitting(true); setErrorMessage(''); setStatusMessage('');
    try {
      const result = await submitSafetyReport({ reportedUserId: targetId, category: selectedCategory, contextSummary: details });
      await refreshQueue();
      setStatusMessage(result.status === 'submitted'
        ? 'Report submitted. Thank you for helping keep Humbble safe. Reports are private to Trust & Safety.'
        : 'Connection unavailable. Your report is saved on this device and will retry when the connection returns. You can also retry below.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The report could not be submitted. Try again.');
    } finally { setSubmitting(false); }
  };

  const confirmAction = async () => {
    if (!targetId || !pendingAction || submitting) return;
    const action = pendingAction;
    setSubmitting(true); setErrorMessage(''); setStatusMessage('');
    try {
      if (action === 'block') {
        await blockPerson(targetId);
        setStatusMessage(`${targetName} is blocked. The match and conversation are ended for both people, and this profile will not appear while blocked.`);
      } else {
        const ended = await unmatchPerson(targetId);
        setStatusMessage(ended
          ? `You unmatched ${targetName}. The conversation is now hidden for both people.`
          : 'There is no active match to end.');
      }
      setPendingAction(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The safety action could not be completed. Try again.');
    } finally { setSubmitting(false); }
  };

  const exit = () => {
    if (source === 'chat' || source === 'conversation-list') router.replace('/(tabs)/(chats)' as any);
    else navigateBackOrFallback(router, '/(tabs)/people');
  };

  return (
    <SettingsLayout
      fadeEdge
      testID="scr-22-report-modal"
      title="Safety controls"
      subtitle="Free for every Humbble member"
      fallbackHref={source === 'chat' ? '/(tabs)/(chats)' : '/(tabs)/people'}
      activeNavId="settings-report"
    >
      <Card testID="safety-target-card" variant="elevated">
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.heading, { color: palette.text }]}>Safety for {targetName}</Text>
          {!targetId ? (
            <Text style={[styles.body, { color: palette.textSecondary }]}>Open Safety from a person's profile or conversation to block, report, or unmatch that account.</Text>
          ) : (
            <>
              <View style={styles.actions}>
                <Button testID="safety-block-btn" label="Block this person" variant="danger" size="md" onPress={() => { setErrorMessage(''); setPendingAction('block'); }} />
                <Button testID="safety-unmatch-btn" label="Unmatch" variant="danger" size="md" onPress={() => { setErrorMessage(''); setPendingAction('unmatch'); }} />
              </View>
              {pendingAction ? (
                <View testID="safety-confirm-action" style={[styles.confirm, { backgroundColor: palette.errorSurface }]}>
                  <Text accessibilityRole="header" style={[styles.confirmTitle, { color: palette.errorText }]}>{pendingAction === 'block' ? `Block ${targetName}?` : `Unmatch ${targetName}?`}</Text>
                  <Text style={[styles.body, { color: palette.errorText }]}>{pendingAction === 'block'
                    ? 'This immediately hides the profile, rejects messages, and ends the match and conversation for both people. Unblocking will not restore the old match.'
                    : 'This ends the match and hides the conversation for both people. This cannot be undone by a later like.'}</Text>
                  <View style={styles.inlineActions}>
                    <Button testID="safety-confirm-btn" label={pendingAction === 'block' ? 'Confirm block' : 'Confirm unmatch'} variant="danger" size="md" loading={submitting} onPress={() => void confirmAction()} />
                    <Button label="Cancel" variant="secondary" size="md" disabled={submitting} onPress={() => setPendingAction(null)} />
                  </View>
                </View>
              ) : null}
            </>
          )}
        </View>
      </Card>

      <Card testID="safety-report-card" variant="elevated">
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.heading, { color: palette.text }]}>Report a concern</Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>Select the closest category. Keep notes brief and relevant; reports are private to Trust & Safety.</Text>
          <View testID="safety-report-category-group" accessibilityRole="radiogroup" style={styles.radioList}>
            {REPORT_CATEGORIES.map(category => {
              const selected = selectedCategory === category.id;
              return <Pressable key={category.id} testID={`safety-report-category-${category.id}`} onPress={() => setSelectedCategory(category.id)} accessibilityRole="radio" accessibilityLabel={category.label} accessibilityState={{ checked: selected }} style={[styles.radioOption, { backgroundColor: selected ? palette.primary : palette.surfaceMuted, borderColor: selected ? palette.primaryPressed : palette.border }]}>
                <Text style={{ color: selected ? palette.onPrimary : palette.text, fontWeight: selected ? '700' : '500' }}>{selected ? '● ' : '○ '}{category.label}</Text>
              </Pressable>;
            })}
          </View>
          <TextField testID="safety-report-note" label={`Optional note (${MAX_REPORT_NOTE_LENGTH} characters max)`} placeholder="Brief context (do not include private documents or passwords)" value={details} maxLength={MAX_REPORT_NOTE_LENGTH} onChangeText={setDetails} />
          <Button testID="safety-report-submit-btn" label={submitting ? 'Submitting…' : 'Submit report'} variant="primary" size="lg" disabled={!targetId || submitting} loading={submitting} onPress={() => void submitReport()} />
          {statusMessage ? <Text accessibilityRole="alert" testID="safety-status-message" style={[styles.status, { color: palette.successText }]}>{statusMessage}</Text> : null}
          {errorMessage ? <Text accessibilityRole="alert" testID="safety-error-message" style={[styles.status, { color: palette.errorText }]}>{errorMessage}</Text> : null}
          {queuedReports > 0 ? <View style={styles.retryBox}>
            <Text style={[styles.body, { color: palette.textSecondary }]}>{queuedReports} report{queuedReports === 1 ? '' : 's'} saved on this device and waiting for a connection.</Text>
            <Button testID="safety-retry-reports-btn" label="Retry pending reports" variant="secondary" size="md" onPress={() => void retryQueued()} />
          </View> : null}
          <Button label="Done" variant="ghost" size="md" onPress={exit} />
        </View>
      </Card>
      <Text style={[styles.help, { color: palette.textSecondary }]}>Need help or want to appeal a moderation decision? Read the <Text onPress={() => router.push('/(public)/legal/complaints-handling' as any)} style={{ color: palette.link, textDecorationLine: 'underline' }}>Safety Help & Appeals (draft)</Text> or use the in-app Safety controls to report a concern.</Text>
    </SettingsLayout>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.md }, heading: { ...Typography.h3 }, body: { ...Typography.bodySmall, lineHeight: 20 }, actions: { gap: Spacing.sm },
  confirm: { borderRadius: 14, padding: Spacing.md, gap: Spacing.sm }, confirmTitle: { ...Typography.bodySemiBold }, inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  radioList: { gap: Spacing.xs }, radioOption: { minHeight: TouchTargets.comfortable, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  status: { ...Typography.bodySmall, lineHeight: 20 }, retryBox: { gap: Spacing.sm, paddingTop: Spacing.xs }, help: { ...Typography.bodySmall, lineHeight: 21 },
});
