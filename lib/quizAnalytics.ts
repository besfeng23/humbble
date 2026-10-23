import { extractAttributionParams, loadAttribution } from '@/lib/attribution';
import { normalizeCountryCode } from '@/lib/countries';
import { QUIZ_CHOICE_STEPS, QUIZ_TOTAL_STEPS } from '@/lib/quiz';

/**
 * Anonymous quiz funnel events (quiz_started, quiz_step, quiz_completed, quiz_cta_clicked).
 *
 * OFF BY DEFAULT. Nothing is stored or sent unless the build sets EXPO_PUBLIC_QUIZ_ANALYTICS=1 (opt-in, until counsel signs
 * off), and even then not for visitors who opted out (stored opt-out, all platforms), or whose browser sends Do-Not-Track /
 * Global Privacy Control.
 *
 * Server side: public.record_quiz_event (migration 20261023000070) writes public.quiz_events. A row holds only: a random
 * session UUID, the event name, the step number, ONE enum answer (or an ISO country on step 4), an allow-listed ad network
 * slug, utm_source / utm_medium / utm_campaign slugs, and the time rounded to the hour. No click id, sub id, user id, IP,
 * user agent, free text or URL, and the session id is never passed to signup. See docs/operations/quiz-funnel-events.md.
 *
 * Client contract:
 *  - fire-and-forget: trackQuizEvent returns void synchronously, never throws, never awaits network on the UI path;
 *  - every failure is silent, and after the first failed request no further events are sent in this page/app session;
 *  - enablement and opt-out are checked BEFORE a session id is created or stored;
 *  - the request is made with the public anon key only (never the signed-in user's session token);
 *  - the session id is random (NOT a fingerprint), kept on this device only, and kept for at most 30 days from first
 *    creation: initQuizAnalytics() deletes an expired id on the next quiz visit (or a leftover one when analytics are off
 *    or opted out), and clearing site data / app storage removes it at any time.
 */
export const QUIZ_SESSION_STORAGE_KEY = 'humbble.quiz.session.v1';
export const QUIZ_OPTOUT_STORAGE_KEY = 'humbble.quiz.optout.v1';
export const QUIZ_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type QuizEventName = 'quiz_started' | 'quiz_step' | 'quiz_completed' | 'quiz_cta_clicked';
/** The ONLY attribution that ever leaves the device: slugs, never click ids / sub ids. */
export type QuizAttribution = { network?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string };
export type QuizEventInput = { event: QuizEventName; step?: number; value?: string; attribution?: QuizAttribution };
export type QuizEventArgs = {
  p_session_id: string;
  p_event: QuizEventName;
  p_step: number;
  p_answer: string | null;
  p_country_code: string | null;
  p_network: string | null;
  p_utm_source: string | null;
  p_utm_medium: string | null;
  p_utm_campaign: string | null;
};
export type QuizEventTransport = (args: QuizEventArgs) => Promise<{ error: unknown } | void>;

type KeyValueStore = { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> };
// Lazily resolved so importing this module does not require the native module at load time.
function nativeStore(): KeyValueStore {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@react-native-async-storage/async-storage');
  return (mod.default ?? mod) as KeyValueStore;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function isUuidV4(value: unknown): value is string { return typeof value === 'string' && UUID_V4.test(value); }

/** Random v4 UUID. Uses the platform CSPRNG when present; Math.random is an acceptable fallback (not a secret or fingerprint). */
export function generateSessionId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
    if (c?.randomUUID) { const id = c.randomUUID(); if (isUuidV4(id)) return id; }
    const bytes = new Uint8Array(16);
    if (c?.getRandomValues) c.getRandomValues(bytes); else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
    hex[12] = '4'; hex[16] = '89ab'[Math.floor(Math.random() * 4)];
    const h = hex.join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}

async function readKey(key: string): Promise<string | null> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.getItem(key);
    return await nativeStore().getItem(key);
  } catch { return null; }
}
async function writeKey(key: string, value: string | null): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value);
      return;
    }
    if (value === null) await nativeStore().removeItem(key); else await nativeStore().setItem(key, value);
  } catch { /* storage unavailable: the in-memory id below still groups events for this visit */ }
}
const readRaw = () => readKey(QUIZ_SESSION_STORAGE_KEY);
const writeRaw = (v: string | null) => writeKey(QUIZ_SESSION_STORAGE_KEY, v);

let memorySession: { id: string; created_at: string } | null = null;
let sessionInFlight: Promise<string> | null = null;

/** Returns the local anonymous session id, creating it on first use and rotating it after 30 days. */
export function getQuizSessionId(now = Date.now()): Promise<string> {
  // Concurrent first calls share one lookup so a visit can never end up with two different session ids.
  if (!sessionInFlight) sessionInFlight = resolveQuizSessionId(now).finally(() => { sessionInFlight = null; });
  return sessionInFlight;
}

async function resolveQuizSessionId(now: number): Promise<string> {
  const raw = await readRaw();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { id?: unknown; created_at?: unknown };
      const created = typeof parsed.created_at === 'string' ? Date.parse(parsed.created_at) : NaN;
      if (isUuidV4(parsed.id) && Number.isFinite(created) && now - created <= QUIZ_SESSION_TTL_MS) {
        memorySession = { id: parsed.id, created_at: parsed.created_at as string };
        return parsed.id;
      }
    } catch { /* fall through to a fresh id */ }
  }
  if (memorySession && now - Date.parse(memorySession.created_at) <= QUIZ_SESSION_TTL_MS) return memorySession.id;
  memorySession = { id: generateSessionId(), created_at: new Date(now).toISOString() };
  await writeRaw(JSON.stringify(memorySession));
  return memorySession.id;
}

export async function clearQuizSession(): Promise<void> { memorySession = null; sessionInFlight = null; await writeRaw(null); }

// --- Enablement / opt-out / circuit breaker ---
let failed = false;
let transportOverride: QuizEventTransport | null = null;
let flagOverride: string | null = null;
let configOverride: { url: string; key: string } | null = null;
let optedOutMemory: boolean | null = null; // null = not read from storage yet
const sent = new Set<string>();
let queue: Promise<void> = Promise.resolve(); // events are sent one at a time, in order

/** Test hooks. */
export function __setQuizEventTransport(t: QuizEventTransport | null): void { transportOverride = t; }
export function __setQuizAnalyticsFlag(v: string | null): void { flagOverride = v; } // Expo inlines EXPO_PUBLIC_* at build time
export function __setQuizSupabaseConfig(c: { url: string; key: string } | null): void { configOverride = c; }
export function __resetQuizAnalytics(): void {
  failed = false; transportOverride = null; flagOverride = null; configOverride = null; optedOutMemory = null;
  memorySession = null; sessionInFlight = null; queue = Promise.resolve(); sent.clear();
}

/** Build-time opt-in. Only 1 / true / on enable analytics; unset or anything else means OFF. */
export function isQuizAnalyticsFlagOn(): boolean {
  const flag = (flagOverride ?? process.env.EXPO_PUBLIC_QUIZ_ANALYTICS ?? '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

/** Synchronous gate: flag on, no browser privacy signal, no failure yet, and not known to be opted out. */
export function isQuizAnalyticsEnabled(): boolean {
  if (failed || optedOutMemory === true) return false;
  if (!isQuizAnalyticsFlagOn()) return false;
  try {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }) : null;
    if (nav && (nav.doNotTrack === '1' || nav.doNotTrack === 'yes' || nav.msDoNotTrack === '1' || nav.globalPrivacyControl === true)) return false;
  } catch { /* ignore */ }
  return true;
}

/** Stored opt-out (localStorage on web, AsyncStorage on native). */
export async function isQuizAnalyticsOptedOut(): Promise<boolean> {
  if (optedOutMemory === null) optedOutMemory = (await readKey(QUIZ_OPTOUT_STORAGE_KEY)) === '1';
  return optedOutMemory;
}

/** Opts the visitor out (or back in): stored on this device, takes effect immediately, and deletes the local session id. */
export async function setQuizAnalyticsOptOut(optedOut: boolean): Promise<void> {
  optedOutMemory = optedOut;
  if (optedOut) { await clearQuizSession(); await writeKey(QUIZ_OPTOUT_STORAGE_KEY, '1'); } else await writeKey(QUIZ_OPTOUT_STORAGE_KEY, null);
}

/**
 * Run once when the quiz opens. Tidies local state, then tells the screen whether analytics are active (so the notice is only
 * shown when they are): deletes a leftover session id when analytics are off or opted out, and an expired one otherwise.
 * Never creates anything.
 */
export async function initQuizAnalytics(now = Date.now()): Promise<{ active: boolean }> {
  try {
    const optedOut = await isQuizAnalyticsOptedOut();
    const active = isQuizAnalyticsEnabled() && !optedOut;
    const raw = await readRaw();
    if (raw !== null) {
      let keep = false;
      if (active) {
        try {
          const parsed = JSON.parse(raw) as { id?: unknown; created_at?: unknown };
          const created = typeof parsed.created_at === 'string' ? Date.parse(parsed.created_at) : NaN;
          keep = isUuidV4(parsed.id) && Number.isFinite(created) && now - created <= QUIZ_SESSION_TTL_MS;
        } catch { keep = false; }
      }
      if (!keep) { memorySession = null; await writeRaw(null); }
    }
    return { active };
  } catch { return { active: false }; }
}

// --- Payload ---
const UTM_SLUG = /^[a-z0-9_-]{1,32}$/;
const NETWORK_SLUG = /^[a-z0-9_.-]{1,64}$/;
/** Same rules as private.quiz_event_utm_valid: a clean slug that is not hash-like (24+ hex) and not digit-heavy (9+ digits). */
export function isCleanUtmSlug(v: unknown): v is string {
  return typeof v === 'string' && UTM_SLUG.test(v) && !/^[a-f0-9]{24,}$/.test(v) && (v.match(/[0-9]/g)?.length ?? 0) < 9;
}
const CLICK_ID_KEYS = ['click_id', 'clickid', 'cid', 'rtkcid', 'aff_click_id', 'subid', 'sub_id', 'transaction_id'];

/**
 * Reduces page / first-touch params to the slugs we may send. Click ids and sub ids are NEVER sent: when a click id is present
 * and no network is named, the network is reported as the generic 'unknown' slug (a source flag, not an identifier).
 */
export function deriveQuizAttribution(params: Record<string, unknown> = {}): QuizAttribution {
  const clean = extractAttributionParams(params);
  const lower = (k: string) => clean[k]?.trim().toLowerCase();
  const out: QuizAttribution = {};
  const net = lower('network');
  if (net && NETWORK_SLUG.test(net)) out.network = net;
  else if (CLICK_ID_KEYS.some((k) => clean[k])) out.network = 'unknown';
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
    const v = lower(key);
    if (isCleanUtmSlug(v)) out[key] = v;
  }
  return out;
}

/** Validates against the same fixed option lists as the quiz; returns null for anything the server would reject. */
export function buildQuizEventArgs(sessionId: string, input: QuizEventInput): QuizEventArgs | null {
  if (!isUuidV4(sessionId)) return null;
  const { event } = input;
  let step = 0;
  let answer: string | null = null;
  let country: string | null = null;
  const attribution: QuizAttribution = {};
  if (event === 'quiz_step') {
    step = input.step ?? 0;
    if (!Number.isInteger(step) || step < 1 || step > QUIZ_TOTAL_STEPS) return null;
    if (step === QUIZ_TOTAL_STEPS) {
      country = normalizeCountryCode(input.value);
      if (!country) return null;
    } else {
      const options = QUIZ_CHOICE_STEPS[step - 1]?.options ?? [];
      if (typeof input.value !== 'string' || !options.some((o) => o.value === input.value)) return null;
      answer = input.value;
    }
  } else if (event === 'quiz_started') {
    // Input is already reduced to slugs by collectQuizAttribution; the slug rules are re-applied here as the last gate.
    const given = input.attribution ?? {};
    if (typeof given.network === 'string' && NETWORK_SLUG.test(given.network)) attribution.network = given.network;
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign'] as const) if (isCleanUtmSlug(given[key])) attribution[key] = given[key];
  } else if (event !== 'quiz_completed' && event !== 'quiz_cta_clicked') {
    return null;
  }
  return {
    p_session_id: sessionId, p_event: event, p_step: step, p_answer: answer, p_country_code: country,
    p_network: attribution.network ?? null, p_utm_source: attribution.utm_source ?? null,
    p_utm_medium: attribution.utm_medium ?? null, p_utm_campaign: attribution.utm_campaign ?? null,
  };
}

/** Slugs to attach to quiz_started: saved first-touch params overlaid with whatever the page was opened with. */
export async function collectQuizAttribution(incoming: Record<string, unknown> = {}): Promise<QuizAttribution> {
  try { return deriveQuizAttribution({ ...((await loadAttribution())?.params ?? {}), ...extractAttributionParams(incoming) }); } catch { return {}; }
}

/**
 * Anon-only request: the public key and nothing else (no signed-in user's token, no cookies), so the call can never carry an
 * account identity. Platform request logs still see the usual connection metadata (see the privacy notice draft).
 */
async function defaultTransport(args: QuizEventArgs): Promise<{ error: unknown }> {
  const url = (configOverride?.url ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = (configOverride?.key ?? ((process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim() || (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim())).trim();
  if (!/^https?:\/\//.test(url) || !key) return { error: new Error('unconfigured') };
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`; // legacy JWT anon key; sb_publishable_ keys use apikey only
  const res = await fetch(`${url}/rest/v1/rpc/record_quiz_event`, { method: 'POST', headers, body: JSON.stringify(args), credentials: 'omit' });
  return { error: res.ok ? null : { status: res.status } };
}

async function send(input: QuizEventInput): Promise<void> {
  const key = `${input.event}:${input.step ?? 0}`;
  if (sent.has(key)) return; // the server is idempotent too; this just avoids pointless requests after Back
  // Enablement and opt-out come first: no session id is created or stored for a visitor who is off or opted out.
  if (!isQuizAnalyticsEnabled() || (await isQuizAnalyticsOptedOut())) return;
  const sessionId = await getQuizSessionId();
  if (!isQuizAnalyticsEnabled()) { memorySession = null; await writeRaw(null); return; } // opted out while the id was being resolved
  const args = buildQuizEventArgs(sessionId, input);
  if (!args) return;
  sent.add(key);
  const result = await (transportOverride ?? defaultTransport)(args);
  if (result && result.error) failed = true; // analytics failed: stop trying for the rest of this session
}

/**
 * Records a quiz funnel event. Returns immediately; all work and every error stay inside the detached promise.
 * Safe to call from render-adjacent handlers: it can neither throw nor delay the UI. A no-op unless analytics are enabled.
 */
export function trackQuizEvent(input: QuizEventInput): void {
  try {
    if (!isQuizAnalyticsEnabled()) return;
    queue = queue.then(() => send(input)).catch(() => { failed = true; });
  } catch { /* never surface analytics problems */ }
}
