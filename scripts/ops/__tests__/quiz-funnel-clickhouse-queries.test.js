/* eslint-env jest, node */
/**
 * Executable fixture test for the two ClickHouse queries (Themis N44-03) and the liveness behaviour (N44-01, N44-05).
 *
 * The queries run on a local in-process ClickHouse engine (chdb, via scripts/ops/quiz-funnel-clickhouse-runner.py) against a synthetic
 * `logs` table shaped like the Supabase log schema (source, timestamp, log_attributes Map). No network, no project, no credential.
 *
 * Two layers:
 *  1. ENGINE tests (skipped, with a warning, when chdb is not installed; set QUIZ_ALERTS_REQUIRE_CLICKHOUSE=1 to make a missing engine
 *     a failure; QUIZ_ALERTS_CH_PYTHON=/path/to/python selects the interpreter). They execute both files on fixtures and assert the
 *     exact numbers, then apply SQL mutants (dropping `status != 429`, wrong windows, wrong SQLSTATE key, ...) and require that every
 *     mutant changes at least one number.
 *  2. TEXT guard (always runs, no engine): the load-bearing lines are asserted verbatim after whitespace normalisation, and the same
 *     mutants must each break at least one of them. This is the fallback that protects CI when the engine is not installed.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { evaluate, loadDefinitions } = require('../quiz-funnel-alerts');

const ROOT = path.join(__dirname, '..', '..', '..');
const ALERT_DIR = path.join(ROOT, 'docs', 'operations', 'alerts', 'quiz-funnel');
const RUNNER = path.join(__dirname, '..', 'quiz-funnel-clickhouse-runner.py');
const EDGE_SQL = fs.readFileSync(path.join(ALERT_DIR, 'edge-status-mix.sql'), 'utf8');
const PG_SQL = fs.readFileSync(path.join(ALERT_DIR, 'postgres-log-sqlstate.sql'), 'utf8');
const defs = loadDefinitions();

const PYTHON = process.env.QUIZ_ALERTS_CH_PYTHON || 'python3';
const probe = spawnSync(PYTHON, [RUNNER], { input: '{}', encoding: 'utf8' });
const HAS_ENGINE = probe.status === 0;
const REQUIRE_ENGINE = process.env.QUIZ_ALERTS_REQUIRE_CLICKHOUSE === '1';
const engineTest = HAS_ENGINE ? test : test.skip;
if (!HAS_ENGINE && !REQUIRE_ENGINE) {
  // eslint-disable-next-line no-console
  console.warn('quiz-funnel ClickHouse engine tests SKIPPED: chdb not available (pip install chdb in a virtualenv, then set QUIZ_ALERTS_CH_PYTHON). The text guard still runs.');
}

const P = '/rest/v1/rpc/record_quiz_event';
const strip = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join(' ').replace(/\s+/g, ' ').trim();

// ---- fixture builders: rows are { source, ago (seconds before now), attrs } ----
const edge = (n, status, o = {}) => Array.from({ length: n }, () => ({
  source: 'edge_logs',
  ago: o.ago === undefined ? 60 : o.ago,
  attrs: {
    'request.method': o.method === undefined ? 'POST' : o.method,
    'request.path': o.path === undefined ? P : o.path,
    'response.status_code': String(status),
    ...(o.sb === undefined ? {} : { 'response.headers.sb_error_code': o.sb }),
    ...(o.drop || []).reduce((acc, k) => ({ ...acc, [k]: undefined }), {}),
  },
}));
const pgRows = (n, code, o = {}) => Array.from({ length: n }, () => ({
  source: 'postgres_logs',
  ago: o.ago === undefined ? 60 : o.ago,
  attrs: { 'parsed.sql_state_code': code, 'parsed.error_severity': o.sev === undefined ? 'ERROR' : o.sev },
}));
const strip0 = (rows) => rows.map((r) => ({ ...r, attrs: Object.fromEntries(Object.entries(r.attrs).filter(([, v]) => v !== undefined)) }));

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
function insertSql(rows) {
  if (!rows.length) return null;
  const vals = rows.map((r, i) => {
    const m = `{${Object.entries(r.attrs).map(([k, v]) => `${q(k)}:${q(v)}`).join(',')}}`;
    return `(${q(`r${i}`)}, now64(6) - INTERVAL ${Math.round(r.ago)} SECOND, ${q(r.source)}, ${m})`;
  });
  return `INSERT INTO logs VALUES ${vals.join(',')}`;
}
const CREATE = 'CREATE TABLE logs (id String, timestamp DateTime64(6), source String, log_attributes Map(String, String)) ENGINE = Memory';

/** Runs scenarios [{rows}] against the engine in ONE engine process; returns [{edge, pg}] (the single output row of each query). */
function runScenarios(scenarios, edgeSql = EDGE_SQL, pgSql = PG_SQL) {
  const batches = scenarios.map((sc) => {
    const setup = ['DROP TABLE IF EXISTS logs', CREATE];
    const ins = insertSql(strip0(sc.rows));
    if (ins) setup.push(ins);
    return { setup, queries: [edgeSql, pgSql] };
  });
  const res = spawnSync(PYTHON, [RUNNER], { input: JSON.stringify({ batches }), encoding: 'utf8', maxBuffer: 1 << 26 });
  if (res.status !== 0) throw new Error(`engine failed (${res.status}): ${res.stderr}`);
  return JSON.parse(res.stdout).map(([[e], [p]]) => ({ edge: e, pg: p }));
}

const ZERO_EDGE = { edge_logs_total: 0, edge_logs_schema_rows: 0, requests_total: 0, edge_429_total: 0, edge_429_postgrest: 0, edge_429_gateway: 0, edge_4xx_other: 0 };
const ZERO_PG = { pg_rows_total: 0, pg_rows_with_sqlstate: 0, pg_rows_with_severity: 0, pt429_log_count: 0, pt429_log_rows_any: 0, pt400_log_count: 0, pt400_log_rows_any: 0 };

// Each scenario lists the exact expected output of BOTH queries (hand-counted, see the comments).
const SCENARIOS = {
  empty: { rows: [], edge: ZERO_EDGE, pg: ZERO_PG },
  // 100 x 200, 429: 10 without and 4 with a gateway code, 400 x3, 401 x2 (code), 403 x5, 499, 404, 399, 500 x2, a trailing-slash 200;
  // decoys on the same source: OPTIONS, GET, another function, near-miss paths, 429s 20 minutes old.
  mix: {
    rows: [
      ...edge(100, 200), ...edge(10, 429, { sb: '' }), ...edge(4, 429, { sb: 'GW_THROTTLE' }), ...edge(3, 400), ...edge(2, 401, { sb: 'UNAUTHORIZED' }), ...edge(5, 403),
      ...edge(2, 500), ...edge(1, 499), ...edge(1, 404), ...edge(1, 399), ...edge(1, 200, { path: `${P}/` }),
      ...edge(7, 200, { method: 'OPTIONS' }), ...edge(1, 429, { method: 'GET' }), ...edge(5, 429, { path: '/rest/v1/rpc/other' }),
      ...edge(1, 429, { path: `${P}/x` }), ...edge(1, 429, { path: `${P}s` }), ...edge(9, 429, { ago: 20 * 60 }),
    ],
    // in window: 100+14+3+2+5+2+1+1+1+1 = 130 POSTs on the path; 7+1+5+1+1 = 15 decoys in the window; 9 more are 20 minutes old
    edge: { edge_logs_total: 130 + 15, edge_logs_schema_rows: 130 + 15, requests_total: 130, edge_429_total: 14, edge_429_postgrest: 10, edge_429_gateway: 4, edge_4xx_other: 12 },
    pg: ZERO_PG,
  },
  // window edges: 10 and 14.5 minutes ago are inside, 15.5 and 60 minutes ago outside
  window: {
    rows: [...edge(2, 429, { sb: '', ago: 600 }), ...edge(1, 400, { ago: 870 }), ...edge(3, 429, { sb: '', ago: 930 }), ...edge(1, 400, { ago: 3600 }),
      ...pgRows(2, 'PT429', { ago: 600 }), ...pgRows(1, 'PT429', { ago: 894 }), ...pgRows(3, 'PT429', { ago: 906 }), ...pgRows(2, 'PT400', { ago: 3600 })],
    edge: { edge_logs_total: 3, edge_logs_schema_rows: 3, requests_total: 3, edge_429_total: 2, edge_429_postgrest: 2, edge_429_gateway: 0, edge_4xx_other: 1 },
    pg: { pg_rows_total: 3, pg_rows_with_sqlstate: 3, pg_rows_with_severity: 3, pt429_log_count: 3, pt429_log_rows_any: 3, pt400_log_count: 0, pt400_log_rows_any: 0 },
  },
  // Postgres: PT429 x7 and PT400 x2 (ERROR), 23505 x3, LOG rows with the neutral SQLSTATE 00000 x4; older PT429 rows are outside
  pgmix: {
    rows: [...pgRows(7, 'PT429'), ...pgRows(2, 'PT400'), ...pgRows(3, '23505'), ...pgRows(4, '00000', { sev: 'LOG' }), ...pgRows(5, 'PT429', { ago: 20 * 60 })],
    edge: ZERO_EDGE,
    pg: { pg_rows_total: 16, pg_rows_with_sqlstate: 16, pg_rows_with_severity: 16, pt429_log_count: 7, pt429_log_rows_any: 7, pt400_log_count: 2, pt400_log_rows_any: 2 },
  },
  // N44-05: one raised error that produces several rows with the same SQLSTATE (ERROR + DETAIL + STATEMENT) counts once per ERROR row
  multiplied: {
    rows: [...pgRows(3, 'PT429'), ...pgRows(3, 'PT429', { sev: 'DETAIL' }), ...pgRows(3, 'PT429', { sev: 'STATEMENT' }),
      ...pgRows(1, 'PT400'), ...pgRows(2, 'PT400', { sev: 'STATEMENT' })],
    edge: ZERO_EDGE,
    pg: { pg_rows_total: 12, pg_rows_with_sqlstate: 12, pg_rows_with_severity: 12, pt429_log_count: 3, pt429_log_rows_any: 9, pt400_log_count: 1, pt400_log_rows_any: 3 },
  },
  // N44-01 blind pipelines: the data is there, the keys are not. Every alert column is a zero; only the liveness columns tell.
  edge_no_method: {
    rows: edge(5, 429, { sb: '', drop: ['request.method'] }),
    edge: { ...ZERO_EDGE, edge_logs_total: 5 },
    pg: ZERO_PG,
  },
  // the status key is missing: the RPC rows are still recognised (requests_total 5), but every status-based count is a meaningless zero
  edge_no_status: {
    rows: edge(5, 429, { sb: '', drop: ['response.status_code'] }),
    edge: { ...ZERO_EDGE, edge_logs_total: 5, requests_total: 5 },
    pg: ZERO_PG,
  },
  pg_no_sqlstate_key: {
    rows: Array.from({ length: 5 }, () => ({ source: 'postgres_logs', ago: 60, attrs: { 'parsed.error_severity': 'ERROR' } })),
    edge: ZERO_EDGE,
    pg: { ...ZERO_PG, pg_rows_total: 5, pg_rows_with_severity: 5 },
  },
  pg_severity_lowercase: {
    rows: [...pgRows(4, 'PT429', { sev: 'error' }), ...pgRows(2, 'PT400', { sev: 'error' })],
    edge: ZERO_EDGE,
    pg: { pg_rows_total: 6, pg_rows_with_sqlstate: 6, pg_rows_with_severity: 6, pt429_log_count: 0, pt429_log_rows_any: 4, pt400_log_count: 0, pt400_log_rows_any: 2 },
  },
};
const NAMES = Object.keys(SCENARIOS);
const run = (sql = {}) => runScenarios(NAMES.map((n) => ({ rows: SCENARIOS[n].rows })), sql.edge || EDGE_SQL, sql.pg || PG_SQL);
const diffs = (results) => NAMES.flatMap((n, i) => {
  const out = [];
  for (const k of ['edge', 'pg']) {
    const exp = SCENARIOS[n][k];
    const got = results[i][k];
    for (const col of Object.keys(exp)) if (Number(got ? got[col] : NaN) !== exp[col]) out.push(`${n}.${col}`);
  }
  return out;
});

// ---- SQL mutants: [name, which file, exact text to replace (first occurrence), replacement] ----
const MUTANTS = [
  ['drop status != 429 from the 4xx count', 'edge', ' AND status != 429', ''],
  ['4xx range includes 5xx', 'edge', 'status BETWEEN 400 AND 499', 'status BETWEEN 400 AND 599'],
  ['4xx range starts at 300', 'edge', 'status BETWEEN 400 AND 499', 'status BETWEEN 300 AND 499'],
  ['429 replaced by 428', 'edge', 'is_rpc AND status = 429)', 'is_rpc AND status = 428)'],
  ['gateway split flipped (postgrest counts coded 429s)', 'edge', "gateway_error_code = ''", "gateway_error_code != ''"],
  ['gateway split flipped (gateway counts uncoded 429s)', 'edge', "gateway_error_code != ''", "gateway_error_code = ''"],
  ['edge window 15 -> 60 minutes', 'edge', 'INTERVAL 15 MINUTE', 'INTERVAL 60 MINUTE'],
  ['edge window 15 -> 5 minutes', 'edge', 'INTERVAL 15 MINUTE', 'INTERVAL 5 MINUTE'],
  ['edge window 15 -> 1 minute', 'edge', 'INTERVAL 15 MINUTE', 'INTERVAL 1 MINUTE'],
  ['edge window 15 -> 16 minutes', 'edge', 'INTERVAL 15 MINUTE', 'INTERVAL 16 MINUTE'],
  ['method POST -> GET', 'edge', "method = 'POST'", "method = 'GET'"],
  ['drop the method filter', 'edge', "(method = 'POST' AND match(", '(match('],
  ['path regex unanchored', 'edge', "'^/rest/v1/rpc/record_quiz_event/?$'", "'/rest/v1/rpc/record_quiz_event'"],
  ['path regex for another function', 'edge', 'record_quiz_event/?$', 'record_quiz_events/?$'],
  ['wrong source', 'edge', "source = 'edge_logs'", "source = 'postgres_logs'"],
  ['wrong status key', 'edge', "log_attributes['response.status_code']                      AS status_raw", "log_attributes['response.status']                      AS status_raw"],
  ['wrong method key', 'edge', "log_attributes['request.method']", "log_attributes['request.verb']"],
  ['wrong path key', 'edge', "log_attributes['request.path']", "log_attributes['request.url']"],
  ['edge_429_total counts all paths', 'edge', 'countIf(is_rpc AND status = 429)  ', 'countIf(status = 429)  '],
  ['requests_total counts every row', 'edge', 'countIf(is_rpc)   ', 'count()   '],
  ['liveness edge_logs_total filtered to the RPC path', 'edge', 'count()                                                          AS edge_logs_total', 'countIf(is_rpc)                                                  AS edge_logs_total'],
  ['liveness schema check ignores the status key', 'edge', " AND status_raw != ''", ''],
  ['wrong SQLSTATE key', 'pg', "log_attributes['parsed.sql_state_code'] AS sqlstate", "log_attributes['parsed.sqlstate'] AS sqlstate"],
  ['PT429 replaced by 53400 in the count', 'pg', "sqlstate = 'PT429' AND severity = 'ERROR'", "sqlstate = '53400' AND severity = 'ERROR'"],
  ['PT429 replaced by PT400 in the count', 'pg', "sqlstate = 'PT429' AND severity = 'ERROR'", "sqlstate = 'PT400' AND severity = 'ERROR'"],
  ['PT400 replaced by PT429 in the probe count', 'pg', "sqlstate = 'PT400' AND severity = 'ERROR'", "sqlstate = 'PT429' AND severity = 'ERROR'"],
  ['PT429 count drops the severity filter (N44-05 multiplier)', 'pg', "sqlstate = 'PT429' AND severity = 'ERROR'", "sqlstate = 'PT429'"],
  ['PT400 count drops the severity filter', 'pg', "sqlstate = 'PT400' AND severity = 'ERROR'", "sqlstate = 'PT400'"],
  ['severity ERROR -> WARNING', 'pg', "severity = 'ERROR'", "severity = 'WARNING'"],
  ['wrong severity key', 'pg', "log_attributes['parsed.error_severity']", "log_attributes['parsed.severity']"],
  ['postgres window 15 -> 60 minutes', 'pg', 'INTERVAL 15 MINUTE', 'INTERVAL 60 MINUTE'],
  ['postgres window 15 -> 1 minute', 'pg', 'INTERVAL 15 MINUTE', 'INTERVAL 1 MINUTE'],
  ['postgres window 15 -> 16 minutes', 'pg', 'INTERVAL 15 MINUTE', 'INTERVAL 16 MINUTE'],
  ['wrong source', 'pg', "source = 'postgres_logs'", "source = 'edge_logs'"],
  ['re-add a PT-code IN filter that hides the liveness rows', 'pg', "AND timestamp >= now() - INTERVAL 15 MINUTE", "AND timestamp >= now() - INTERVAL 15 MINUTE AND log_attributes['parsed.sql_state_code'] IN ('PT429', 'PT400')"],
];
const mutate = (m) => {
  const [, which, from, to] = m;
  const src = which === 'edge' ? EDGE_SQL : PG_SQL;
  if (!src.includes(from)) throw new Error(`mutant "${m[0]}" does not apply: text not found: ${from}`);
  return src.replace(from, to);
};

// Load-bearing lines, asserted verbatim (whitespace-normalised) when no engine is available and always as a second layer.
const REQUIRED = {
  edge: [
    "countIf(is_rpc AND status = 429 AND gateway_error_code = '') AS edge_429_postgrest",
    "countIf(is_rpc AND status = 429 AND gateway_error_code != '') AS edge_429_gateway",
    'countIf(is_rpc AND status BETWEEN 400 AND 499 AND status != 429) AS edge_4xx_other',
    'countIf(is_rpc AND status = 429) AS edge_429_total',
    'countIf(is_rpc) AS requests_total',
    'count() AS edge_logs_total',
    "countIf(method != '' AND path != '' AND status_raw != '') AS edge_logs_schema_rows",
    "log_attributes['request.method'] AS method",
    "log_attributes['request.path'] AS path",
    "log_attributes['response.status_code'] AS status_raw",
    "log_attributes['response.headers.sb_error_code'] AS gateway_error_code",
    "(method = 'POST' AND match(path, '^/rest/v1/rpc/record_quiz_event/?$')) AS is_rpc",
    "WHERE source = 'edge_logs' AND timestamp >= now() - INTERVAL 15 MINUTE );",
  ],
  pg: [
    "countIf(sqlstate = 'PT429' AND severity = 'ERROR') AS pt429_log_count",
    "countIf(sqlstate = 'PT429') AS pt429_log_rows_any",
    "countIf(sqlstate = 'PT400' AND severity = 'ERROR') AS pt400_log_count",
    "countIf(sqlstate = 'PT400') AS pt400_log_rows_any",
    'count() AS pg_rows_total',
    "countIf(sqlstate != '') AS pg_rows_with_sqlstate",
    "countIf(severity != '') AS pg_rows_with_severity",
    "log_attributes['parsed.sql_state_code'] AS sqlstate",
    "log_attributes['parsed.error_severity'] AS severity",
    "WHERE source = 'postgres_logs' AND timestamp >= now() - INTERVAL 15 MINUTE );",
  ],
};
const missingFragments = (which, sql) => REQUIRED[which].filter((f) => !strip(sql).includes(f));

describe('ClickHouse alert queries: text guard (always runs)', () => {
  test('the shipped files carry every load-bearing line', () => {
    expect(missingFragments('edge', EDGE_SQL)).toEqual([]);
    expect(missingFragments('pg', PG_SQL)).toEqual([]);
  });

  test.each(MUTANTS.map((m) => [m[0] + (m[1] === 'edge' ? ' [edge]' : ' [pg]'), m]))('text guard kills mutant: %s', (name, m) => {
    const sql = mutate(m);
    expect(sql).not.toBe(m[1] === 'edge' ? EDGE_SQL : PG_SQL);
    expect(missingFragments(m[1], sql).length).toBeGreaterThan(0);
  });

  test('the files are read-only SELECTs without secrets', () => {
    for (const sql of [EDGE_SQL, PG_SQL]) {
      const body = strip(sql);
      expect(body).toMatch(/^SELECT /);
      expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|CREATE)\b/i);
    }
  });
});

describe('ClickHouse alert queries: executed on fixtures (chdb)', () => {
  if (REQUIRE_ENGINE) {
    test('the ClickHouse engine (chdb) is available (QUIZ_ALERTS_REQUIRE_CLICKHOUSE=1)', () => {
      expect(HAS_ENGINE).toBe(true);
    });
  }

  engineTest('both queries return the exact hand-counted numbers on every fixture', () => {
    expect(diffs(run())).toEqual([]);
  }, 180000);

  engineTest('every SQL mutant is killed: it changes at least one number on some fixture', () => {
    const survivors = [];
    for (const m of MUTANTS) {
      const sql = mutate(m);
      const results = run(m[1] === 'edge' ? { edge: sql } : { pg: sql });
      if (diffs(results).length === 0) survivors.push(`${m[0]} [${m[1]}]`);
    }
    expect(survivors).toEqual([]);
  }, 600000);

  engineTest('a blind pipeline (wrong or missing log keys) is no_data in the evaluator, never ok (N44-01)', () => {
    const base = { saturated_minutes: 0, probe_sent: 0 };
    const stats = (edgeRow, pgRow) => ({ ...base, ...edgeRow, ...pgRow });
    const [quiet, blindEdge, blindPgKey, blindPgSev, empty] = runScenarios([
      { rows: [...edge(50, 200), ...pgRows(10, '00000', { sev: 'LOG' })] },
      { rows: [...edge(5, 200, { drop: ['request.method'] }), ...pgRows(10, '00000', { sev: 'LOG' })] },
      { rows: [...edge(50, 200), ...Array.from({ length: 10 }, () => ({ source: 'postgres_logs', ago: 60, attrs: { 'parsed.error_severity': 'LOG' } }))] },
      { rows: [...edge(50, 200), ...pgRows(10, 'PT429', { sev: 'error' })] },
      { rows: [] },
    ]);
    const overall = (r) => evaluate(stats(r.edge, r.pg), defs);
    expect(overall(quiet).overall).toBe('ok');
    expect(overall(blindEdge).overall).toBe('no_data');
    expect(overall(blindPgKey).overall).toBe('no_data');
    expect(overall(blindPgSev).overall).toBe('no_data');
    expect(overall(empty).overall).toBe('no_data'); // no rows at all is an ingestion gap, not quiet
    const byId = (rep) => Object.fromEntries(rep.results.map((x) => [x.id, x]));
    expect(byId(overall(blindEdge))['QZ-4XX-SHARE'].state).toBe('no_data');
    expect(byId(overall(blindEdge))['QZ-429-EDGE-POSTGREST'].state).toBe('no_data');
    expect(byId(overall(blindPgKey))['QZ-429-PT429-LOG'].state).toBe('no_data');
    expect(byId(overall(blindPgSev))['QZ-429-PT429-LOG'].state).toBe('no_data');
  }, 180000);
});
