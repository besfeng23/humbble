/** UTC-only age calculation. Feb 29 birthdays fall on March 1 in non-leap years. */
export function ageFromBirthDate(
  birthDate: string,
  today: Date = new Date(),
): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match || Number.isNaN(today.getTime())) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    year < 1900
  ) return null;

  const todayUtc = new Date(Date.UTC(
    today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(),
  ));
  if (parsed.getTime() > todayUtc.getTime()) return null;

  let birthdayMonth = month - 1;
  let birthdayDay = day;
  if (month === 2 && day === 29 && !isLeapYear(todayUtc.getUTCFullYear())) {
    birthdayMonth = 2;
    birthdayDay = 1;
  }
  let age = todayUtc.getUTCFullYear() - year;
  if (
    todayUtc.getUTCMonth() < birthdayMonth ||
    (todayUtc.getUTCMonth() === birthdayMonth && todayUtc.getUTCDate() < birthdayDay)
  ) age -= 1;
  return age;
}

export function isAdult(birthDate: string, today: Date = new Date()): boolean {
  const age = ageFromBirthDate(birthDate, today);
  return age !== null && age >= 18;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
