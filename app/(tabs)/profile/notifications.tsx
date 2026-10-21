import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { SettingsLayout } from '@/components/layout';
import { Button, Card } from '@/components/ui';
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
      setStatus('Preferences saved.');
    } catch {
      setMatchesEnabled(previous.matches_enabled);
      setMessagesEnabled(previous.messages_enabled);
      setStatus('Could not save preferences. Try again.');
    } finally { setSaving(false); }
  };

  const enableDevice = async () => {
    try {
      const registered = await enablePushAndRegister();
      if (!registered) Alert.alert('Notifications not enabled', 'Allow notifications in your device settings to receive Humbble alerts.');
      else Alert.alert('Notifications enabled', 'This device can now receive match and message alerts.');
    } catch (error) {
      Alert.alert('Could not enable notifications', error instanceof Error ? error.message : 'Try again later.');
    }
  };

  return <SettingsLayout testID="scr-18-notification-settings" title="Notifications" subtitle="Choose which Humbble alerts you receive" fallbackHref="/(tabs)/profile/settings" activeNavId="settings-main" fadeEdge>
    <Card variant="elevated">
      <View style={styles.content}>
        <View style={styles.row}>
          <View style={styles.copy}>
            <Text style={[styles.label, { color: palette.text }]}>Matches</Text>
            <Text style={[styles.description, { color: palette.textSecondary }]}>When you and someone like each other.</Text>
          </View>
          <Switch testID="scr-18-matches-push-switch" accessibilityRole="switch" accessibilityLabel="Match notifications" value={matchesEnabled} disabled={saving} onValueChange={(value) => void update({ matches_enabled: value, messages_enabled: messagesEnabled })} />
        </View>
        <View style={styles.row}>
          <View style={styles.copy}>
            <Text style={[styles.label, { color: palette.text }]}>Messages</Text>
            <Text style={[styles.description, { color: palette.textSecondary }]}>When you receive a new message. Message text is never included in push alerts.</Text>
          </View>
          <Switch testID="scr-18-messages-push-switch" accessibilityRole="switch" accessibilityLabel="Message notifications" value={messagesEnabled} disabled={saving} onValueChange={(value) => void update({ matches_enabled: matchesEnabled, messages_enabled: value })} />
        </View>
        {status ? <Text testID="scr-18-push-status" accessibilityRole="text" style={[styles.description, { color: palette.textSecondary }]}>{status}</Text> : null}
        <Button testID="scr-18-enable-device-push" label="Enable notifications on this device" variant="secondary" size="md" onPress={() => void enableDevice()} />
      </View>
    </Card>
  </SettingsLayout>;
}

const styles = StyleSheet.create({ content: { gap: Spacing.xl }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md }, copy: { flex: 1, gap: Spacing.xxs }, label: { ...Typography.bodySemiBold }, description: { ...Typography.bodySmall } });
