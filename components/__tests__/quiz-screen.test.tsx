import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QuizScreen from '@/app/(public)/quiz';
import { LANDING_TRUST_POINTS } from '@/app/(public)/index';
import { textContent } from '../test-utils/textContent';
import { QUIZ_OPTOUT_STORAGE_KEY, QUIZ_SESSION_STORAGE_KEY, __resetQuizAnalytics, __setQuizAnalyticsFlag, __setQuizEventTransport, isUuidV4, type QuizEventArgs } from '@/lib/quizAnalytics';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }), useLocalSearchParams: () => mockParams, Redirect: () => null }));
jest.mock('@/lib/AuthProvider', () => ({ useAuth: () => ({ session: null }) }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/constants/Motion', () => ({ MotionTransforms: { pressedOpacity: 0.85 }, getMotionConfig: () => ({ pressedScale: 1 }), useReducedMotion: () => true }));
jest.mock('@/lib/locale', () => ({ deviceLocale: () => 'sv-SE', countryHintFromLocale: (l: string) => (/[-_]([A-Za-z]{2})$/.exec(l) ?? [])[1] ?? null }));

const mounted: renderer.ReactTestRenderer[] = [];
const visible = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text).map((n) => textContent(n.children)).join(' | ');
async function tap(tree: renderer.ReactTestRenderer, testID: string) {
  const node = tree.root.findAll((n) => n.props.testID === testID && typeof n.props.onPress === 'function')[0];
  await act(async () => { node.props.onPress({}); await Promise.resolve(); });
}
async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<QuizScreen />); await Promise.resolve(); });
  mounted.push(tree);
  return tree;
}

beforeEach(async () => { mockPush.mockClear(); mockReplace.mockClear(); mockParams = {}; __resetQuizAnalytics(); await AsyncStorage.clear(); });
afterEach(async () => { await act(async () => { mounted.splice(0).forEach((t) => t.unmount()); await Promise.resolve(); }); });

describe('quiz prelander screen', () => {
  it('walks four one-tap steps, shows "n of 4" progress, then a single signup CTA carrying answers and click params', async () => {
    mockParams = { click_id: 'abc123', utm_source: 'fb' };
    const tree = await mount();
    expect(visible(tree)).toContain('1 of 4');
    await tap(tree, 'quiz-option-intent-marriage');
    expect(visible(tree)).toContain('2 of 4');
    await tap(tree, 'quiz-option-age-40_49');
    expect(visible(tree)).toContain('3 of 4');
    await tap(tree, 'quiz-option-timing-now');
    expect(visible(tree)).toContain('4 of 4');
    expect(visible(tree)).toContain('Sweden');
    await tap(tree, 'quiz-option-country-SE');

    const result = visible(tree);
    expect(tree.root.findAllByProps({ testID: 'quiz-result' }).length).toBeGreaterThan(0);
    expect(result).toContain('Marriage');
    expect(result).not.toMatch(/\d+\s*%/);
    const actions = new Set(tree.root.findAll((n) => n.props.accessibilityRole === 'button' && n.props.testID).map((n) => n.props.testID));
    expect([...actions].sort()).toEqual(['quiz-back', 'quiz-signup-cta']); // back + exactly one forward CTA

    await tap(tree, 'quiz-signup-cta');
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/auth/signup',
      params: { click_id: 'abc123', utm_source: 'fb', q_intent: 'marriage', q_age: '40_49', q_timing: 'now', q_country: 'SE' },
    });
    expect(JSON.parse((await AsyncStorage.getItem('humbble.quiz.v1')) as string).answers).toEqual({ intent: 'marriage', age: '40_49', timing: 'now', country: 'SE' });
    expect(JSON.parse((await AsyncStorage.getItem('humbble.attribution.v1')) as string).params).toEqual({ click_id: 'abc123', utm_source: 'fb' });
  });

  it('goes back one step and keeps earlier answers', async () => {
    const tree = await mount();
    await tap(tree, 'quiz-option-intent-serious');
    await tap(tree, 'quiz-back');
    expect(visible(tree)).toContain('1 of 4');
    await tap(tree, 'quiz-option-intent-friendship_first');
    await tap(tree, 'quiz-option-age-30_39');
    expect(visible(tree)).toContain('3 of 4');
  });

  it('keeps every screen sparse and makes no verification, member-count, match, testimonial or explicit claims', async () => {
    const tree = await mount();
    const screens: string[] = [];
    const steps = ['quiz-option-intent-serious', 'quiz-option-age-30_39', 'quiz-option-timing-no_rush', 'quiz-option-country-SE'];
    for (const id of steps) {
      screens.push(visible(tree));
      await tap(tree, id);
    }
    screens.push(visible(tree));
    expect(screens).toHaveLength(5);
    for (const s of screens) {
      expect(s.split(' | ').length).toBeLessThanOrEqual(7);
      expect(s).not.toMatch(/verif|id.?check|liveness|biometric|\d[\d,]*\+?\s*(members|users|singles|couples|women|matches)|testimonial|guarantee|perfect match|we found|matches? (for|near) you|sexy|hot\b|hookup|sugar/i);
    }
    expect(screens[0]).toMatch(/18\+ only/);
    expect(screens[4]).toMatch(/18\+ only/);
    // The result never shows profile cards or photos.
    expect(tree.root.findAll((n) => /avatar|profile-card|people-card|image/i.test(String(n.props.testID ?? '')))).toHaveLength(0);
  });

  it('is reachable from the truthful landing list context (no new trust claims added there)', () => {
    expect(LANDING_TRUST_POINTS.join(' ')).not.toMatch(/verif/i);
  });

  describe('anonymous funnel events', () => {
    const settle = async () => { await act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); await new Promise((r) => setImmediate(r)); }); };
    const noticeNodes = (tree: renderer.ReactTestRenderer) => tree.root.findAll((n) => n.props.testID === 'quiz-analytics-notice');
    beforeEach(() => { __setQuizAnalyticsFlag('1'); }); // analytics are OFF by default; this block opts in like a build with EXPO_PUBLIC_QUIZ_ANALYTICS=1

    it('fires started, four steps, completed and cta once each, with enums only and no signup/account data', async () => {
      const calls: QuizEventArgs[] = [];
      __setQuizEventTransport(async (a) => { calls.push(a); });
      mockParams = { click_id: 'abc123', sub1: 'zzz', utm_source: 'FB', utm_campaign: 'Spring_26', q_intent: 'marriage', email: 'a@b.co' };
      const tree = await mount();
      await settle();
      for (const id of ['quiz-option-intent-marriage', 'quiz-option-age-40_49', 'quiz-option-timing-now', 'quiz-option-country-SE']) await tap(tree, id);
      await tap(tree, 'quiz-signup-cta');
      await settle();
      expect(calls.map((c) => [c.p_event, c.p_step, c.p_answer, c.p_country_code])).toEqual([
        ['quiz_started', 0, null, null],
        ['quiz_step', 1, 'marriage', null],
        ['quiz_step', 2, '40_49', null],
        ['quiz_step', 3, 'now', null],
        ['quiz_step', 4, null, 'SE'],
        ['quiz_completed', 0, null, null],
        ['quiz_cta_clicked', 0, null, null],
      ]);
      // Slugs only: the click id and sub id never leave the device (F-01); a click id just marks the network as 'unknown'.
      expect([calls[0].p_network, calls[0].p_utm_source, calls[0].p_utm_medium, calls[0].p_utm_campaign]).toEqual(['unknown', 'fb', null, 'spring_26']);
      expect(JSON.stringify(calls)).not.toMatch(/abc123|zzz|a@b\.co/);
      expect(calls.slice(1).every((c) => c.p_network === null && c.p_utm_source === null && c.p_utm_campaign === null)).toBe(true);
      expect(new Set(calls.map((c) => c.p_session_id)).size).toBe(1);
      expect(isUuidV4(calls[0].p_session_id)).toBe(true);
      // The anonymous session id is NOT linked to the account: it is not passed to signup.
      expect(JSON.stringify(mockPush.mock.calls)).not.toContain(calls[0].p_session_id);
    });

    it('never blocks or breaks the quiz when analytics fail, and the result/CTA still work', async () => {
      __setQuizEventTransport(async () => { throw new Error('offline'); });
      const tree = await mount();
      for (const id of ['quiz-option-intent-serious', 'quiz-option-age-30_39', 'quiz-option-timing-no_rush', 'quiz-option-country-SE']) await tap(tree, id);
      expect(tree.root.findAllByProps({ testID: 'quiz-result' }).length).toBeGreaterThan(0);
      await tap(tree, 'quiz-signup-cta');
      expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it('is OFF by default: no events, no stored id, no notice, and the quiz is unchanged (F-05)', async () => {
      __setQuizAnalyticsFlag(null);
      const transport = jest.fn(async () => undefined);
      __setQuizEventTransport(transport);
      const tree = await mount();
      await tap(tree, 'quiz-option-intent-serious');
      await settle();
      expect(transport).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull();
      expect(noticeNodes(tree)).toHaveLength(0);
      expect(visible(tree)).not.toMatch(/Opt out|anonymous quiz/i);
      expect(visible(tree)).toContain('2 of 4');
    });

    it('shows a small notice with a Privacy link and an Opt out control ONLY when analytics are enabled', async () => {
      __setQuizEventTransport(async () => undefined);
      const tree = await mount();
      await settle();
      expect(noticeNodes(tree).length).toBeGreaterThan(0);
      expect(visible(tree)).toMatch(/anonymous quiz steps/i);
      await tap(tree, 'quiz-analytics-privacy');
      expect(mockPush).toHaveBeenCalledWith('/(public)/legal/privacy-notice');
    });

    it('does not show the notice (and sends nothing) when the visitor already opted out', async () => {
      await AsyncStorage.setItem(QUIZ_OPTOUT_STORAGE_KEY, '1');
      const transport = jest.fn(async () => undefined);
      __setQuizEventTransport(transport);
      const tree = await mount();
      await tap(tree, 'quiz-option-intent-serious');
      await settle();
      expect(noticeNodes(tree)).toHaveLength(0);
      expect(transport).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull();
    });

    it('Opt out hides the notice, stores the opt-out, deletes the id and stops further events', async () => {
      const calls: QuizEventArgs[] = [];
      __setQuizEventTransport(async (a) => { calls.push(a); });
      const tree = await mount();
      await settle();
      expect(calls.map((c) => c.p_event)).toEqual(['quiz_started']);
      expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).not.toBeNull();
      await tap(tree, 'quiz-analytics-optout');
      await settle();
      expect(noticeNodes(tree)).toHaveLength(0);
      expect(await AsyncStorage.getItem(QUIZ_OPTOUT_STORAGE_KEY)).toBe('1');
      expect(await AsyncStorage.getItem(QUIZ_SESSION_STORAGE_KEY)).toBeNull();
      await tap(tree, 'quiz-option-intent-serious');
      await settle();
      expect(calls).toHaveLength(1);
      expect(visible(tree)).toContain('2 of 4'); // the quiz itself is unaffected
      // and it is remembered on the next visit
      await act(async () => { mounted.splice(0).forEach((t) => t.unmount()); await Promise.resolve(); });
      __resetQuizAnalytics(); __setQuizAnalyticsFlag('1'); __setQuizEventTransport(async (a) => { calls.push(a); });
      const again = await mount();
      await settle();
      expect(noticeNodes(again)).toHaveLength(0);
      expect(calls).toHaveLength(1);
    });

    it('removes an expired local session id when the quiz opens', async () => {
      await AsyncStorage.setItem(QUIZ_SESSION_STORAGE_KEY, JSON.stringify({ id: '3f2b8c1e-7a4d-4e9b-9c1a-5d6e7f8a9b0c', created_at: new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString() }));
      const calls: QuizEventArgs[] = [];
      __setQuizEventTransport(async (a) => { calls.push(a); });
      await mount();
      await settle();
      expect(calls[0].p_session_id).not.toBe('3f2b8c1e-7a4d-4e9b-9c1a-5d6e7f8a9b0c');
    });

    it('a re-answer after Back does not duplicate the step event', async () => {
      const calls: QuizEventArgs[] = [];
      __setQuizEventTransport(async (a) => { calls.push(a); });
      const tree = await mount();
      await tap(tree, 'quiz-option-intent-serious');
      await tap(tree, 'quiz-back');
      await tap(tree, 'quiz-option-intent-marriage');
      await settle();
      expect(calls.filter((c) => c.p_event === 'quiz_step' && c.p_step === 1)).toHaveLength(1);
    });
  });
});
