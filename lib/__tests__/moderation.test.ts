import {
  actionSpec,
  ageLabel,
  availableActions,
  categoryLabel,
  isForbiddenError,
  moderationErrorMessage,
  parseHistory,
  statusLabel,
  triageClock,
  validateReason,
} from '../moderation';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const base = { case_id: 'c1', reported_is_suspended: false };

describe('availableActions mirrors the moderation state machine', () => {
  test('no case yet: nothing but the open-case path (handled by the screen)', () => {
    expect(availableActions({ ...base, case_id: '', case_status: '' })).toEqual([]);
  });
  test('open -> only start_review', () => {
    expect(availableActions({ ...base, case_status: 'open' }).map((a) => a.id)).toEqual(['start_review']);
  });
  test('in_review -> suspend, warn, dismiss', () => {
    expect(availableActions({ ...base, case_status: 'in_review' }).map((a) => a.id)).toEqual(['suspend', 'warn', 'dismiss']);
  });
  test('lift_suspension is offered only while the member is suspended', () => {
    expect(availableActions({ ...base, case_status: 'resolved' }).map((a) => a.id)).toEqual(['close']);
    expect(availableActions({ ...base, case_status: 'resolved', reported_is_suspended: true }).map((a) => a.id)).toEqual(['lift_suspension', 'close']);
    expect(availableActions({ ...base, case_status: 'appealed', reported_is_suspended: true }).map((a) => a.id)).toEqual(['start_review', 'lift_suspension', 'close']);
  });
  test('closed is read-only', () => {
    expect(availableActions({ ...base, case_status: 'closed' })).toEqual([]);
  });
  test('consequential actions require confirmation, routine ones do not', () => {
    expect(actionSpec('suspend').confirm).toBeTruthy();
    expect(actionSpec('lift_suspension').confirm).toBeTruthy();
    expect(actionSpec('start_review').confirm).toBeUndefined();
  });
});

describe('validateReason', () => {
  test('rejects blank, whitespace and short reasons', () => {
    expect(validateReason('')).toMatch(/at least 8/);
    expect(validateReason('       x')).toMatch(/at least 8/);
    expect(validateReason('short')).not.toBeNull();
  });
  test('accepts a real reason and rejects oversize', () => {
    expect(validateReason('Confirmed scam message')).toBeNull();
    expect(validateReason('x'.repeat(2001))).toMatch(/under 2000/);
  });
});

describe('labels and clocks', () => {
  test('labels never leak raw enum values', () => {
    expect(categoryLabel('underage')).toBe('Possible underage member');
    expect(categoryLabel('not_a_category')).toBe('Other');
    expect(statusLabel(null)).toBe('New report');
    expect(statusLabel('in_review')).toBe('In review');
  });
  test('ageLabel', () => {
    expect(ageLabel('2026-10-24T11:59:40Z', NOW)).toBe('just now');
    expect(ageLabel('2026-10-24T11:15:00Z', NOW)).toBe('45m ago');
    expect(ageLabel('2026-10-24T07:00:00Z', NOW)).toBe('5h ago');
    expect(ageLabel('2026-10-20T12:00:00Z', NOW)).toBe('4d ago');
    expect(ageLabel('garbage', NOW)).toBe('unknown age');
  });
  test('triageClock counts down for unpicked reports and reports overdue ones', () => {
    expect(triageClock({ severity: 'urgent', case_status: '', reported_at: '2026-10-24T10:00:00Z' }, NOW)).toBe('Triage due in 2h 0m');
    expect(triageClock({ severity: 'urgent', case_status: 'open', reported_at: '2026-10-24T06:00:00Z' }, NOW)).toBe('Triage overdue by 2h 0m');
    expect(triageClock({ severity: 'normal', case_status: '', reported_at: '2026-10-24T11:00:00Z' }, NOW)).toBe('Triage due in 23h 0m');
    expect(triageClock({ severity: 'urgent', case_status: 'in_review', reported_at: '2026-10-24T06:00:00Z' }, NOW)).toBeNull();
  });
});

describe('errors', () => {
  test('forbidden detection', () => {
    expect(isForbiddenError({ message: 'moderator_required' })).toBe(true);
    expect(isForbiddenError({ message: 'permission denied', code: '42501' })).toBe(true);
    expect(isForbiddenError({ message: 'moderation_reason_required' })).toBe(false);
    expect(isForbiddenError(null)).toBe(false);
  });
  test('database error codes map to friendly copy, never raw', () => {
    for (const code of ['moderation_reason_required', 'invalid_moderation_action', 'moderation_self_action_not_allowed', 'moderation_not_suspended', 'moderation_target_unavailable', 'report_required']) {
      const text = moderationErrorMessage({ message: code });
      expect(text).not.toContain(code);
      expect(text.length).toBeGreaterThan(10);
    }
    expect(moderationErrorMessage({ message: 'something unexpected: 0xDEADBEEF' })).toBe('Something went wrong. Please try again.');
  });
});

describe('parseHistory', () => {
  test('tolerates junk and renders the audit actions with reasons', () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory('x')).toEqual([]);
    const rows = parseHistory([
      null,
      { at: '2026-10-24T01:00:00Z', action: 'moderation.action', actor_id: 'aaaaaaaa-1', metadata: { action: 'suspend', reason: 'Scam confirmed' } },
      { at: '2026-10-24T01:00:00Z', action: 'moderation.case_transition', actor_id: 'aaaaaaaa-1', metadata: { from: 'in_review', to: 'resolved' } },
      { at: '2026-10-23T01:00:00Z', action: 'something.else', metadata: {} },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ summary: 'Moderator suspended the account', reason: 'Scam confirmed', actorId: 'aaaaaaaa-1' });
    expect(rows[1].summary).toBe('Status changed: in review → resolved');
    expect(rows[2]).toMatchObject({ summary: 'Recorded event', actorId: null });
  });
});
