import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Spacing } from '@/constants/Spacing';
import { Typography } from '@/constants/Typography';
import { useColorScheme } from '@/hooks/useColorScheme';

export function AuthScreen({ title, subtitle, children, testID }: { title: string; subtitle?: string; children: React.ReactNode; testID?: string }) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  return (
    <KeyboardAvoidingView style={[styles.fill, { backgroundColor: palette.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.content} testID={testID}>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: palette.textSecondary }]}>{subtitle}</Text> : null}
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({ fill: { flex: 1 }, scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl }, content: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: Spacing.lg }, title: { ...Typography.h1 }, subtitle: { ...Typography.body }, });
