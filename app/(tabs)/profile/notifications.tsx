import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SettingsLayout } from '@/components/layout';
import { Colors } from '@/constants/Colors';
import { Spacing } from '@/constants/Spacing';
import { Typography } from '@/constants/Typography';
import { useColorScheme } from '@/hooks/useColorScheme';
import { enablePushAndRegister, loadNotificationPreferences, saveNotificationPreferences, type NotificationPreferences } from '@/lib/notifications';

export default function NotificationSettingsScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const [matchesEnabled, setMatchesEnabled] = useState(true);
  const [messagesEnabled, setMessagesEnabled] = useState(true);
  const [status, setStatus] = useState('Loading preferences…');
  const [saving, setSaving] = useState(false);
  const [deviceOn, setDeviceOn] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadNotificationPreferences().then((preferences) => {
      if (!alive) return;
      setMatchesEnabled(preferences.matches_enabled);
      setMessagesEnabled(preferences.messages_enabled);
      setStatus('');
    }).catch(() => { if (alive) setStatus('Notification preferences could not be loaded.'); });
    return () => { alive = false; };
  }, []);

  const update = async (next: NotificationPreferences) => {
    const previous = { matches_enabled: matchesEnabled, messages_enabled: messagesEnabled };
    setMatchesEnabled(next.matches_enabled);
    setMessagesEnabled(next.messages_enabled);
    setSaving(true);
    setStatus('Saving…');
    try {
      await saveNotificationPreferences(next);
      setStatus('');
    } catch {
      setMatchesEnabled(previous.matches_enabled);
      setMessagesEnabled(previous.messages_enabled);
      setStatus('Could not save preferences. Try again.');
    } finally { setSaving(false); }
  };

  const enableDevice = async () => {
    try {
      const registered = await enablePushAndRegister();
      setDeviceOn(registered);
      setStatus(registered ? '' : 'Allow notifications in your device settings.');
    } catch {
      setStatus('Could not turn on notifications. Try again.');
    }
  };

  // Sparse layout: two switches, one privacy line and a quiet text action.
  return <SettingsLayout testID="scr-18-notification-settings" title="Notifications" fallbackHref="/(tabs)/profile/settings" activeNavId="settings-main" fadeEdge>
    <View style={styles.content}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>Matches</Text>
        <Switch testID="scr-18-matches-push-switch" accessibilityRole="switch" accessibilityLabel="Match notifications" value={matchesEnabled} disabled={saving} onValueChange={(value) => void update({ matches_enabled: value, messages_enabled: messagesEnabled })} />
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>Messages</Text>
        <Switch testID="scr-18-messages-push-switch" accessibilityRole="switch" accessibilityLabel="Message notifications" value={messagesEnabled} disabled={saving} onValueChange={(value) => void update({ matches_enabled: matchesEnabled, messages_enabled: value })} />
      </View>
      <Text style={[styles.description, { color: palette.textSecondary }]}>Alerts never include message text.</Text>
      {status ? <Text testID="scr-18-push-status" accessibilityRole="text" style={[styles.description, { color: palette.textSecondary }]}>{status}</Text> : null}
      {deviceOn ? null : <Pressable testID="scr-18-enable-device-push" accessibilityRole="button" hitSlop={8} onPress={() => void enableDevice()} style={styles.textButton}>
        <Text style={[styles.textButtonLabel, { color: palette.text }]}>Turn on notifications</Text>
      </Pressable>}
    </View>
  </SettingsLayout>;
}

const styles = StyleSheet.create({ content: { gap: Spacing.lg, paddingTop: Spacing.md }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, minHeight: 44 }, label: { ...Typography.bodySemiBold }, description: { ...Typography.bodySmall }, textButton: { alignSelf: 'flex-start', paddingVertical: Spacing.xs }, textButtonLabel: { ...Typography.bodySemiBold, textDecorationLine: 'underline' } });
