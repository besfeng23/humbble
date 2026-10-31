import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureAttribution, setTrackingConsent } from '@/lib/attribution';
import {
  INITIAL_QUIZ_STATE,
  QUIZ_STORAGE_KEY,
  QUIZ_TTL_MS,
  buildQuizMetadata,
  buildSignupParams,
  isQuizComplete,
  loadQuiz,
  quizFromParams,
  quizReducer,
  quizToParams,
  sanitizeQuizAnswers,
  saveQuiz,
  type QuizState,
} from '@/lib/quiz';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const FULL = { intent: 'marriage', age: '40_49', timing: 'now', country: 'SE' };

describe('quiz reducer', () => {
  it('advances one step per valid answer and reaches the result after four', () => {
    let s: QuizState = INITIAL_QUIZ_STATE;
    s = quizReducer(s, { type: 'answer', stepId: 'intent', value: 'marriage' });
    s = quizReducer(s, { type: 'answer', stepId: 'age', value: '40_49' });
    s = quizReducer(s, { type: 'answer', stepId: 'timing', value: 'now' });
    expect(s.step).toBe(3);
    s = quizReducer(s, { type: 'answer', stepId: 'country', value: 'se' });
    expect(s).toEqual({ step: 4, answers: FULL });
  });
  it('ignores answers for the wrong step or with unknown values', () => {
    expect(quizReducer(INITIAL_QUIZ_STATE, { type: 'answer', stepId: 'age', value: '40_49' })).toBe(INITIAL_QUIZ_STATE);
    expect(quizReducer(INITIAL_QUIZ_STATE, { type: 'answer', stepId: 'intent', value: 'hookup' })).toBe(INITIAL_QUIZ_STATE);
    const atCountry: QuizState = { step: 3, answers: { intent: 'serious' } };
    expect(quizReducer(atCountry, { type: 'answer', stepId: 'country', value: 'ZZ' })).toBe(atCountry);
  });
  it('goes back without losing answers, never below step 0, and restarts cleanly', () => {
    const s: QuizState = { step: 2, answers: { intent: 'serious', age: '30_39' } };
    expect(quizReducer(s, { type: 'back' })).toEqual({ step: 1, answers: s.answers });
    expect(quizReducer(INITIAL_QUIZ_STATE, { type: 'back' }).step).toBe(0);
    expect(quizReducer(s, { type: 'restart' })).toEqual(INITIAL_QUIZ_STATE);
  });
  it('re-answering a step overwrites the earlier answer', () => {
    let s: QuizState = quizReducer(INITIAL_QUIZ_STATE, { type: 'answer', stepId: 'intent', value: 'serious' });
    s = quizReducer(s, { type: 'back' });
    s = quizReducer(s, { type: 'answer', stepId: 'intent', value: 'friendship_first' });
    expect(s.answers.intent).toBe('friendship_first');
  });
});

describe('quiz params', () => {
  it('round-trips answers through q_* params', () => {
    const params = quizToParams(FULL);
    expect(params).toEqual({ q_intent: 'marriage', q_age: '40_49', q_timing: 'now', q_country: 'SE' });
    expect(quizFromParams(params)).toEqual(FULL);
    expect(quizFromParams('?q_intent=serious&q_age=nope&utm_source=fb')).toEqual({ intent: 'serious' });
  });
  it('drops unknown or tampered values', () => {
    expect(sanitizeQuizAnswers({ intent: 'x', age: 5, timing: 'now', country: 'zz', extra: 'me@x.com' })).toEqual({ timing: 'now' });
    expect(isQuizComplete(FULL)).toBe(true);
    expect(isQuizComplete({ intent: 'serious' })).toBe(false);
  });
  it('carries ad-click params to signup alongside the answers and never drops them', () => {
    const out = buildSignupParams(FULL, { click_id: 'abc', utm_source: 'fb', email: 'a@b.c', foo: 'bar' }, { cid: 'stored1', click_id: 'older' });
    expect(out).toEqual({ cid: 'stored1', click_id: 'abc', utm_source: 'fb', q_intent: 'marriage', q_age: '40_49', q_timing: 'now', q_country: 'SE' });
  });
  it('still carries stored attribution when the quiz URL has no params', () => {
    expect(buildSignupParams({ intent: 'serious' }, {}, { aff_click_id: 'z9' })).toEqual({ aff_click_id: 'z9', q_intent: 'serious' });
  });
});

describe('quiz persistence and attribution coexistence', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('saves answers locally, keeps started_at, and sets completed_at once complete', async () => {
    const t0 = Date.parse('2026-10-23T00:00:00Z');
    await saveQuiz({ intent: 'serious' }, t0);
    const partial = await loadQuiz(t0 + 1);
    expect(partial).toMatchObject({ answers: { intent: 'serious' }, completed_at: null, started_at: new Date(t0).toISOString() });
    await saveQuiz(FULL, t0 + 5000);
    expect(await loadQuiz(t0 + 6000)).toMatchObject({ answers: FULL, started_at: new Date(t0).toISOString(), completed_at: new Date(t0 + 5000).toISOString() });
  });
  it('expires after 30 days and survives corrupt storage', async () => {
    const t0 = Date.parse('2026-10-01T00:00:00Z');
    await saveQuiz(FULL, t0);
    expect(await loadQuiz(t0 + QUIZ_TTL_MS + 1)).toBeNull();
    await AsyncStorage.setItem(QUIZ_STORAGE_KEY, '{not json');
    expect(await loadQuiz()).toBeNull();
  });
  it('does not touch the attribution record', async () => {
    const t0 = Date.parse('2026-10-23T00:00:00Z');
    await setTrackingConsent('allowed');
    await captureAttribution({ click_id: 'first', utm_source: 'fb' }, '/quiz', t0);
    await saveQuiz(FULL, t0 + 10);
    const attr = JSON.parse((await AsyncStorage.getItem('humbble.attribution.v1')) as string);
    expect(attr.params).toEqual({ click_id: 'first', utm_source: 'fb' });
    expect(attr.landing_path).toBe('/quiz');
  });
  it('builds signup metadata from params over local copy, with no free text', async () => {
    const t0 = Date.parse('2026-10-23T00:00:00Z');
    const stored = await saveQuiz({ intent: 'serious', age: '30_39' }, t0);
    const meta = buildQuizMetadata({ q_intent: 'marriage' }, stored);
    expect(meta).toEqual({ v: 1, answers: { intent: 'marriage', age: '30_39' }, completed: false, started_at: new Date(t0).toISOString() });
    expect(buildQuizMetadata({}, null)).toBeNull();
    expect(buildQuizMetadata({ q_intent: 'not-real' }, null)).toBeNull();
  });
});
