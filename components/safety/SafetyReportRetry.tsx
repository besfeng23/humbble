import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Toast } from '@/components/ui';
import { Spacing } from '@/constants/Spacing';
import { startSafetyReportRetry } from '@/lib/safetyRetry';

/** Mounted once at the root so queued reports retry everywhere, not only on the Safety screen. */
export function SafetyReportRetry() {
  const [notice, setNotice] = useState('');
  useEffect(() => startSafetyReportRetry(setNotice), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice) return null;
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Toast testID="safety-retry-notice" variant="info" message={notice} onDismiss={() => setNotice('')} />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { position: 'absolute', left: Spacing.md, right: Spacing.md, bottom: Spacing.xl } });
