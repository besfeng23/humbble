import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureAttribution, readTrackingConsent, setTrackingConsent } from '@/lib/attribution';
import {
  QUIZ_OPTOUT_STORAGE_KEY,
  QUIZ_SESSION_STORAGE_KEY,
  QUIZ_SESSION_TTL_MS,
  __resetQuizAnalytics,
  __setQuizAnalyticsFlag,
  __setQuizEventTransport,
  __setQuizSupabaseConfig,
  buildQuizEventArgs,
  clearQuizSession,
  collectQuizAttribution,
  deriveQuizAttribution,
  generateSessionId,
  getQuizSessionId,
  initQuizAnalytics,
  isCleanUtmSlug,
  isQuizAnalyticsEnabled,
  isQuizAnalyticsFlagOn,
  isQuizAnalyticsOptedOut,
  isUuidV4,
  setQuizAnalyticsOptOut,
  trackQuizEvent,
  type QuizEventArgs,
} from '@/lib/quizAnalytics';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const SID = '3f2b8c1e-7a4d-4e9b-9c1a-5d6e7f8a9b0c';
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); await new Promise((r) => setImmediate(r)); };

beforeEach(async () => {
  __resetQuizAnalytics();
  __setQuizAnalyticsFlag('1'); // analytics are OFF by default; these tests opt in explicitly (see the 'default off' block)
  await AsyncStorage.clear();
  await setTrackingConsent('allowed');
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

  it('persists locally, is stable across calls and is replaced once it is older than 30 days', async () => {
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

const NULLS = { p_network: null, p_utm_source: null, p_utm_medium: null, p_utm_campaign: null };

describe('buildQuizEventArgs', () => {
  it('builds exactly the server contract for each event', () => {
    expect(buildQuizEventArgs(SID, { event: 'quiz_started', attribution: { network: 'unknown', utm_source: 'fb', utm_medium: 'cpc', utm_campaign: 'spring_26' } })).toEqual({
      p_session_id: SID, p_event: 'quiz_started', p_step: 0, p_answer: null, p_country_code: null,
      p_network: 'unknown', p_utm_source: 'fb', p_utm_medium: 'cpc', p_utm_campaign: 'spring_26',
    });
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 2, value: '40_49' })).toEqual({
      p_session_id: SID, p_event: 'quiz_step', p_step: 2, p_answer: '40_49', p_country_code: null, ...NULLS,
    });
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 4, value: 'se' })).toEqual({
      p_session_id: SID, p_event: 'quiz_step', p_step: 4, p_answer: null, p_country_code: 'SE', ...NULLS,
    });
    expect(buildQuizEventArgs(SID, { event: 'quiz_completed' })?.p_step).toBe(0);
    expect(buildQuizEventArgs(SID, { event: 'quiz_cta_clicked' })?.p_event).toBe('quiz_cta_clicked');
  });

  it('rejects anything the server would reject: bad enums, free text, wrong step, bad country, bad ids, unknown events', () => {
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 1, value: 'whatever I typed' })).toBeNull();
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 1, value: 'Juan Dela Cruz 09171234567' })).toBeNull();
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 2, value: 'marriage' })).toBeNull(); // answer for another step
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 5, value: 'serious' })).toBeNull();
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 0, value: 'serious' })).toBeNull();
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 4, value: 'ZZ' })).toBeNull();
    expect(buildQuizEventArgs(SID, { event: 'quiz_step', step: 1 })).toBeNull();
    expect(buildQuizEventArgs('not-a-uuid', { event: 'quiz_started' })).toBeNull();
    expect(buildQuizEventArgs(SID, { event: 'signup_completed' as never })).toBeNull();
  });

  it('last gate: attribution is slug-checked again, and only quiz_started carries any', () => {
    const args = buildQuizEventArgs(SID, { event: 'quiz_started', attribution: { network: 'Bad Net!', utm_source: 'Juan Dela Cruz 09171234567', utm_medium: 'a'.repeat(33), utm_campaign: 'ok-1' } });
    expect(args).toMatchObject({ ...NULLS, p_utm_campaign: 'ok-1' });
    expect(buildQuizEventArgs(SID, { event: 'quiz_completed', attribution: { utm_source: 'fb' } })).toMatchObject(NULLS);
  });

  it('has no field that could identify a person or link to signup attribution (no click id, sub id, JSON blob)', () => {
    const args = buildQuizEventArgs(SID, { event: 'quiz_started', attribution: { utm_source: 'fb' } }) as QuizEventArgs;
    expect(Object.keys(args).sort()).toEqual([
      'p_answer', 'p_country_code', 'p_event', 'p_network', 'p_session_id', 'p_step', 'p_utm_campaign', 'p_utm_medium', 'p_utm_source',
    ]);
    expect(Object.values(args).every((v) => v === null || typeof v === 'string' || typeof v === 'number')).toBe(true);
  });
});

describe('deriveQuizAttribution / collectQuizAttribution (F-01: slugs only, never click ids)', () => {
  it('keeps clean lower-cased utm slugs and a named network, and drops everything else', () => {
    expect(deriveQuizAttribution({ utm_source: 'FB', utm_medium: 'cpc', utm_campaign: 'Spring_26', network: 'Unknown', junk: 'x', q_intent: 'marriage' }))
      .toEqual({ network: 'unknown', utm_source: 'fb', utm_medium: 'cpc', utm_campaign: 'spring_26' });
    expect(deriveQuizAttribution({})).toEqual({});
  });

  it('never forwards a click id or sub id: a click id only flips the network to the generic "unknown" slug', () => {
    const out = deriveQuizAttribution({ click_id: 'abc123', sub1: 'zzz', aff_sub: 'q', subid: '77', utm_source: 'fb' });
    expect(out).toEqual({ network: 'unknown', utm_source: 'fb' });
    expect(JSON.stringify(out)).not.toMatch(/abc123|zzz|77/);
    expect(deriveQuizAttribution({ sub1: 'only-a-sub' })).toEqual({});
  });

  it('rejects PII-looking, hash-like and oversized utm values', () => {
    expect(isCleanUtmSlug('spring_26')).toBe(true);
    expect(isCleanUtmSlug('Juan Dela Cruz 09171234567')).toBe(false);
    expect(isCleanUtmSlug('09171234567')).toBe(false); // phone-like
    expect(isCleanUtmSlug('d41d8cd98f00b204e9800998ecf8427e')).toBe(false); // hash-like
    expect(isCleanUtmSlug('a'.repeat(33))).toBe(false);
    expect(isCleanUtmSlug('')).toBe(false);
    expect(deriveQuizAttribution({ utm_source: 'a@b.co', utm_campaign: '2026102312345' })).toEqual({});
  });

  it('overlays page params on saved first-touch params', async () => {
    await captureAttribution({ click_id: 'first', utm_source: 'fb', utm_campaign: 'old' }, '/quiz');
    expect(await collectQuizAttribution({ click_id: 'second', utm_campaign: 'new', junk: 'x' })).toEqual({ network: 'unknown', utm_source: 'fb', utm_campaign: 'new' });
  });
  it('is empty without any params', async () => { expect(await collectQuizAttribution({})).toEqual({}); });
});

describe('Sincera consent gate', () => {
  it('stops events and prevents a quiz session even if the analytics flag is on', async () => {
    await setTrackingConsent('denied');
    __resetQuizAnalytics();
    __setQuizAnalyticsFlag('1');
    const transport = jest.fn(async () => undefined);
    __setQuizEventTransport(transport);
    expect(await readTrackingConsent()).toBe('denied');
    expect((await initQuizAnalytics()).active).toBe(false);
    trackQuizEvent({ event: 'quiz_started' });
    await flush();
    expect(transport).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull();
    expect(await collectQuizAttribution({utm_source:'fb'})).toEqual({});
  });
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
    __setQuizAnalyticsFlag('1');
    const errTransport = jest.fn(async () => ({ error: { code: '53400' } }));
    __setQuizEventTransport(errTransport);
    trackQuizEvent({ event: 'quiz_started' });
    await flush();
    trackQuizEvent({ event: 'quiz_completed' });
    await flush();
    expect(errTransport).toHaveBeenCalledTimes(1);
  });

  it('sends nothing, and stores nothing, when the flag is unset or anything but 1/true/on', async () => {
    const transport = jest.fn(async () => undefined);
    __setQuizEventTransport(transport);
    for (const v of [null, '', '0', 'false', 'off', 'yes', 'enabled']) {
      __setQuizAnalyticsFlag(v);
      expect(isQuizAnalyticsFlagOn()).toBe(false);
      expect(isQuizAnalyticsEnabled()).toBe(false);
      trackQuizEvent({ event: 'quiz_started' });
    }
    await flush();
    expect(transport).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull(); // not even a local id is created
    for (const v of ['1', 'true', 'ON', ' on ']) { __setQuizAnalyticsFlag(v); expect(isQuizAnalyticsEnabled()).toBe(true); }
  });

  it('is OFF by default: with no flag in the environment nothing is sent or stored (F-05)', async () => {
    delete process.env.EXPO_PUBLIC_QUIZ_ANALYTICS;
    __setQuizAnalyticsFlag(null);
    const transport = jest.fn(async () => undefined);
    __setQuizEventTransport(transport);
    expect(isQuizAnalyticsEnabled()).toBe(false);
    trackQuizEvent({ event: 'quiz_started' });
    trackQuizEvent({ event: 'quiz_step', step: 1, value: 'serious' });
    await flush();
    expect(transport).not.toHaveBeenCalled();
    expect((await AsyncStorage.getAllKeys()).filter(key => key !== 'sincera.optional_tracking_consent.v1')).toEqual([]);
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
    __setQuizSupabaseConfig({ url: '', key: '' });
    expect(() => trackQuizEvent({ event: 'quiz_started' })).not.toThrow();
    await flush();
    expect(isQuizAnalyticsEnabled()).toBe(false); // unconfigured => treated as failed
  });
});

describe('default transport (F-09: anon-only request)', () => {
  afterEach(() => { delete (globalThis as { fetch?: unknown }).fetch; });

  it('POSTs the RPC with only the public key: no user session token, no cookies, only the documented fields', async () => {
    __setQuizSupabaseConfig({ url: 'https://abc.supabase.co/', key: 'sb_publishable_TESTKEY' });
    // A signed-in user's token must never be picked up: park one in storage and check it is not used.
    await AsyncStorage.setItem('sb-abc-auth-token', JSON.stringify({ access_token: 'USER_JWT' }));
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }));
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    trackQuizEvent({ event: 'quiz_started', attribution: { utm_source: 'fb' } });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string>; body: string; credentials: string }];
    expect(url).toBe('https://abc.supabase.co/rest/v1/rpc/record_quiz_event');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(init.headers).toEqual({ apikey: 'sb_publishable_TESTKEY', 'Content-Type': 'application/json' });
    expect(JSON.stringify(init)).not.toContain('USER_JWT');
    expect(Object.keys(JSON.parse(init.body)).sort()).toEqual([
      'p_answer', 'p_country_code', 'p_event', 'p_network', 'p_session_id', 'p_step', 'p_utm_campaign', 'p_utm_medium', 'p_utm_source',
    ]);
    expect(isQuizAnalyticsEnabled()).toBe(true);
  });

  it('sends the legacy JWT anon key as Bearer too, and an HTTP error trips the breaker silently', async () => {
    __setQuizSupabaseConfig({ url: 'http://127.0.0.1:54321', key: 'eyJhbGciOi.anon.key' });
    const fetchMock = jest.fn(async () => ({ ok: false, status: 429 }));
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    trackQuizEvent({ event: 'quiz_started' });
    await flush();
    const init = (fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }])[1];
    expect(init.headers.Authorization).toBe('Bearer eyJhbGciOi.anon.key');
    expect(isQuizAnalyticsEnabled()).toBe(false);
  });
});

describe('opt-out (F-05: respected on web and native)', () => {
  it('stores the opt-out, deletes the local session id and stops everything, including already-queued events', async () => {
    const transport = jest.fn(async () => undefined);
    __setQuizEventTransport(transport);
    trackQuizEvent({ event: 'quiz_started' });
    await flush();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).not.toBeNull();

    await setQuizAnalyticsOptOut(true);
    expect(await AsyncStorage.getItem(QUIZ_OPTOUT_STORAGE_KEY)).toBe('1');
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull();
    expect(isQuizAnalyticsEnabled()).toBe(false);
    trackQuizEvent({ event: 'quiz_cta_clicked' });
    await flush();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('is honoured after an app restart: a stored opt-out blocks sends and no session id is ever created', async () => {
    await AsyncStorage.setItem(QUIZ_OPTOUT_STORAGE_KEY, '1');
    __resetQuizAnalytics();
    __setQuizAnalyticsFlag('1');
    const transport = jest.fn(async () => undefined);
    __setQuizEventTransport(transport);
    expect(await isQuizAnalyticsOptedOut()).toBe(true);
    trackQuizEvent({ event: 'quiz_started' });
    await flush();
    expect(transport).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('is checked from storage before any id exists even when the in-memory state has not been read yet', async () => {
    await AsyncStorage.setItem(QUIZ_OPTOUT_STORAGE_KEY, '1');
    const transport = jest.fn(async () => undefined);
    __setQuizEventTransport(transport);
    trackQuizEvent({ event: 'quiz_started' }); // sync gate passes (opt-out not read yet), the async gate must stop it
    await flush();
    expect(transport).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('can be reversed, which only removes the stored opt-out', async () => {
    await setQuizAnalyticsOptOut(true);
    await setQuizAnalyticsOptOut(false);
    expect(await AsyncStorage.getItem(QUIZ_OPTOUT_STORAGE_KEY)).toBeNull();
    expect(isQuizAnalyticsEnabled()).toBe(true);
  });
});

describe('initQuizAnalytics (F-10: session id lifetime is enforced on this device)', () => {
  const now = Date.parse('2026-10-23T00:00:00Z');
  const seed = (ageMs: number) => AsyncStorage.setItem(QUIZ_SESSION_STORAGE_KEY, JSON.stringify({ id: SID, created_at: new Date(now - ageMs).toISOString() }));

  it('keeps a fresh id, deletes an expired one, and never creates one', async () => {
    await seed(QUIZ_SESSION_TTL_MS - 1000);
    expect(await initQuizAnalytics(now)).toEqual({ active: true });
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).not.toBeNull();
    await seed(QUIZ_SESSION_TTL_MS + 1000);
    await initQuizAnalytics(now);
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull();
    await initQuizAnalytics(now);
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull(); // nothing created
  });

  it('deletes a leftover id (and reports inactive) when analytics are switched off, opted out, or the id is corrupt', async () => {
    await seed(1000);
    __setQuizAnalyticsFlag(null);
    expect(await initQuizAnalytics(now)).toEqual({ active: false });
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull();

    __setQuizAnalyticsFlag('1');
    await seed(1000);
    await AsyncStorage.setItem(QUIZ_OPTOUT_STORAGE_KEY, '1');
    __resetQuizAnalytics(); __setQuizAnalyticsFlag('1');
    expect(await initQuizAnalytics(now)).toEqual({ active: false });
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull();

    await AsyncStorage.setItem(QUIZ_OPTOUT_STORAGE_KEY, '0');
    __resetQuizAnalytics(); __setQuizAnalyticsFlag('1');
    await AsyncStorage.setItem(QUIZ_SESSION_STORAGE_KEY, '{oops');
    expect(await initQuizAnalytics(now)).toEqual({ active: true });
    expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('never throws when storage fails', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('boom'));
    try { await expect(initQuizAnalytics(now)).resolves.toBeDefined(); } finally { (AsyncStorage.getItem as jest.Mock).mockReset(); }
  });
});
