type KeyValueStore = { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> };
// Lazily resolved so screens importing this module do not require the native module at load time.
function nativeStore(): KeyValueStore {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@react-native-async-storage/async-storage');
  return (mod.default ?? mod) as KeyValueStore;
}

/**
 * First-party affiliate attribution capture.
 *
 * Reads an allowlisted set of click-id / sub / utm params from the landing URL, keeps a
 * first-party copy (localStorage on web, AsyncStorage on native) for 30 days, and hands
 * it to supabase.auth.signUp user metadata so the server binds it to the account ONCE.
 * Only the landing PATH is kept (never the query string or full URL), values are
 * length/charset limited, and anything that looks like an email is dropped: no PII.
 *
 * TODO(postbacks): postback firing is intentionally NOT implemented. public.postback_outbox
 * (unique network+click_id+event) and per-network URL templates in
 * public.attribution_networks exist, but postback_enabled is false and nothing enqueues or
 * sends yet, because each network's postback spec is unconfirmed.
 */
export const ATTRIBUTION_STORAGE_KEY = 'humbble.attribution.v1';
export const TRACKING_CONSENT_STORAGE_KEY = 'sincera.optional_tracking_consent.v1';
export type TrackingConsentChoice = 'allowed' | 'denied' | null;
export const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Generic allowlist covering affiliate networks and self-run trackers (Voluum `cid`,
// RedTrack `rtkcid`, HasOffers-style `aff_click_id`/`aff_sub*`, `sub1..sub10`, utm_*).
// Which param is the click id for a given network is server-side config
// (public.attribution_networks.click_id_params), not hardcoded here. Keep in sync with
// private.sanitize_attribution_params.
const KEY_PATTERN = /^(network|click_id|clickid|cid|rtkcid|subid|sub_id|aff_click_id|transaction_id|aff_id|offer_id|campaign_id|aff_sub[2-5]?|sub([1-9]|10)|s[1-5]|utm_[a-z_]{1,32})$/;
const VALUE_PATTERN = /^[A-Za-z0-9_.:~ -]{1,128}$/;

export type Attribution = { params: Record<string, string>; landing_path: string | null; first_seen_at: string };

export function extractAttributionParams(search: string | Record<string, unknown>): Record<string, string> {
  const entries: [string, unknown][] = typeof search === 'string'
    ? Array.from(new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).entries())
    : Object.entries(search);
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.toLowerCase();
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (!KEY_PATTERN.test(key) || typeof value !== 'string') continue;
    if (!VALUE_PATTERN.test(value) || value.includes('@')) continue;
    out[key] = value;
  }
  return out;
}

export function sanitizeLandingPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const bare = path.split(/[?#]/)[0];
  return /^\/[^@]{0,200}$/.test(bare) ? bare : null;
}

async function readRaw(): Promise<string | null> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    return await nativeStore().getItem(ATTRIBUTION_STORAGE_KEY);
  } catch { return null; }
}
async function writeRaw(value: string | null): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (value === null) window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY); else window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, value);
      return;
    }
    if (value === null) await nativeStore().removeItem(ATTRIBUTION_STORAGE_KEY); else await nativeStore().setItem(ATTRIBUTION_STORAGE_KEY, value);
  } catch { /* storage unavailable: attribution is best-effort */ }
}

/** Optional affiliate/analytics storage is denied unless the visitor explicitly opts in.
 * This device setting does not replace signed-in server consent/erasure workflows.
 */
export async function readTrackingConsent(): Promise<TrackingConsentChoice> {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage
      ? window.localStorage.getItem(TRACKING_CONSENT_STORAGE_KEY)
      : await nativeStore().getItem(TRACKING_CONSENT_STORAGE_KEY);
    return raw === 'allowed' || raw === 'denied' ? raw : null;
  } catch { return null; }
}

export async function setTrackingConsent(choice: Exclude<TrackingConsentChoice, null>): Promise<boolean> {
  let written = false;
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(TRACKING_CONSENT_STORAGE_KEY, choice);
    else await nativeStore().setItem(TRACKING_CONSENT_STORAGE_KEY, choice);
    written = true;
  } catch { /* fail closed: unpersisted permission never enables attribution */ }
  if (choice === 'denied') await clearAttribution();
  return written;
}

export async function loadAttribution(now = Date.now()): Promise<Attribution | null> {
  if (await readTrackingConsent() !== 'allowed') return null;
  const raw = await readRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Attribution;
    const seen = Date.parse(parsed.first_seen_at);
    if (!Number.isFinite(seen) || now - seen > ATTRIBUTION_TTL_MS) { await writeRaw(null); return null; }
    const params = extractAttributionParams(parsed.params ?? {});
    return Object.keys(params).length ? { params, landing_path: sanitizeLandingPath(parsed.landing_path), first_seen_at: parsed.first_seen_at } : null;
  } catch { await writeRaw(null); return null; }
}

/** Captures attribution from a landing visit. First touch wins within the 30-day window. */
export async function captureAttribution(search: string | Record<string, unknown>, path: string | null, now = Date.now()): Promise<Attribution | null> {
  if (await readTrackingConsent() !== 'allowed') return null;
  const params = extractAttributionParams(search);
  const existing = await loadAttribution(now);
  if (existing || !Object.keys(params).length) return existing;
  const next: Attribution = { params, landing_path: sanitizeLandingPath(path), first_seen_at: new Date(now).toISOString() };
  await writeRaw(JSON.stringify(next));
  return next;
}

export async function clearAttribution(): Promise<void> { await writeRaw(null); }
