import { readFileSync } from 'fs';
import { join } from 'path';
import { countryOptions, defaultCountryFromLocale, FEATURED_COUNTRIES, ISO_COUNTRY_CODES, normalizeCountryCode } from '@/lib/countries';

describe('countries', () => {
  it('has all 249 ISO 3166-1 alpha-2 codes, matching the DB CHECK', () => {
    expect(ISO_COUNTRY_CODES).toHaveLength(249);
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/20261023000031_profile_country.sql'), 'utf8');
    const dbCodes = (sql.match(/'[A-Z]{2}'/g) ?? []).map((c) => c.slice(1, 3));
    expect([...dbCodes].sort()).toEqual([...ISO_COUNTRY_CODES].sort());
  });
  it('normalizes and validates codes', () => {
    expect(normalizeCountryCode(' se ')).toBe('SE');
    expect(normalizeCountryCode('UK')).toBeNull();
    expect(normalizeCountryCode('ZZ')).toBeNull();
    expect(normalizeCountryCode(7)).toBeNull();
  });
  it('defaults from the device locale region', () => {
    expect(defaultCountryFromLocale('sv-SE')).toBe('SE');
    expect(defaultCountryFromLocale('en-CA')).toBe('CA');
    expect(defaultCountryFromLocale('en')).toBeNull();
  });
  it('lists featured markets first and every country once', () => {
    const opts = countryOptions('en-GB');
    expect(opts.slice(0, FEATURED_COUNTRIES.length).map((o) => o.code)).toEqual([...FEATURED_COUNTRIES]);
    expect(new Set(opts.map((o) => o.code)).size).toBe(249);
  });
});
