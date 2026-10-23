import { extractAttributionParams, loadAttribution } from '@/lib/attribution';
import { normalizeCountryCode } from '@/lib/countries';
import { QUIZ_CHOICE_STEPS, QUIZ_TOTAL_STEPS } from '@/lib/quiz';

/**
 * Anonymous quiz funnel events (quiz_started, quiz_step, quiz_completed, quiz_cta_clicked).
 *
 * Server side: public.record_quiz_event (migration 20261023000070) writes public.quiz_events. Rows hold only a random
 * session UUID, the event name, the step number, ONE allow-listed answer (or an ISO country on step 4) and the visitor's
 * allow-listed ad-click params. No user id, IP, user agent, free text or URL, and the session id is never linked to an
 * account (it is NOT passed to signup). See docs/operations/quiz-funnel-events.md.
 *
 * Client contract:
 *  - fire-and-forget: trackQuizEvent returns void synchronously, never throws, never awaits network on the UI path;
 *  - every failure is silent, and after the first failed request no further events are sent in this page/app session;
 *  - nothing is sent when analytics are off: EXPO_PUBLIC_QUIZ_ANALYTICS=0|false|off, browser Do-Not-Track / Global Privacy
 *    Control, or Supabase not configured;
 *  - the session id is random (NOT a fingerprint), stored locally only, and rotated after 30 days.
 */
export const QUIZ_SESSION_STORAGE_KEY = 'humbble.quiz.session.v1';
export const QUIZ_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type QuizEventName = 'quiz_started' | 'quiz_step' | 'quiz_completed' | 'quiz_cta_clicked';
export type QuizEventInput = { event: QuizEventName; step?: number; value?: string; attribution?: Record<string, string> };
export type QuizEventArgs = {
  p_session_id: string;
  p_event: QuizEventName;
  p_step: number;
  p_answer: string | null;
  p_country_code: string | null;
  p_attribution: Record<string, string> | null;
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

async function readRaw(): Promise<string | null> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.getItem(QUIZ_SESSION_STORAGE_KEY);
    return await nativeStore().getItem(QUIZ_SESSION_STORAGE_KEY);
  } catch { return null; }
}
async function writeRaw(value: string | null): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (value === null) window.localStorage.removeItem(QUIZ_SESSION_STORAGE_KEY); else window.localStorage.setItem(QUIZ_SESSION_STORAGE_KEY, value);
      return;
    }
    if (value === null) await nativeStore().removeItem(QUIZ_SESSION_STORAGE_KEY); else await nativeStore().setItem(QUIZ_SESSION_STORAGE_KEY, value);
  } catch { /* storage unavailable: the in-memory id below still groups events for this visit */ }
}

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

// --- Enablement / circuit breaker ---
let failed = false;
let transportOverride: QuizEventTransport | null = null;
let flagOverride: string | null = null;
const sent = new Set<string>();
let queue: Promise<void> = Promise.resolve(); // events are sent one at a time, in order

/** Test hooks. */
export function __setQuizEventTransport(t: QuizEventTransport | null): void { transportOverride = t; }
export function __setQuizAnalyticsFlag(v: string | null): void { flagOverride = v; } // Expo inlines EXPO_PUBLIC_* at build time
export function __resetQuizAnalytics(): void { failed = false; transportOverride = null; flagOverride = null; memorySession = null; sessionInFlight = null; queue = Promise.resolve(); sent.clear(); }

export function isQuizAnalyticsEnabled(): boolean {
  if (failed) return false;
  const flag = (flagOverride ?? process.env.EXPO_PUBLIC_QUIZ_ANALYTICS ?? '').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  try {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }) : null;
    if (nav && (nav.doNotTrack === '1' || nav.doNotTrack === 'yes' || nav.msDoNotTrack === '1' || nav.globalPrivacyControl === true)) return false;
  } catch { /* ignore */ }
  return true;
}

// --- Payload ---
/** Validates against the same fixed option lists as the quiz; returns null for anything the server would reject. */
export function buildQuizEventArgs(sessionId: string, input: QuizEventInput): QuizEventArgs | null {
  if (!isUuidV4(sessionId)) return null;
  const { event } = input;
  let step = 0;
  let answer: string | null = null;
  let country: string | null = null;
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
  } else if (event !== 'quiz_started' && event !== 'quiz_completed' && event !== 'quiz_cta_clicked') {
    return null;
  }
  const attribution = input.attribution && Object.keys(input.attribution).length ? extractAttributionParams(input.attribution) : {};
  return {
    p_session_id: sessionId, p_event: event, p_step: step, p_answer: answer, p_country_code: country,
    p_attribution: Object.keys(attribution).length ? attribution : null,
  };
}

/** Ad-click params to attach to quiz_started: saved first-touch params overlaid with whatever the page was opened with. */
export async function collectQuizAttribution(incoming: Record<string, unknown> = {}): Promise<Record<string, string>> {
  try { return { ...((await loadAttribution())?.params ?? {}), ...extractAttributionParams(incoming) }; } catch { return {}; }
}

async function defaultTransport(args: QuizEventArgs): Promise<{ error: unknown }> {
  // Lazy: keeps the supabase client (and its native deps) out of module load.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/lib/supabase') as typeof import('@/lib/supabase');
  if (!mod.isSupabaseConfigured) return { error: new Error('unconfigured') };
  const { error } = await mod.supabase.rpc('record_quiz_event', args);
  return { error };
}

async function send(input: QuizEventInput): Promise<void> {
  const key = `${input.event}:${input.step ?? 0}`;
  if (sent.has(key)) return; // the server is idempotent too; this just avoids pointless requests after Back
  sent.add(key);
  const sessionId = await getQuizSessionId();
  if (!isQuizAnalyticsEnabled()) return;
  const args = buildQuizEventArgs(sessionId, input);
  if (!args) return;
  const result = await (transportOverride ?? defaultTransport)(args);
  if (result && result.error) failed = true; // analytics failed: stop trying for the rest of this session
}

/**
 * Records a quiz funnel event. Returns immediately; all work and every error stay inside the detached promise.
 * Safe to call from render-adjacent handlers: it can neither throw nor delay the UI.
 */
export function trackQuizEvent(input: QuizEventInput): void {
  try {
    if (!isQuizAnalyticsEnabled()) return;
    queue = queue.then(() => send(input)).catch(() => { failed = true; });
  } catch { /* never surface analytics problems */ }
}
