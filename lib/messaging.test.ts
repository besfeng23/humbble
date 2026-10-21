jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { compareMessageCursor, hasSafetyWarning, isAfterMessageCursor, isBeforeMessageCursor, validateMessage } from './messaging';

describe('messaging validation and safety warning', () => {
  test('trims valid messages and enforces empty and maximum length limits', () => {
    expect(validateMessage('  Hello there  ')).toBe('Hello there');
    expect(() => validateMessage('  ')).toThrow('Write a message before sending.');
    expect(() => validateMessage('x'.repeat(2001))).toThrow('2000 characters or fewer');
    expect(validateMessage('x'.repeat(2000))).toHaveLength(2000);
  });
  test('detects off-platform contact and money requests without emitting message content', () => {
    expect(hasSafetyWarning('Can you send me money for my ticket?')).toBe(true);
    expect(hasSafetyWarning('Let us move this chat off platform to WhatsApp')).toBe(true);
    expect(hasSafetyWarning('I like hiking and quiet coffee shops.')).toBe(false);
  });
  test.each([
    'Just GCash me 500 for the jeep',
    'Do you have Venmo?',
    'Add me on Telegram @someone',
    'whatsapp me later',
    'Text me at 0917 123 4567',
    'my number is +63 917-123-4567',
    'call +1 (415) 555-0134',
    'Send me load please',
    'Message me on Viber',
  ])('flags off-platform or money request: %s', text => {
    expect(hasSafetyWarning(text)).toBe(true);
  });
  test.each([
    'See you at 7 on Saturday?',
    'I was born in 1995 and moved here in 2019',
    'The cafe is on 5th street, table 12',
    'My signature dish is adobo',
    'Telegraph Hill was beautiful',
  ])('does not flag ordinary text: %s', text => {
    expect(hasSafetyWarning(text)).toBe(false);
  });
});

describe('message cursor ordering', () => {
  test('uses id as a deterministic tie-breaker for equal timestamps and catches up strictly after the cursor', () => {
    const first = { created_at: '2026-10-22T00:00:00.000Z', id: '00000000-0000-0000-0000-000000000001' };
    const second = { created_at: '2026-10-22T00:00:00.000Z', id: '00000000-0000-0000-0000-000000000002' };
    expect(compareMessageCursor(first, second)).toBeLessThan(0);
    expect(isBeforeMessageCursor(first, second)).toBe(true);
    expect(isAfterMessageCursor(second, first)).toBe(true);
    expect(isAfterMessageCursor(first, first)).toBe(false);
  });
});
