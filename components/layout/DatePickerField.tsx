import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TextField } from '@/components/ui';
import { Colors } from '@/constants/Colors';
import { Spacing, TouchTargets } from '@/constants/Spacing';
import { Typography } from '@/constants/Typography';
import { useColorScheme } from '@/hooks/useColorScheme';

type DatePickerFieldProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  testID?: string;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** Latest selectable birth date on web: today (UTC) minus 18 years. The server still enforces 18+. */
export function adultMaxIsoDate(today: Date = new Date()): string {
  const d = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

function maxIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function utcTodayAsLocalCalendarDate(): Date {
  const [year, month, day] = maxIsoDate().split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Accessible HTML date input used on web browsers that support native date controls. */
export function AccessibleWebDatePickerField({ value, onChange, error, testID = 'date-picker' }: DatePickerFieldProps) {
  return (
    <TextField
      testID={testID}
      label="Date of birth"
      value={value}
      onChangeText={onChange}
      accessibilityLabel="Date of birth"
      accessibilityHint="Choose your birth date. Future dates are unavailable."
      error={error}
      required
      placeholder="YYYY-MM-DD"
      helperText="Format: YYYY-MM-DD"
      autoCapitalize="none"
      maxLength={10}
      webInputAttributes={{ type: 'date', min: '1900-01-01', max: adultMaxIsoDate() }}
    />
  );
}

/** Native calendar picker on iOS/Android; accessible HTML date input fallback on web. */
export function DatePickerField({ value, onChange, error, testID = 'date-picker' }: DatePickerFieldProps) {
  const palette = Colors[useColorScheme() ?? 'light'];
  const [visible, setVisible] = useState(false);
  const [choosingYear, setChoosingYear] = useState(false);
  const today = useMemo(() => utcTodayAsLocalCalendarDate(), []);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = parseLocalDate(value);
    const initial = selected ?? today;
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  if (Platform.OS === 'web') return <AccessibleWebDatePickerField value={value} onChange={onChange} error={error} testID={testID} />;

  const selected = parseLocalDate(value);
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const years = Array.from({ length: 121 }, (_, index) => today.getFullYear() - index);

  const chooseDay = (day: number) => {
    const date = new Date(year, month, day);
    if (date > today) return;
    onChange(localIsoDate(date));
    setVisible(false);
    setChoosingYear(false);
  };

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: palette.text }]}>Date of birth</Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={value ? `Date of birth, ${value}` : 'Choose date of birth'}
        accessibilityHint="Opens a calendar to select your date of birth. Future dates are unavailable."
        accessibilityState={{ expanded: visible }}
        onPress={() => {
          const initial = selected ?? today;
          setVisibleMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
          setChoosingYear(false);
          setVisible(true);
        }}
        style={({ pressed }) => [
          styles.dateControl,
          {
            backgroundColor: palette.surfaceMuted,
            borderColor: error ? palette.errorBorder : palette.borderStrong,
            opacity: pressed ? 0.88 : 1,
          },
        ]}
      >
        <Text style={[Typography.body, { color: selected ? palette.text : palette.textMuted }]}>
          {value || 'Choose date'}
        </Text>
      </Pressable>
      {error ? <Text testID={`${testID}-error`} accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.error, { color: palette.errorText }]}>{error}</Text> : null}

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.scrim}>
          <View testID={`${testID}-modal`} accessibilityViewIsModal style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.warningBorder }]}>
            <Text accessibilityRole="header" style={[Typography.h2, { color: palette.text, marginBottom: Spacing.md }]}>Select date of birth</Text>
            {choosingYear ? (
              <ScrollView testID={`${testID}-year-list`} style={styles.yearList} keyboardShouldPersistTaps="handled">
                {years.map((candidateYear) => (
                  <Pressable
                    key={candidateYear}
                    testID={`${testID}-year-${candidateYear}`}
                    accessibilityRole="button"
                    accessibilityLabel={String(candidateYear)}
                    onPress={() => {
                      setVisibleMonth(new Date(candidateYear, month, 1));
                      setChoosingYear(false);
                    }}
                    style={[styles.yearOption, candidateYear === year ? { backgroundColor: palette.primary } : null]}
                  >
                    <Text style={[Typography.body, { color: candidateYear === year ? palette.onPrimary : palette.text }]}>{candidateYear}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <>
                <View style={styles.monthHeader}>
                  <Pressable
                    testID={`${testID}-previous-month`}
                    accessibilityRole="button"
                    accessibilityLabel="Previous month"
                    onPress={() => setVisibleMonth(new Date(year, month - 1, 1))}
                    style={styles.monthArrow}
                  ><Text style={{ color: palette.link, fontSize: 20 }}>‹</Text></Pressable>
                  <Pressable
                    testID={`${testID}-select-year`}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose year, ${year}`}
                    onPress={() => setChoosingYear(true)}
                    style={styles.yearButton}
                  ><Text style={[Typography.bodySemiBold, { color: palette.link, textDecorationLine: 'underline' }]}>{MONTHS[month]} {year}</Text></Pressable>
                  <Pressable
                    testID={`${testID}-next-month`}
                    accessibilityRole="button"
                    accessibilityLabel="Next month"
                    disabled={year === today.getFullYear() && month >= today.getMonth()}
                    onPress={() => setVisibleMonth(new Date(year, month + 1, 1))}
                    style={styles.monthArrow}
                  ><Text style={{ color: palette.link, fontSize: 20 }}>›</Text></Pressable>
                </View>
                <View style={styles.calendarGrid}>
                  {WEEKDAYS.map((weekday) => <Text key={weekday} accessibilityLabel={weekday} style={[styles.weekday, { color: palette.textSecondary }]}>{weekday}</Text>)}
                  {Array.from({ length: firstWeekday }, (_, index) => <View key={`blank-${index}`} style={styles.dayCell} />)}
                  {Array.from({ length: daysInMonth }, (_, index) => {
                    const day = index + 1;
                    const candidate = new Date(year, month, day);
                    const disabled = candidate > today;
                    const active = selected?.getFullYear() === year && selected.getMonth() === month && selected.getDate() === day;
                    return (
                      <Pressable
                        key={day}
                        testID={`${testID}-day-${day}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${MONTHS[month]} ${day}, ${year}`}
                        accessibilityState={{ selected: active, disabled }}
                        disabled={disabled}
                        onPress={() => chooseDay(day)}
                        style={[styles.dayCell, active ? { backgroundColor: palette.primary } : null, disabled ? styles.dayDisabled : null]}
                      ><Text style={{ color: active ? palette.onPrimary : disabled ? palette.disabledText : palette.text }}>{day}</Text></Pressable>
                    );
                  })}
                </View>
              </>
            )}
            <Pressable testID={`${testID}-cancel`} accessibilityRole="button" onPress={() => { setVisible(false); setChoosingYear(false); }} style={styles.cancel}>
              <Text style={[Typography.bodySemiBold, { color: palette.link, textDecorationLine: 'underline' }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { width: '100%', gap: Spacing.sm },
  label: { ...Typography.label },
  dateControl: { minHeight: TouchTargets.comfortable, justifyContent: 'center', paddingHorizontal: Spacing.xl, borderRadius: 12, borderWidth: 1 },
  error: { ...Typography.bodySmall, marginTop: Spacing.xs },
  scrim: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, backgroundColor: 'rgba(15,15,14,0.55)' },
  sheet: { width: '100%', maxWidth: 400, maxHeight: '85%', padding: Spacing.xl, borderRadius: 16, borderWidth: 1, gap: Spacing.md },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthArrow: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  yearButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', flex: 1 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', textAlign: 'center', paddingVertical: Spacing.sm, fontSize: 12 },
  dayCell: { width: '14.2857%', minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  dayDisabled: { opacity: 0.45 },
  yearList: { maxHeight: 360 },
  yearOption: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});

export default DatePickerField;
