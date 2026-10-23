import { extractAttributionParams, loadAttribution } from '@/lib/attribution';
import { normalizeCountryCode } from '@/lib/countries';

type KeyValueStore = { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> };
// Lazily resolved so importing this module does not require the native module at load time.
function nativeStore(): KeyValueStore {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@react-native-async-storage/async-storage');
  return (mod.default ?? mod) as KeyValueStore;
}

/**
 * Prelander quiz state.
 *
 * Answers are NOT sent with an identity while the visitor answers. They are kept on the device
 * (localStorage on web, AsyncStorage on native) for 30 days and handed to signup, which
 * (a) reads them from `q_*` query params or the local copy and (b) puts them in
 * supabase.auth.signUp user metadata under `quiz`. (Separately, anonymous enum-only step events
 * go to public.quiz_events via lib/quizAnalytics.ts; see below.)
 *
 * Funnel events: public.funnel_events is server-written, one row per (user_id, event),
 * and stays signup_completed / doi_confirmed / profile_completed only. Anonymous quiz
 * steps are measured separately by lib/quizAnalytics.ts into public.quiz_events (random
 * session id, allow-listed enums, no IP or user id, 90-day retention). That session id
 * is never carried into signup and is not linked to the account. The local progress below
 * (started_at, completed_at) travels with signup metadata so signups can be segmented by
 * quiz answers after the fact. See docs/operations/quiz-funnel-events.md.
 */
export const QUIZ_STORAGE_KEY = 'humbble.quiz.v1';
export const QUIZ_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type QuizStepId = 'intent' | 'age' | 'timing' | 'country';
export type QuizAnswers = Partial<Record<QuizStepId, string>>;
export type QuizOption = { value: string; label: string };
export type QuizChoiceStep = { id: Exclude<QuizStepId, 'country'>; title: string; subtitle?: string; options: readonly QuizOption[] };

export const QUIZ_CHOICE_STEPS: readonly QuizChoiceStep[] = [
  {
    id: 'intent',
    title: 'What are you hoping to find?',
    subtitle: 'Meet Filipina singles looking for something real. 18+ only.',
    options: [
      { value: 'serious', label: 'A serious relationship' },
      { value: 'marriage', label: 'Marriage' },
      { value: 'friendship_first', label: 'Friendship first' },
    ],
  },
  {
    id: 'age',
    title: 'Your age range',
    options: [
      { value: '18_29', label: '18\u201329' },
      { value: '30_39', label: '30\u201339' },
      { value: '40_49', label: '40\u201349' },
      { value: '50_plus', label: '50 or over' },
    ],
  },
  {
    id: 'timing',
    title: 'When would you like to meet someone?',
    options: [
      { value: 'now', label: "I'm ready now" },
      { value: 'few_months', label: 'In the next few months' },
      { value: 'no_rush', label: 'No rush' },
    ],
  },
];

/** Four steps in order: three one-tap choices, then country (device locale, confirm or change). */
export const QUIZ_STEP_IDS: readonly QuizStepId[] = ['intent', 'age', 'timing', 'country'];
export const QUIZ_TOTAL_STEPS = QUIZ_STEP_IDS.length;

const OPTION_VALUES: Record<string, readonly string[]> = Object.fromEntries(QUIZ_CHOICE_STEPS.map((s) => [s.id, s.options.map((o) => o.value)]));

export function optionLabel(stepId: QuizStepId, value: string | undefined): string | null {
  if (!value) return null;
  return QUIZ_CHOICE_STEPS.find((s) => s.id === stepId)?.options.find((o) => o.value === value)?.label ?? null;
}

/** Keeps only known steps with known option values (or a real ISO country). Never trusts input. */
export function sanitizeQuizAnswers(raw: unknown): QuizAnswers {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: QuizAnswers = {};
  for (const id of ['intent', 'age', 'timing'] as const) {
    const v = src[id];
    if (typeof v === 'string' && OPTION_VALUES[id].includes(v)) out[id] = v;
  }
  const country = normalizeCountryCode(src.country);
  if (country) out.country = country;
  return out;
}

export function isQuizComplete(answers: QuizAnswers): boolean {
  return QUIZ_STEP_IDS.every((id) => Boolean(answers[id]));
}

// --- Reducer (step pointer + answers) ---
export type QuizState = { step: number; answers: QuizAnswers };
export type QuizAction = { type: 'answer'; stepId: QuizStepId; value: string } | { type: 'back' } | { type: 'restart' };
export const INITIAL_QUIZ_STATE: QuizState = { step: 0, answers: {} };

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'answer': {
      if (QUIZ_STEP_IDS[state.step] !== action.stepId) return state;
      const answers = sanitizeQuizAnswers({ ...state.answers, [action.stepId]: action.value });
      if (answers[action.stepId] === undefined) return state; // invalid value: stay on the step
      return { step: Math.min(state.step + 1, QUIZ_TOTAL_STEPS), answers };
    }
    case 'back':
      return { ...state, step: Math.max(0, state.step - 1) };
    case 'restart':
      return INITIAL_QUIZ_STATE;
    default:
      return state;
  }
}

// --- Params passed on to signup ---
const PARAM_PREFIX = 'q_';
export const QUIZ_PARAM_KEYS = QUIZ_STEP_IDS.map((id) => `${PARAM_PREFIX}${id}`);

export function quizToParams(answers: QuizAnswers): Record<string, string> {
  const clean = sanitizeQuizAnswers(answers);
  const out: Record<string, string> = {};
  for (const id of QUIZ_STEP_IDS) { const v = clean[id]; if (v) out[`${PARAM_PREFIX}${id}`] = v; }
  return out;
}

export function quizFromParams(search: string | Record<string, unknown>): QuizAnswers {
  const entries: [string, unknown][] = typeof search === 'string'
    ? Array.from(new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).entries())
    : Object.entries(search);
  const raw: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    const key = k.toLowerCase();
    if (!QUIZ_PARAM_KEYS.includes(key)) continue;
    raw[key.slice(PARAM_PREFIX.length)] = Array.isArray(v) ? v[0] : v;
  }
  return sanitizeQuizAnswers(raw);
}

/**
 * Signup URL params: the visitor's allowlisted ad-click params (so nothing from the click is
 * dropped even if local storage is unavailable) plus the quiz answers as q_* params.
 * `incoming` is whatever the quiz page was opened with; `stored` is the saved attribution.
 */
export function buildSignupParams(answers: QuizAnswers, incoming: Record<string, unknown> = {}, stored: Record<string, string> = {}): Record<string, string> {
  return { ...stored, ...extractAttributionParams(incoming), ...quizToParams(answers) };
}

// --- Local persistence ---
export type StoredQuiz = { answers: QuizAnswers; started_at: string; completed_at: string | null; updated_at: string };

async function readRaw(): Promise<string | null> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.getItem(QUIZ_STORAGE_KEY);
    return await nativeStore().getItem(QUIZ_STORAGE_KEY);
  } catch { return null; }
}
async function writeRaw(value: string | null): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (value === null) window.localStorage.removeItem(QUIZ_STORAGE_KEY); else window.localStorage.setItem(QUIZ_STORAGE_KEY, value);
      return;
    }
    if (value === null) await nativeStore().removeItem(QUIZ_STORAGE_KEY); else await nativeStore().setItem(QUIZ_STORAGE_KEY, value);
  } catch { /* storage unavailable: the quiz still works, answers just are not remembered */ }
}

export async function loadQuiz(now = Date.now()): Promise<StoredQuiz | null> {
  const raw = await readRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredQuiz;
    const started = Date.parse(parsed.started_at);
    if (!Number.isFinite(started) || now - started > QUIZ_TTL_MS) { await writeRaw(null); return null; }
    const answers = sanitizeQuizAnswers(parsed.answers);
    if (!Object.keys(answers).length) return null;
    const completedAt = parsed.completed_at && Number.isFinite(Date.parse(parsed.completed_at)) ? parsed.completed_at : null;
    return { answers, started_at: parsed.started_at, completed_at: isQuizComplete(answers) ? completedAt : null, updated_at: parsed.updated_at };
  } catch { await writeRaw(null); return null; }
}

/** Saves answers; started_at is kept from the first save, completed_at is set once all steps are answered. */
export async function saveQuiz(answers: QuizAnswers, now = Date.now()): Promise<StoredQuiz | null> {
  const clean = sanitizeQuizAnswers(answers);
  if (!Object.keys(clean).length) { await writeRaw(null); return null; }
  const existing = await loadQuiz(now);
  const iso = new Date(now).toISOString();
  const next: StoredQuiz = {
    answers: clean,
    started_at: existing?.started_at ?? iso,
    completed_at: isQuizComplete(clean) ? (existing?.completed_at ?? iso) : null,
    updated_at: iso,
  };
  await writeRaw(JSON.stringify(next));
  return next;
}

export async function clearQuiz(): Promise<void> { await writeRaw(null); }

/**
 * Signup metadata for supabase.auth.signUp options.data.quiz. Params on the URL win over the
 * local copy. Returns null when there is nothing to record. Values come from fixed option
 * lists, so no free text or PII can be included.
 */
export function buildQuizMetadata(params: Record<string, unknown>, stored: StoredQuiz | null): { v: 1; answers: QuizAnswers; completed: boolean; started_at?: string; completed_at?: string } | null {
  const answers = sanitizeQuizAnswers({ ...(stored?.answers ?? {}), ...quizFromParams(params) });
  if (!Object.keys(answers).length) return null;
  const meta: { v: 1; answers: QuizAnswers; completed: boolean; started_at?: string; completed_at?: string } = { v: 1, answers, completed: isQuizComplete(answers) };
  if (stored?.started_at) meta.started_at = stored.started_at;
  if (stored?.completed_at && meta.completed) meta.completed_at = stored.completed_at;
  return meta;
}

/** Convenience for screens: saved ad-click params (empty when none or expired). */
export async function loadStoredAttributionParams(): Promise<Record<string, string>> {
  return (await loadAttribution())?.params ?? {};
}
