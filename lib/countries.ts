import { countryHintFromLocale, deviceLocale } from '@/lib/locale';

/** ISO 3166-1 alpha-2 codes; must match chk_profiles_country_code_iso (migration 20261023000031). */
export const ISO_COUNTRY_CODES: readonly string[] = ['AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','YE','YT','ZA','ZM','ZW'];
const CODE_SET = new Set(ISO_COUNTRY_CODES);

/** Markets shown first in the picker (paying + secondary markets). */
export const FEATURED_COUNTRIES = ['SE', 'NO', 'FI', 'GB', 'CA', 'IT', 'AU', 'DE', 'NL', 'BE', 'IE', 'NZ', 'US', 'PH'] as const;

export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return CODE_SET.has(code) ? code : null;
}

/** Default picker value: the device locale region, if it is a real ISO country. */
export function defaultCountryFromLocale(locale: string = deviceLocale()): string | null {
  return normalizeCountryCode(countryHintFromLocale(locale));
}

export function countryName(code: string, locale: string = deviceLocale()): string {
  try {
    const DisplayNames = (Intl as unknown as { DisplayNames?: new (l: string[], o: { type: 'region' }) => { of(c: string): string | undefined } }).DisplayNames;
    if (DisplayNames) return new DisplayNames([locale, 'en'], { type: 'region' }).of(code) ?? code;
  } catch { /* fall through */ }
  return code;
}

/** Featured markets first, then everything else alphabetically by display name. */
export function countryOptions(locale: string = deviceLocale()): { code: string; name: string }[] {
  const featured = FEATURED_COUNTRIES.map((code) => ({ code, name: countryName(code, locale) }));
  const rest = ISO_COUNTRY_CODES.filter((c) => !(FEATURED_COUNTRIES as readonly string[]).includes(c))
    .map((code) => ({ code, name: countryName(code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...featured, ...rest];
}
