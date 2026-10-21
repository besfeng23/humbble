import { ageFromBirthDate, isAdult } from '../auth/age';

describe('UTC age gate', () => {
  const today = new Date(Date.UTC(2026, 9, 21));
  test('accepts the exact eighteenth birthday', () => {
    expect(ageFromBirthDate('2008-10-21', today)).toBe(18);
    expect(isAdult('2008-10-21', today)).toBe(true);
  });
  test('rejects the day before age eighteen', () => {
    expect(ageFromBirthDate('2008-10-22', today)).toBe(17);
    expect(isAdult('2008-10-22', today)).toBe(false);
  });
  test('treats a leap-day birthday as February 29 in a leap year', () => {
    expect(ageFromBirthDate('2004-02-29', new Date(Date.UTC(2024, 1, 29)))).toBe(20);
  });
  test('uses March 1 for a February 29 birthday in non-leap years', () => {
    expect(ageFromBirthDate('2004-02-29', new Date(Date.UTC(2022, 1, 28)))).toBe(17);
    expect(ageFromBirthDate('2004-02-29', new Date(Date.UTC(2022, 2, 1)))).toBe(18);
  });
  test('rejects future birth dates', () => {
    expect(ageFromBirthDate('2026-10-22', today)).toBeNull();
    expect(isAdult('2026-10-22', today)).toBe(false);
  });
  test('rejects impossible calendar dates', () => {
    expect(ageFromBirthDate('2007-02-29', today)).toBeNull();
    expect(ageFromBirthDate('2000-13-01', today)).toBeNull();
  });
  test('rejects non-ISO and dates before the supported floor', () => {
    expect(ageFromBirthDate('10/21/2000', today)).toBeNull();
    expect(ageFromBirthDate('1899-12-31', today)).toBeNull();
  });
});
