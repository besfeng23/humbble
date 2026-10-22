import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Spacing } from '@/constants/Spacing';
import { useColorScheme } from '@/hooks/useColorScheme';
import { countryName, countryOptions } from '@/lib/countries';
import { Button } from './Button';
import { TextField } from './TextField';

type Props = { testID: string; label?: string; value: string | null; onChange(code: string): void; disabled?: boolean };

export function CountryPicker({ testID, label = 'Country', value, onChange, disabled }: Props) {
  const palette = Colors[useColorScheme() ?? 'light'];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const options = useMemo(() => countryOptions(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.name.toLowerCase().includes(q) || o.code.toLowerCase() === q) : options;
  }, [options, query]);

  return <View style={styles.wrap}>
    <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${label}: ${value ? countryName(value) : 'not set'}`} disabled={disabled}
      onPress={() => setOpen(true)} style={[styles.field, { borderColor: palette.border, backgroundColor: palette.surface }]}>
      <Text style={{ color: value ? palette.text : palette.textSecondary }}>{value ? countryName(value) : 'Select your country'}</Text>
      <Text style={{ color: palette.textSecondary }}>▾</Text>
    </Pressable>
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <View testID={`${testID}-modal`} style={[styles.modal, { backgroundColor: palette.background }]}>
        <TextField testID={`${testID}-search`} label="Search countries" value={query} onChangeText={setQuery} />
        <FlatList data={filtered} keyExtractor={(o) => o.code} keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <Pressable testID={`${testID}-option-${item.code}`} accessibilityRole="button" accessibilityState={{ selected: item.code === value }}
            onPress={() => { onChange(item.code); setOpen(false); setQuery(''); }} style={styles.option}>
            <Text style={{ color: palette.text, fontWeight: item.code === value ? '700' : '400' }}>{item.name}</Text>
          </Pressable>} />
        <Button testID={`${testID}-close`} label="Close" variant="secondary" onPress={() => setOpen(false)} />
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  label: { fontWeight: '600' },
  field: { borderWidth: 1, borderRadius: 12, paddingHorizontal: Spacing.md, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modal: { flex: 1, padding: Spacing.lg, paddingTop: Spacing.xl, gap: Spacing.md },
  option: { paddingVertical: Spacing.md, minHeight: 44 },
});
