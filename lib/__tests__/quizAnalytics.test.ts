import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureAttribution } from '@/lib/attribution';
import {
  QUIZ_SESSION_STORAGE_KEY,
  QUIZ_SESSION_TTL_MS,
  __resetQuizAnalytics,
  __setQuizAnalyticsFlag,
  __setQuizEventTransport,
  buildQuizEventArgs,
  clearQuizSession,
  collectQuizAttribution,
  generateSessionId,
  getQuizSessionId,
  isQuizAnalyticsEnabled,
  isUuidV4,
  trackQuizEvent,
  type QuizEventArgs,
} from '@/lib/quizAnalytics';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const SID = '3f2b8c1e-7a4d-4e9b-9c1a-5d6e7f8a9b0c';
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); await new Promise((r) => setImmediate(r)); };

beforeEach(async () => {
  __resetQuizAnalytics();
  await AsyncStorage.clear();
});
afterEach(() => { jest.restoreAllMocks(); });

describe('session id', () => {
  it('generates random RFC 4122 v4 ids that are not derived from the device', () => {
    const a = generateSessionId();
    const b = generateSessionId();
    expect(isUuidV4(a)).toBe(true);
    expect(isUuidV4(b)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('falls back when crypto is unavailable and still yields a v4 id', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try { expect(isUuidV4(generateSessionId())).toBe(true); } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original); else delete (globalThis as { crypto?: unknown }).crypto;
    }
  });

  it('persists locally, is stable across calls and rotates after 30 days', async () => {
    const now = Date.parse('2026-10-23T00:00:00Z');
    const [first, concurrent] = await Promise.all([getQuizSessionId(now), getQuizSessionId(now)]);
    expect(concurrent).toBe(first); // concurrent first calls agree
    expect(await getQuizSessionId(now + 1000)).toBe(first);
    expect(JSON.parse((await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)) as string).id).toBe(first);
    __resetQuizAnalytics(); // simulate a new app launch: only storage survives
    expect(await getQuizSessionId(now + QUIZ_SESSION_TTL_MS - 1)).toBe(first);
    __resetQuizAnalytics();
    const rotated = await getQuizSessionId(now + QUIZ_SESSION_TTL_MS + 1);
    expect(isUuidV4(rotated)).toBe(true);
    expect(rotated).not.toBe(first);
  });

  it('replaces a corrupt or non-v4 stored value and can be cleared', async () => {
    await AsyncStorage.setItem(QUIZ_SESSION_STORAGE_KEY, JSON.stringify({ id: 'not-a-uuid', created_at: new Date().toISOString() }));
    const id = await getQuizSessionId();
    expect(isUuidV4(id)).toBe(true);
    await AsyncStorage.setItem(QUIZ_SESSION_STORAGE_KEY, '{oops');
    __resetQuizAnalytics();
    expect(isUuidV4(await getQuizSessionId())).toBe(true);
    await clearQuizSession();
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('still returns an id for this visit when storage throws', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const id = await getQuizSessionId();
    expect(isUuidV4(id)).toBe(true);
    expect(await getQuizSessionId()).toBe(id);
  });
});

describe('buildQuizEventArgs', () => {
  it('builds exactly the server contract for each event', () => {
    expect(buildQuizEventArgs(SID, { event: 'quiz_started', attribution: { click_id: 'abc123', utm_source: 'fb' } })).toEqual({
      p_session_id: SID, p_event: 'quiz_started', p_step: 0, p_answer: null, p_country_code: null, p_attribution: { click_id: 'abc123', utm_source: 'fb' },
    });
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 2, value: '40_49' })).toEqual({
      p_session_id: SID, p_event: 'quiz_step', p_step: 2, p_answer: '40_49', p_country_code: null, p_attribution: null,
    });
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 4, value: 'se' })).toEqual({
      p_session_id: SID, p_event: 'quiz_step', p_step: 4, p_answer: null, p_country_code: 'SE', p_attribution: null,
    });
    expect(buildQuizEventArgs(SID, { event: 'quiz_completed' })?.p_step).toBe(0);
    expect(buildQuizEventArgs(SID, { event: 'quiz_cta_clicked' })?.p_event).toBe('quiz_cta_clicked');
  });

  it('rejects anything the server would reject: bad enums, free text, wrong step, bad country, bad ids, unknown events', () => {
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 1, value: 'whatever I typed' })).toBeNull();
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 2, value: 'marriage' })).toBeNull(); // answer for another step
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 5, value: 'serious' })).toBeNull();
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 0, value: 'serious' })).toBeNull();
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 4, value: 'ZZ' })).toBeNull();
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 1 })).toBeNull();
    expect(buildQuizEventArgs('not-a-uuid', { event: 'quiz_started' })).toBeNull();
    expect(buildQuizEventArgs(SID, { event: 'signup_completed' as never })).toBeNull();
  });

  it('keeps only allow-listed click params and drops email-like or malformed values', () => {
    const args = buildQuizEventArgs(SID, { event: 'quiz_started', attribution: { click_id: 'abc', sub1: 'x', email: 'a@b.co', evil: 'zzz', sub2: 'a@b.c', utm_source: 'bad value!' } });
    expect(args?.p_attribution).toEqual({ click_id: 'abc', sub1: 'x' });
    expect(buildQuizEventArgs(SID, { event: 'quiz_started', attribution: { evil: 'zzz' } })?.p_attribution).toBeNull();
  });

  it('never includes anything that identifies a person', () => {
    const args = buildQuizEventArgs(SID, { event: 'quiz_started', attribution: { click_id: 'abc' } }) as QuizEventArgs;
    expect(Object.keys(args).sort()).toEqual(['p_answer', 'p_attribution', 'p_country_code', 'p_event', 'p_session_id', 'p_step']);
  });
});

describe('collectQuizAttribution', () => {
  it('overlays page params on saved first-touch params, allow-list only', async () => {
    await captureAttribution({ click_id: 'first', utm_source: 'fb' }, '/quiz');
    expect(await collectQuizAttribution({ click_id: 'second', junk: 'x', q_intent: 'marriage' })).toEqual({ click_id: 'second', utm_source: 'fb' });
  });
  it('is empty without any params', async () => { expect(await collectQuizAttribution({})).toEqual({}); });
});

describe('trackQuizEvent', () => {
  it('returns synchronously (void) before any network work happens, so it cannot delay the UI', async () => {
    let called = false;
    __setQuizEventTransport(async () => { called = true; });
    const ret = trackQuizEvent({ event: 'quiz_started' });
    expect(ret).toBeUndefined();
    expect(called).toBe(false);
    await flush();
    expect(called).toBe(true);
  });

  it('sends one valid event with the local session id and is idempotent per (event, step) in memory', async () => {
    const calls: QuizEventArgs[] = [];
    __setQuizEventTransport(async (a) => { calls.push(a); });
    trackQuizEvent({ event: 'quiz_step', step: 1, value: 'serious' });
    trackQuizEvent({ event: 'quiz_step', step: 1, value: 'marriage' }); // re-answer after Back: not re-sent
    trackQuizEvent({ event: 'quiz_step', step: 2, value: '30_39' });
    await flush();
    expect(calls.map((c) => [c.p_event, c.p_step, c.p_answer])).toEqual([['quiz_step', 1, 'serious'], ['quiz_step', 2, '30_39']]);
    expect(new Set(calls.map((c) => c.p_session_id)).size).toBe(1);
    expect(isUuidV4(calls[0].p_session_id)).toBe(true);
  });

  it('does not send invalid payloads', async () => {
    const transport = jest.fn(async () => undefined);
    __setQuizEventTransport(transport);
    trackQuizEvent({ event: 'quiz_step', step: 1, value: 'free text' });
    await flush();
    expect(transport).not.toHaveBeenCalled();
  });

  it('is silent when the transport rejects or returns an error, and stops sending afterwards', async () => {
    const transport = jest.fn(async () => { throw new Error('network down'); });
    __setQuizEventTransport(transport);
    expect(() => trackQuizEvent({ event: 'quiz_started' })).not.toThrow();
    await flush();
    expect(isQuizAnalyticsEnabled()).toBe(false);
    trackQuizEvent({ event: 'quiz_cta_clicked' });
    await flush();
    expect(transport).toHaveBeenCalledTimes(1);

    __resetQuizAnalytics();
    const errTransport = jest.fn(async () => ({ error: { code: '53400' } }));
    __setQuizEventTransport(errTransport);
    trackQuizEvent({ event: 'quiz_started' });
    await flush();
    trackQuizEvent({ event: 'quiz_completed' });
    await flush();
    expect(errTransport).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when analytics are disabled by env flag', async () => {
    const transport = jest.fn(async () => undefined);
    __setQuizEventTransport(transport);
    for (const v of ['0', 'false', 'OFF']) {
      __setQuizAnalyticsFlag(v);
      expect(isQuizAnalyticsEnabled()).toBe(false);
      trackQuizEvent({ event: 'quiz_started' });
    }
    await flush();
    expect(transport).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull(); // not even a local id is created
  });

  it('honours Do Not Track and Global Privacy Control', async () => {
    const transport = jest.fn(async () => undefined);
    __setQuizEventTransport(transport);
    const g = globalThis as unknown as { navigator?: unknown };
    const prev = g.navigator;
    try {
      g.navigator = { doNotTrack: '1' };
      expect(isQuizAnalyticsEnabled()).toBe(false);
      g.navigator = { doNotTrack: '0', globalPrivacyControl: true };
      expect(isQuizAnalyticsEnabled()).toBe(false);
      trackQuizEvent({ event: 'quiz_started' });
      await flush();
      expect(transport).not.toHaveBeenCalled();
      g.navigator = { doNotTrack: '0' };
      expect(isQuizAnalyticsEnabled()).toBe(true);
    } finally { g.navigator = prev; }
  });

  it('with the default transport and an unconfigured backend, fails silently without throwing', async () => {
    expect(() => trackQuizEvent({ event: 'quiz_started' })).not.toThrow();
    await flush();
    expect(isQuizAnalyticsEnabled()).toBe(false); // unconfigured supabase => treated as failed
  });
});
