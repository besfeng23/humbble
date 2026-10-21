import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import { hasSafetyWarning, type ChatMessage } from '@/lib/messaging';

export function SafetyWarningBanner() {
  return <View accessibilityRole="alert" testID="message-safety-warning" style={styles.warning}>
    <Text style={styles.warningTitle}>Keep your conversation safe</Text>
    <Text style={styles.warningText}>Never send money, gift cards, crypto, or financial details. Be cautious if someone quickly asks to move off Humbble.</Text>
  </View>;
}

export function MessageBubble({ message, own }: { message: ChatMessage; own: boolean }) {
  return <View style={[styles.wrap, own ? styles.ownWrap : styles.theirWrap]}>
    {hasSafetyWarning(message.body) ? <SafetyWarningBanner /> : null}
    <View testID="message-bubble" style={[styles.bubble, own ? styles.own : styles.theirs]}>
      <Text style={[styles.body, own ? styles.ownBody : styles.theirBody]}>{message.body}</Text>
      <Text style={[styles.time, own ? styles.ownTime : styles.theirTime]}>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  wrap: { width: '100%', marginVertical: 5 },
  ownWrap: { alignItems: 'flex-end' },
  theirWrap: { alignItems: 'flex-start' },
  bubble: { maxWidth: '88%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 5 },
  own: { backgroundColor: '#191919', borderBottomRightRadius: 5 },
  theirs: { backgroundColor: '#F0EEE9', borderBottomLeftRadius: 5 },
  body: { fontSize: 15, lineHeight: 21 },
  ownBody: { color: '#FFFFFF' },
  theirBody: { color: '#171717' },
  time: { fontSize: 10, alignSelf: 'flex-end' },
  ownTime: { color: '#D5D0C6' },
  theirTime: { color: '#676767' },
  // Crimson safety treatment per spec, from the shared danger/error tokens.
  warning: { width: '100%', borderRadius: 12, backgroundColor: Colors.light.errorSurface, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: Colors.light.dangerSolid },
  warningTitle: { fontSize: 13, fontWeight: '700', color: Colors.light.errorText, marginBottom: 3 },
  warningText: { fontSize: 12, lineHeight: 17, color: Colors.light.errorText },
});
