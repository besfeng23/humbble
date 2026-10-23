// P5-01: moderation console on real data (RPC-backed). All network is mocked at the lib/rpc boundary; the database enforces the real rules.
import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { textContent } from '../test-utils/textContent';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const R = require('react');
  return {
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), canGoBack: () => false }),
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (cb: () => void | (() => void)) => { R.useEffect(cb, [cb]); },
    usePathname: () => '/moderation',
    Redirect: ({ href }: { href: string }) => R.createElement('Redirect', { href }),
  };
});

let mockAuth: { session: unknown; user: unknown; loading: boolean; signOut: () => Promise<void> };
jest.mock('@/lib/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: true, supabase: {} }));
jest.mock('@/constants/Motion', () => ({
  MotionTransforms: { pressedOpacity: 0.85 },
  getMotionConfig: () => ({ pressedScale: 1 }),
  useReducedMotion: () => true,
}));

const mockList = jest.fn();
const mockGet = jest.fn();
const mockOpen = jest.fn();
const mockAct = jest.fn();
jest.mock('@/lib/rpc', () => ({
  moderationListQueue: (...a: unknown[]) => mockList(...a),
  moderationGetCase: (...a: unknown[]) => mockGet(...a),
  moderationOpenCase: (...a: unknown[]) => mockOpen(...a),
  moderationTakeAction: (...a: unknown[]) => mockAct(...a),
}));

/* eslint-disable import/first */
import CaseScreen from '@/app/(admin)/moderation/[reportId]';
import QueueScreen from '@/app/(admin)/moderation/index';
/* eslint-enable import/first */

const REPORT = '00000000-0000-0000-0000-00000000c001';
const MODERATOR = { id: 'mod-1', app_metadata: { role: 'moderator' }, user_metadata: {} };

function queueRow(over: Record<string, unknown> = {}) {
  return {
    report_id: REPORT,
    category: 'scam',
    severity: 'high',
    report_status: 'open',
    reported_at: new Date(Date.now() - 3600_000).toISOString(),
    reported_user_id: '00000000-0000-0000-0000-0000000000aa',
    reported_display_name: 'Alex',
    reported_is_suspended: false,
    reports_against_count: 1,
    case_id: null,
    case_status: null,
    case_updated_at: null,
    assigned_to_me: false,
    ...over,
  };
}
function detailRow(over: Record<string, unknown> = {}) {
  return {
    ...queueRow(),
    reporter_id: '00000000-0000-0000-0000-0000000000bb',
    context_summary: 'Asked me to send money',
    blocks_against_count: 0,
    assigned_moderator_id: null,
    resolution_code: null,
    history: [],
    ...over,
  };
}

async function mount(el: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(el); await Promise.resolve(); await Promise.resolve(); });
  return tree;
}
const byId = (tree: renderer.ReactTestRenderer, id: string) =>
  tree.root.findAll((n) => n.props.testID === id && (typeof n.props.onPress === 'function' || typeof n.props.onChangeText === 'function'))[0];
const exists = (tree: renderer.ReactTestRenderer, id: string) => tree.root.findAll((n) => n.props.testID === id).length > 0;
const screenText = (tree: renderer.ReactTestRenderer) => textContent(tree.toJSON() as unknown);

beforeEach(() => {
  jest.clearAllMocks();
  [mockList, mockGet, mockOpen, mockAct].forEach((m) => m.mockReset());
  mockParams = { reportId: REPORT };
  mockAuth = { session: { access_token: 't' }, user: MODERATOR, loading: false, signOut: jest.fn(async () => {}) };
});

describe('SCR-23 queue on real data', () => {
  test('non-moderators get the 403 state and the database is never queried', async () => {
    mockAuth = { ...mockAuth, user: { id: 'u', app_metadata: { role: 'authenticated' }, user_metadata: { role: 'moderator' } } };
    const tree = await mount(<QueueScreen />);
    expect(exists(tree, 'scr-23-moderation-queue-guard-forbidden')).toBe(true);
    expect(mockList).not.toHaveBeenCalled();
  });

  test('an admin claim or a user_metadata claim does not grant access', async () => {
    mockAuth = { ...mockAuth, user: { id: 'u', app_metadata: { role: 'admin' }, user_metadata: {} } };
    const tree = await mount(<QueueScreen />);
    expect(exists(tree, 'scr-23-moderation-queue-guard-forbidden')).toBe(true);
    expect(mockList).not.toHaveBeenCalled();
  });

  test('shows loading, then real rows with labels (no synthetic cases)', async () => {
    let resolve!: (v: unknown) => void;
    mockList.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const tree = await mount(<QueueScreen />);
    expect(exists(tree, 'scr-23-form-state-pending')).toBe(true);
    await act(async () => { resolve({ data: [queueRow(), queueRow({ report_id: 'r2', category: 'underage', severity: 'urgent', reported_display_name: 'Sam', case_id: 'c', case_status: 'in_review' })], error: null }); await Promise.resolve(); });
    expect(exists(tree, 'scr-23-form-state-pending')).toBe(false);
    const text = screenText(tree);
    expect(text).toContain('Scam or money request');
    expect(text).toContain('Possible underage member');
    expect(text).toContain('Alex');
    expect(text).toContain('Triage due in');
    expect(text).not.toMatch(/case-10[0-9]/);
    expect(mockList).toHaveBeenCalledWith({ filter: 'active', limit: 25, offset: 0 });
  });

  test('inspect navigates to the report route', async () => {
    mockList.mockResolvedValueOnce({ data: [queueRow()], error: null });
    const tree = await mount(<QueueScreen />);
    await act(async () => { byId(tree, `scr-23-inspect-${REPORT}`).props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith(`/(admin)/moderation/${REPORT}`);
  });

  test('empty state offers a way out', async () => {
    mockList.mockResolvedValue({ data: [], error: null });
    const tree = await mount(<QueueScreen />);
    expect(exists(tree, 'scr-23-form-state-empty')).toBe(true);
    expect(screenText(tree)).toContain('No reports need attention');
  });

  test('error state is friendly (no raw database text) and retry reloads', async () => {
    mockList.mockResolvedValueOnce({ data: null, error: { message: 'relation "x" does not exist: SQLSTATE 42P01' } });
    const tree = await mount(<QueueScreen />);
    expect(exists(tree, 'scr-23-form-state-failure')).toBe(true);
    expect(screenText(tree)).not.toMatch(/42P01|relation/);
    mockList.mockResolvedValueOnce({ data: [queueRow()], error: null });
    const retry = tree.root.findAll((n) => typeof n.props.onPress === 'function' && (n.props.accessibilityLabel === 'Try again' || n.props.label === 'Try again'))[0];
    await act(async () => { retry.props.onPress(); await Promise.resolve(); });
    expect(screenText(tree)).toContain('Alex');
  });

  test('moderator_required from the database renders the access message', async () => {
    mockList.mockResolvedValueOnce({ data: null, error: { message: 'moderator_required', code: '42501' } });
    const tree = await mount(<QueueScreen />);
    expect(screenText(tree)).toContain('does not have moderator access');
  });

  test('filter change re-queries and a stale slow response cannot overwrite the newer one', async () => {
    let resolveSlow!: (v: unknown) => void;
    mockList.mockReturnValueOnce(new Promise((r) => { resolveSlow = r; }));
    const tree = await mount(<QueueScreen />);
    mockList.mockResolvedValueOnce({ data: [queueRow({ reported_display_name: 'Fresh' })], error: null });
    await act(async () => { byId(tree, 'scr-23-filter-closed').props.onPress(); await Promise.resolve(); await Promise.resolve(); });
    expect(mockList).toHaveBeenLastCalledWith({ filter: 'closed', limit: 25, offset: 0 });
    await act(async () => { resolveSlow({ data: [queueRow({ reported_display_name: 'Stale' })], error: null }); await Promise.resolve(); });
    const text = screenText(tree);
    expect(text).toContain('Fresh');
    expect(text).not.toContain('Stale');
  });

  test('a full page shows Load more which appends the next offset', async () => {
    const page = Array.from({ length: 25 }, (_, i) => queueRow({ report_id: `r${i}` }));
    mockList.mockResolvedValueOnce({ data: page, error: null });
    const tree = await mount(<QueueScreen />);
    mockList.mockResolvedValueOnce({ data: [queueRow({ report_id: 'extra', reported_display_name: 'Extra' })], error: null });
    await act(async () => { byId(tree, 'scr-23-load-more').props.onPress(); await Promise.resolve(); await Promise.resolve(); });
    expect(mockList).toHaveBeenLastCalledWith({ filter: 'active', limit: 25, offset: 25 });
    expect(exists(tree, 'scr-23-case-extra')).toBe(true);
    expect(exists(tree, 'scr-23-load-more')).toBe(false);
  });
});

describe('SCR-24 case detail and audited actions', () => {
  test('non-moderators never trigger a case read (reads are audited)', async () => {
    mockAuth = { ...mockAuth, user: { id: 'u', app_metadata: {}, user_metadata: {} } };
    const tree = await mount(<CaseScreen />);
    expect(exists(tree, 'scr-24-moderation-case-guard-forbidden')).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('a report without a case offers only Open case, and the reason starts empty', async () => {
    mockGet.mockResolvedValue({ data: [detailRow()], error: null });
    const tree = await mount(<CaseScreen />);
    expect(mockGet).toHaveBeenCalledWith(REPORT);
    expect(byId(tree, 'scr-24-reason-input').props.value).toBe('');
    expect(exists(tree, 'scr-24-open-btn')).toBe(true);
    expect(exists(tree, 'scr-24-suspend-btn')).toBe(false);
    expect(screenText(tree)).toContain('Asked me to send money');
  });

  test('an action without a valid reason is blocked client-side and nothing is sent', async () => {
    mockGet.mockResolvedValue({ data: [detailRow()], error: null });
    const tree = await mount(<CaseScreen />);
    await act(async () => { byId(tree, 'scr-24-open-btn').props.onPress(); });
    expect(mockOpen).not.toHaveBeenCalled();
    expect(screenText(tree)).toMatch(/at least 8 characters/);
    await act(async () => { byId(tree, 'scr-24-reason-input').props.onChangeText('short'); });
    await act(async () => { byId(tree, 'scr-24-open-btn').props.onPress(); });
    expect(mockOpen).not.toHaveBeenCalled();
  });

  test('opening a case sends the trimmed reason then reloads the case', async () => {
    mockGet.mockResolvedValueOnce({ data: [detailRow()], error: null });
    const tree = await mount(<CaseScreen />);
    mockOpen.mockResolvedValueOnce({ data: 'case-1', error: null });
    mockGet.mockResolvedValueOnce({ data: [detailRow({ case_id: 'case-1', case_status: 'open' })], error: null });
    await act(async () => { byId(tree, 'scr-24-reason-input').props.onChangeText('  Looks like a scam report  '); });
    await act(async () => { byId(tree, 'scr-24-open-btn').props.onPress(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(mockOpen).toHaveBeenCalledWith({ reportId: REPORT, reason: 'Looks like a scam report' });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(exists(tree, 'scr-24-start_review-btn')).toBe(true);
    expect(screenText(tree)).toContain('Case opened');
    expect(byId(tree, 'scr-24-reason-input').props.value).toBe('');
  });

  test('suspend asks for confirmation, then records who/why via the RPC, then reloads', async () => {
    mockGet.mockResolvedValueOnce({ data: [detailRow({ case_id: 'case-1', case_status: 'in_review' })], error: null });
    const tree = await mount(<CaseScreen />);
    expect(['scr-24-suspend-btn', 'scr-24-warn-btn', 'scr-24-dismiss-btn'].every((id) => exists(tree, id))).toBe(true);
    await act(async () => { byId(tree, 'scr-24-reason-input').props.onChangeText('Confirmed money request scam'); });
    await act(async () => { byId(tree, 'scr-24-suspend-btn').props.onPress(); });
    expect(mockAct).not.toHaveBeenCalled(); // nothing is sent until confirmed
    mockAct.mockResolvedValueOnce({ data: [{ case_status: 'resolved', reported_is_suspended: true }], error: null });
    mockGet.mockResolvedValueOnce({ data: [detailRow({ case_id: 'case-1', case_status: 'resolved', reported_is_suspended: true })], error: null });
    await act(async () => { byId(tree, 'scr-24-confirm-btn').props.onPress(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(mockAct).toHaveBeenCalledWith({ caseId: 'case-1', action: 'suspend', reason: 'Confirmed money request scam' });
    expect(screenText(tree)).toContain('Account suspended');
    expect(exists(tree, 'scr-24-lift_suspension-btn')).toBe(true);
    expect(exists(tree, 'scr-24-suspend-btn')).toBe(false);
  });

  test('cancelling the confirmation sends nothing', async () => {
    mockGet.mockResolvedValueOnce({ data: [detailRow({ case_id: 'case-1', case_status: 'in_review' })], error: null });
    const tree = await mount(<CaseScreen />);
    await act(async () => { byId(tree, 'scr-24-reason-input').props.onChangeText('Confirmed money request scam'); });
    await act(async () => { byId(tree, 'scr-24-suspend-btn').props.onPress(); });
    await act(async () => { byId(tree, 'scr-24-cancel-btn').props.onPress(); });
    expect(mockAct).not.toHaveBeenCalled();
  });

  test('dismiss/warn also confirm; a failing action shows friendly copy and keeps the reason', async () => {
    mockGet.mockResolvedValueOnce({ data: [detailRow({ case_id: 'case-1', case_status: 'in_review' })], error: null });
    const tree = await mount(<CaseScreen />);
    await act(async () => { byId(tree, 'scr-24-reason-input').props.onChangeText('Reporter was mistaken here'); });
    await act(async () => { byId(tree, 'scr-24-dismiss-btn').props.onPress(); });
    mockAct.mockResolvedValueOnce({ data: null, error: { message: 'moderation_target_unavailable' } });
    await act(async () => { byId(tree, 'scr-24-confirm-btn').props.onPress(); await Promise.resolve(); await Promise.resolve(); });
    const text = screenText(tree);
    expect(text).toContain('Action not recorded');
    expect(text).toContain('no longer available');
    expect(text).not.toContain('moderation_target_unavailable');
    expect(byId(tree, 'scr-24-reason-input').props.value).toBe('Reporter was mistaken here');
  });

  test('audit history lists who/when/why from the database', async () => {
    mockGet.mockResolvedValueOnce({
      data: [detailRow({
        case_id: 'case-1',
        case_status: 'resolved',
        history: [
          { at: new Date().toISOString(), action: 'moderation.action', actor_id: 'aaaaaaaa-0000', metadata: { action: 'warn', reason: 'First offence' } },
        ],
      })],
      error: null,
    });
    const tree = await mount(<CaseScreen />);
    const text = screenText(tree);
    expect(text).toContain('Moderator recorded a warning');
    expect(text).toContain('aaaaaaaa');
    expect(text).toContain('First offence');
  });

  test('closed cases are read-only', async () => {
    mockGet.mockResolvedValueOnce({ data: [detailRow({ case_id: 'case-1', case_status: 'closed' })], error: null });
    const tree = await mount(<CaseScreen />);
    expect(exists(tree, 'scr-24-closed-card')).toBe(true);
    expect(exists(tree, 'scr-24-reason-input')).toBe(false);
  });

  test('load failure, missing report and access-denied states are all friendly', async () => {
    mockGet.mockResolvedValueOnce({ data: null, error: { message: 'JWT expired' } });
    let tree = await mount(<CaseScreen />);
    expect(exists(tree, 'scr-24-load-state-failure')).toBe(true);
    expect(screenText(tree)).not.toContain('JWT');

    mockGet.mockResolvedValueOnce({ data: [], error: null });
    tree = await mount(<CaseScreen />);
    expect(screenText(tree)).toContain('Report not found');

    mockGet.mockResolvedValueOnce({ data: null, error: { message: 'moderator_required' } });
    tree = await mount(<CaseScreen />);
    expect(screenText(tree)).toContain('Moderator access required');
  });
});
