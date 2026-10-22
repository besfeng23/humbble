/** Device locale, e.g. "sv-SE". Used only for formatting and as an advisory country hint. */
export function deviceLocale(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().locale || 'en-PH'; } catch { return 'en-PH'; }
}
/** Region part of a locale ("sv-SE" -> "SE"); the server validates it against its allowlist. */
export function countryHintFromLocale(locale: string): string | null {
  const m = /[-_]([A-Za-z]{2})(?:$|[-_])/.exec(locale);
  return m ? m[1].toUpperCase() : null;
}
