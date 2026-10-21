import React from 'react';
import { Platform, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { AccessibleWebDatePickerField, DatePickerField, adultMaxIsoDate } from '@/components/layout/DatePickerField';
import { applyWebInputAttributes } from '@/components/ui/TextField';
import { textContent } from '../test-utils/textContent';

describe('web date attributes', () => {
  test('adultMaxIsoDate is today minus 18 years (UTC)', () => {
    expect(adultMaxIsoDate(new Date('2026-10-21T12:00:00Z'))).toBe('2008-10-21');
    expect(adultMaxIsoDate(new Date('2024-02-29T00:00:00Z'))).toBe('2006-03-01');
  });
  test('applyWebInputAttributes sets DOM attributes and ignores non-DOM refs', () => {
    const attrs: Record<string, string> = {};
    const el = { setAttribute: (k: string, v: string) => { attrs[k] = v; }, removeAttribute: (k: string) => { delete attrs[k]; } };
    applyWebInputAttributes(el, { type: 'date', max: '2008-10-21' });
    expect(attrs).toEqual({ type: 'date', max: '2008-10-21' });
    expect(() => applyWebInputAttributes(null, { type: 'date' })).not.toThrow();
    expect(() => applyWebInputAttributes({}, { type: 'date' })).not.toThrow();
  });
});

describe('DatePickerField', () => {
  test('web fallback is a labelled HTML date input with a future-date limit', () => {
    const onChange = jest.fn();
    const tree = renderer.create(<AccessibleWebDatePickerField testID="web-dob" value="" onChange={onChange} />);
    const input = tree.root.findAll((node) => node.props.testID === 'web-dob' && typeof node.props.onChangeText === 'function')[0];
    const field = tree.root.findAll((node) => node.props.testID === 'web-dob' && node.props.webInputAttributes != null)[0];
    expect(field.props.webInputAttributes.type).toBe('date');
    expect(field.props.webInputAttributes.max).toBe(adultMaxIsoDate());
    expect(field.props.webInputAttributes.min).toBe('1900-01-01');
    expect(input.props.placeholder).toBe('YYYY-MM-DD');
    expect(input.props.accessibilityLabel).toBe('Date of birth');
    act(() => input.props.onChangeText('1990-01-01'));
    expect(onChange).toHaveBeenCalledWith('1990-01-01');
  });

  (Platform.OS === 'web' ? test.skip : test)('native calendar opens and commits the selected date', () => {
    const onChange = jest.fn();
    const tree = renderer.create(<DatePickerField testID="dob-picker" value="" onChange={onChange} />);
    act(() => tree.root.findAll((node) => node.props.testID === 'dob-picker' && typeof node.props.onPress === 'function')[0].props.onPress());
    expect(tree.root.findByProps({ testID: 'dob-picker-modal' })).toBeDefined();
    act(() => tree.root.findByProps({ testID: 'dob-picker-select-year' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'dob-picker-year-1990' })).toBeDefined();
    act(() => tree.root.findByProps({ testID: 'dob-picker-year-1990' }).props.onPress());
    const currentMonth = Number(new Date().toISOString().slice(5, 7)) - 1;
    for (let i = currentMonth; i > 0; i -= 1) {
      act(() => tree.root.findByProps({ testID: 'dob-picker-previous-month' }).props.onPress());
    }
    act(() => tree.root.findByProps({ testID: 'dob-picker-day-1' }).props.onPress());
    expect(onChange).toHaveBeenCalledWith('1990-01-01');
  });

  test('shows the date-of-birth label and an inline accessible validation error', () => {
    const tree = renderer.create(<DatePickerField testID="dob-picker" value="" onChange={jest.fn()} error="Enter a valid date of birth in YYYY-MM-DD format." />);
    expect(tree.root.findAllByType(Text).some((node) => textContent(node.children) === 'Date of birth')).toBe(true);
    expect(textContent(tree.root.findByProps({ testID: 'dob-picker-error' }).children)).toBe('Enter a valid date of birth in YYYY-MM-DD format.');
  });
});
