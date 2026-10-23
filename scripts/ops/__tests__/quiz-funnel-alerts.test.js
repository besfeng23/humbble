/* eslint-env jest, node */
const fs = require('fs');
const path = require('path');
const { evaluate, loadDefinitions, main, validateStats, EXIT_CODE } = require('../quiz-funnel-alerts');

const ROOT = path.join(__dirname, '..', '..', '..');
const ALERT_DIR = path.join(ROOT, 'docs', 'operations', 'alerts', 'quiz-funnel');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const defs = loadDefinitions();
const alert = (id) => defs.alerts.find((a) => a.id === id);
const byId = (report) => Object.fromEntries(report.results.map((r) => [r.id, r]));

const QUIET = {
  requests_total: 400, edge_429_total: 0, edge_429_postgrest: 0, edge_429_gateway: 0, edge_4xx_other: 0,
  pt429_log_count: 0, pt400_log_count: 0, saturated_minutes: 0,
};

/** SQL with comments, whitespace and the trailing semicolon removed, for comparing copies. */
const normalizeSql = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join(' ').replace(/\s+/g, ' ').replace(/\s*;\s*$/, '').trim();

describe('quiz-funnel alert definitions', () => {
  test('every alert is well formed and thresholds are ordered', () => {
    const ids = new Set();
    for (const a of defs.alerts) {
      expect(ids.has(a.id)).toBe(false);
      ids.add(a.id);
      expect(a.id).toMatch(/^QZ-[A-Z0-9-]+$/);
      expect(['postgres_logs', 'edge_logs', 'database']).toContain(a.source);
      expect(['count', 'share']).toContain(a.kind);
      expect(a.warn).toBeGreaterThan(0);
      expect(a.critical).toBeGreaterThan(a.warn);
      expect(Object.keys(defs.stats_inputs)).toContain(a.metric);
      expect(fs.existsSync(path.join(ALERT_DIR, a.query))).toBe(true);
      if (a.kind === 'share') {
        expect(Object.keys(defs.stats_inputs)).toContain(a.denominator);
        expect(a.min_denominator).toBeGreaterThanOrEqual(1);
        expect(a.critical).toBeLessThanOrEqual(1);
      }
    }
  });

  test('covers both alerts Themis asked for on PR #42: the 429/PT429 cap hit (log, gateway, database) and the 4xx share', () => {
    expect(alert('QZ-429-PT429-LOG').metric).toBe('pt429_log_count');
    expect(alert('QZ-429-EDGE-POSTGREST').metric).toBe('edge_429_postgrest');
    expect(alert('QZ-CAP-SATURATED-MINUTES').metric).toBe('saturated_minutes');
    expect(alert('QZ-4XX-SHARE').kind).toBe('share');
  });

  test('queries point at the real RPC path, and the PT codes match the migrations that raise them', () => {
    expect(new RegExp(defs.rpc_path_regex).test('/rest/v1/rpc/record_quiz_event')).toBe(true);
    expect(new RegExp(defs.rpc_path_regex).test('/rest/v1/rpc/record_quiz_event/')).toBe(true);
    expect(new RegExp(defs.rpc_path_regex).test('/rest/v1/rpc/record_quiz_events')).toBe(false);
    expect(new RegExp(defs.rpc_path_regex).test('/rest/v1/quiz_events')).toBe(false);
    const edge = read('docs/operations/alerts/quiz-funnel/edge-status-mix.sql');
    expect(edge).toContain("source = 'edge_logs'");
    expect(edge).toContain("log_attributes['request.method'] = 'POST'");
    expect(edge).toContain(defs.rpc_path_regex);
    expect(edge).toContain("log_attributes['response.headers.sb_error_code']");
    expect(edge).not.toMatch(/proxy_status/i); // not a supported edge_logs field per Supabase docs
    const pg = read('docs/operations/alerts/quiz-funnel/postgres-log-sqlstate.sql');
    expect(pg).toContain("source = 'postgres_logs'");
    expect(pg).toContain("'PT429'");
    expect(pg).toContain("'PT400'");

    const migrations = fs.readdirSync(path.join(ROOT, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'));
    const raising = (code) => migrations.filter((f) => new RegExp(`ERRCODE = '${code}'`).test(read('supabase/migrations', f)));
    expect(raising('PT429')).toEqual(['20261023000120_record_quiz_event_rate_limited_429.sql']);
    // 120 re-creates the whole function (including the PT400 guard from 110), so both files carry PT400.
    expect(raising('PT400')).toEqual(['20261023000110_record_quiz_event_payload_too_large_400.sql', '20261023000120_record_quiz_event_rate_limited_429.sql']);
    for (const f of new Set([...raising('PT429'), ...raising('PT400')])) {
      expect(read('supabase/migrations', f)).toContain('CREATE OR REPLACE FUNCTION public.record_quiz_event(');
    }
    // Nothing else in the project may raise these codes, otherwise the SQLSTATE no longer identifies the quiz cap.
    const functionsDir = path.join(ROOT, 'supabase', 'functions');
    const stack = [functionsDir];
    const offenders = [];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) stack.push(f);
        else if (/PT429|PT400/.test(fs.readFileSync(f, 'utf8'))) offenders.push(path.relative(ROOT, f));
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the database query is the same text that the pgTAP test executes (0032), so CI runs the real query', () => {
    const file = normalizeSql(read('docs/operations/alerts/quiz-funnel/cap-saturation.sql'));
    const pgtap = read('supabase/tests/0032_quiz_funnel_alert_queries.test.sql');
    const m = pgtap.match(/\$alertsql\$([\s\S]*?)\$alertsql\$/);
    expect(m).not.toBeNull();
    expect(normalizeSql(m[1])).toBe(file);
    expect(file).toMatch(/^SELECT /);
    expect(file).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|CREATE)\b/i);
  });

  test('the monitoring SQL files are read-only and contain no secrets or credentials', () => {
    for (const f of fs.readdirSync(ALERT_DIR).filter((n) => n.endsWith('.sql'))) {
      const body = read('docs/operations/alerts/quiz-funnel', f).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
      expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|CREATE)\b/i);
      expect(body).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}|sb_secret|service_role_key|postgres(ql)?:\/\//i);
    }
  });

  test('the documented cap and the runbook agree with the definitions', () => {
    const runbook = read('docs/operations/quiz-funnel-alerts.md');
    for (const a of defs.alerts) expect(runbook).toContain(a.id);
    const doc = read('docs/operations/quiz-funnel-events.md');
    expect(doc).toContain('quiz-funnel-alerts.md');
    expect(doc).toContain('Cap: 120 events per minute');
    expect(read('supabase/migrations/20261023000070_quiz_anonymous_funnel_events.sql')).toMatch(/quiz_event_global_rate_per_minute\(\)[\s\S]{0,160}SELECT 120;/);
    expect(runbook).toContain(`${defs.window_minutes} minutes`);
    for (const a of defs.alerts) {
      expect(runbook).toContain(String(a.warn));
      expect(runbook).toContain(String(a.critical));
    }
  });
});

describe('evaluate()', () => {
  test('quiet traffic is ok', () => {
    const r = evaluate(QUIET, defs);
    expect(r.overall).toBe('ok');
    expect(r.exitCode).toBe(0);
    expect(r.results.every((x) => x.state === 'ok')).toBe(true);
  });

  test.each([
    ['QZ-429-PT429-LOG', 'pt429_log_count'],
    ['QZ-429-EDGE-POSTGREST', 'edge_429_postgrest'],
    ['QZ-CAP-SATURATED-MINUTES', 'saturated_minutes'],
  ])('%s: warn at the warn threshold, critical at the critical threshold, ok just below', (id, metric) => {
    const a = alert(id);
    const run = (v) => {
      const stats = { ...QUIET, [metric]: v };
      if (metric === 'edge_429_postgrest') { stats.edge_429_total = v; }
      return byId(evaluate(stats, defs))[id].state;
    };
    expect(run(a.warn - 1)).toBe('ok');
    expect(run(a.warn)).toBe('warn');
    expect(run(a.critical - 1)).toBe('warn');
    expect(run(a.critical)).toBe('critical');
  });

  test('a cap hit is not a 5xx and not a 4xx-share event: 429s are excluded from the 4xx share', () => {
    const r = evaluate({ ...QUIET, requests_total: 400, edge_429_total: 300, edge_429_postgrest: 300, edge_4xx_other: 0, pt429_log_count: 300, saturated_minutes: 6 }, defs);
    const s = byId(r);
    expect(s['QZ-4XX-SHARE'].state).toBe('ok');
    expect(s['QZ-4XX-SHARE'].value).toBe(0);
    expect(s['QZ-429-PT429-LOG'].state).toBe('critical');
    expect(s['QZ-429-EDGE-POSTGREST'].state).toBe('critical');
    expect(s['QZ-CAP-SATURATED-MINUTES'].state).toBe('critical');
    expect(r.overall).toBe('critical');
    expect(r.exitCode).toBe(EXIT_CODE.critical);
  });

  test('gateway-originated 429s do not fire the cap-hit alert', () => {
    const r = evaluate({ ...QUIET, requests_total: 600, edge_429_total: 500, edge_429_gateway: 500, edge_429_postgrest: 0 }, defs);
    expect(byId(r)['QZ-429-EDGE-POSTGREST'].state).toBe('ok');
    expect(r.info.edge_429_gateway).toBe(500);
  });

  test('4xx share: thresholds, boundaries and the minimum volume guard', () => {
    const share = (n, total) => byId(evaluate({ ...QUIET, requests_total: total, edge_4xx_other: n }, defs))['QZ-4XX-SHARE'];
    expect(share(2, 100).state).toBe('ok'); // 2%
    expect(share(5, 100).state).toBe('warn'); // exactly 5%
    expect(share(19, 100).state).toBe('warn');
    expect(share(20, 100).state).toBe('critical'); // exactly 20%
    expect(share(100, 100).state).toBe('critical');
    // oversize flood: 49 requests, all 400s, is below the minimum volume: not evaluated, and says so
    const small = share(49, 49);
    expect(small.state).toBe('insufficient_volume');
    expect(small.note).toMatch(/fewer than 50/);
    expect(share(50, 50).state).toBe('critical');
    expect(share(0, 0).state).toBe('insufficient_volume');
  });

  test('insufficient volume counts as ok for the exit code but is visible in the report', () => {
    const r = evaluate({ ...QUIET, requests_total: 10, edge_4xx_other: 10 }, defs);
    expect(r.overall).toBe('ok');
    expect(byId(r)['QZ-4XX-SHARE'].state).toBe('insufficient_volume');
  });

  test('a missing metric is NO_DATA, never ok: a blind alert must not look like a quiet one', () => {
    const { pt429_log_count, ...rest } = QUIET; // eslint-disable-line no-unused-vars
    const r = evaluate(rest, defs);
    expect(byId(r)['QZ-429-PT429-LOG'].state).toBe('no_data');
    expect(r.overall).toBe('no_data');
    expect(r.exitCode).toBe(3);
    expect(evaluate({}, defs).results.every((x) => x.state === 'no_data')).toBe(true);
    expect(byId(evaluate({ ...QUIET, pt429_log_count: null }, defs))['QZ-429-PT429-LOG'].state).toBe('no_data');
    // the share alert needs its denominator too
    const noDen = byId(evaluate({ ...QUIET, requests_total: undefined }, defs))['QZ-4XX-SHARE'];
    expect(noDen.state).toBe('no_data');
  });

  test('warn and critical outrank no_data in overall', () => {
    const { saturated_minutes, ...rest } = QUIET; // eslint-disable-line no-unused-vars
    expect(evaluate({ ...rest, pt429_log_count: 10 }, defs).overall).toBe('warn');
    expect(evaluate({ ...rest, pt429_log_count: 100 }, defs).overall).toBe('critical');
  });

  test('rejects nonsense input instead of guessing', () => {
    expect(() => validateStats(null)).toThrow();
    expect(() => validateStats([])).toThrow();
    expect(() => validateStats({ pt429_log_count: -1 })).toThrow(/non-negative integer/);
    expect(() => validateStats({ pt429_log_count: 1.5 })).toThrow();
    expect(() => validateStats({ pt429_log_count: '10' })).toThrow();
    expect(() => validateStats({ requests_total: 10, edge_4xx_other: 11 })).toThrow(/exceeds requests_total/);
    expect(() => validateStats({ requests_total: 10, edge_4xx_other: 6, edge_429_total: 6 })).toThrow();
    expect(() => validateStats({ edge_429_total: 5, edge_429_postgrest: 2, edge_429_gateway: 2 })).toThrow(/must equal/);
    expect(() => evaluate({ requests_total: 'abc' }, defs)).toThrow();
  });
});

describe('CLI main()', () => {
  const tmp = path.join(require('os').tmpdir(), `quiz-alerts-${process.pid}.json`);
  let out;
  let err;
  let outSpy;
  let errSpy;
  beforeEach(() => {
    out = '';
    err = '';
    outSpy = jest.spyOn(process.stdout, 'write').mockImplementation((s) => { out += s; return true; });
    errSpy = jest.spyOn(process.stderr, 'write').mockImplementation((s) => { err += s; return true; });
  });
  afterEach(() => {
    outSpy.mockRestore();
    errSpy.mockRestore();
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  test('exit codes follow overall and output is readable text', () => {
    fs.writeFileSync(tmp, JSON.stringify(QUIET));
    expect(main(['node', 'x', tmp])).toBe(0);
    expect(out).toContain('quiz-funnel alerts (window 15 min): OK');
    fs.writeFileSync(tmp, JSON.stringify({ ...QUIET, pt429_log_count: 12 }));
    out = '';
    expect(main(['node', 'x', tmp])).toBe(1);
    expect(out).toContain('[WARN] QZ-429-PT429-LOG');
    fs.writeFileSync(tmp, JSON.stringify({ ...QUIET, requests_total: 100, edge_4xx_other: 30 }));
    out = '';
    expect(main(['node', 'x', tmp])).toBe(2);
    expect(out).toContain('30.0% (30/100)');
  });

  test('--json prints the report; bad or missing input exits 3 with a message and no stack trace', () => {
    fs.writeFileSync(tmp, JSON.stringify(QUIET));
    expect(main(['node', 'x', tmp, '--json'])).toBe(0);
    expect(JSON.parse(out).overall).toBe('ok');
    fs.writeFileSync(tmp, '{not json');
    expect(main(['node', 'x', tmp])).toBe(3);
    expect(err).toMatch(/invalid input/);
    expect(main(['node', 'x'])).toBe(3);
    expect(main(['node', 'x', path.join(tmp, 'missing.json')])).toBe(3);
  });
});
