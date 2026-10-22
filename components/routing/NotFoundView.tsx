import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export function NotFoundView() {
  const router = useRouter();
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <View testID="not-found-screen" style={[styles.root, { backgroundColor: palette.background }]}>
      <Text style={[styles.code, { color: palette.textSecondary }]}>404</Text>
      <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>We can’t find that page</Text>
      <Text style={[styles.body, { color: palette.textSecondary }]}>The link may be broken or the page may have moved.</Text>
      <View style={styles.actions}>
        <Button testID="not-found-home" label="Go to home" size="lg" onPress={() => router.replace('/' as any)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  code: { fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 340 },
  actions: { marginTop: 12, alignSelf: 'stretch', maxWidth: 340, width: '100%' },
});
