#!/usr/bin/env node
/* eslint-env node */
'use strict';
/**
 * Evaluates the quiz-funnel alert definitions (docs/operations/alerts/quiz-funnel/alerts.json) against window statistics.
 *
 * It is a pure, offline evaluator: it reads NO network, NO database and NO secret. Whoever runs the three read-only queries in
 * docs/operations/alerts/quiz-funnel/ (or any log pipeline that produces the same numbers) passes the results in as JSON.
 *
 *   node scripts/ops/quiz-funnel-alerts.js stats.json [--json]
 *   echo '{"requests_total":400,...}' | node scripts/ops/quiz-funnel-alerts.js - --json
 *
 * Exit code maps `overall`: 0 ok, 1 warn, 2 critical, 3 no_data (also used for unreadable or invalid input).
 * Precedence of `overall`: critical > warn > no_data > ok. An alert whose metric is absent is NO_DATA, never silently "ok",
 * because a blind alert looks exactly like a quiet one. A share alert below its minimum volume is INSUFFICIENT_VOLUME (counts as ok).
 *
 * Liveness (Themis N44-01): a log query whose field keys are wrong or missing returns ONE ROW OF ZEROS, which looks quiet. The
 * definitions therefore carry `liveness` checks (log volume, field presence, severity cross-check, synthetic probe). An alert listed
 * under `requires_liveness` is reported NO_DATA (never ok) while any of its liveness checks fails; it still reports warn/critical if
 * its own metric fires. The scheduler must also treat a failed or empty query as "metric not provided" (exit 3), never as zero.
 */
const fs = require('fs');
const path = require('path');

const DEFINITIONS_PATH = path.join(__dirname, '..', '..', 'docs', 'operations', 'alerts', 'quiz-funnel', 'alerts.json');

const STATE_RANK = { ok: 0, insufficient_volume: 0, no_data: 1, warn: 2, critical: 3 };
const EXIT_CODE = { ok: 0, warn: 1, critical: 2, no_data: 3 };

function loadDefinitions(file = DEFINITIONS_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isCount(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** Throws on a present-but-nonsensical value; absent (undefined/null) values are allowed and become NO_DATA. */
function validateStats(stats) {
  if (stats === null || typeof stats !== 'object' || Array.isArray(stats)) {
    throw new Error('stats must be a JSON object of non-negative integers');
  }
  for (const [k, v] of Object.entries(stats)) {
    if (v === null || v === undefined) continue;
    if (!isCount(v)) throw new Error(`stat "${k}" must be a non-negative integer, got ${JSON.stringify(v)}`);
  }
  const total = stats.requests_total;
  if (isCount(total)) {
    for (const k of ['edge_429_total', 'edge_429_postgrest', 'edge_429_gateway', 'edge_4xx_other']) {
      if (isCount(stats[k]) && stats[k] > total) throw new Error(`stat "${k}" (${stats[k]}) exceeds requests_total (${total})`);
    }
    if (isCount(stats.edge_4xx_other) && isCount(stats.edge_429_total) && stats.edge_4xx_other + stats.edge_429_total > total) {
      throw new Error('edge_4xx_other + edge_429_total exceeds requests_total');
    }
  }
  // Liveness inputs: a subset can never exceed the set it is counted from.
  const subsets = [['requests_total', 'edge_logs_total'], ['edge_logs_schema_rows', 'edge_logs_total'], ['pg_rows_with_sqlstate', 'pg_rows_total'],
    ['pg_rows_with_severity', 'pg_rows_total'], ['pt429_log_rows_any', 'pg_rows_total'], ['pt400_log_rows_any', 'pg_rows_total'],
    ['pt429_log_count', 'pt429_log_rows_any'], ['pt400_log_count', 'pt400_log_rows_any']];
  for (const [sub, sup] of subsets) {
    if (isCount(stats[sub]) && isCount(stats[sup]) && stats[sub] > stats[sup]) throw new Error(`stat "${sub}" (${stats[sub]}) exceeds "${sup}" (${stats[sup]})`);
  }
  if (isCount(stats.edge_429_total) && isCount(stats.edge_429_postgrest) && isCount(stats.edge_429_gateway)
      && stats.edge_429_postgrest + stats.edge_429_gateway !== stats.edge_429_total) {
    throw new Error('edge_429_postgrest + edge_429_gateway must equal edge_429_total');
  }
}

/**
 * One liveness check. Returns { id, title, rule, state: 'ok' | 'no_data', note? }.
 *   min:      stats[metric] >= min                      (the log source has rows at all)
 *   implies:  stats[if_metric] > 0  =>  stats[then_metric] > 0   (rows exist, so the field keys must match some of them)
 *   at_least: stats[metric] >= stats[other]             (every synthetic probe must be visible in the logs)
 * An absent input is no_data too, so a missing liveness metric can never read as healthy.
 */
function evaluateLiveness(def, stats) {
  const base = { id: def.id, title: def.title, rule: def.rule };
  const names = def.rule === 'min' ? [def.metric] : def.rule === 'implies' ? [def.if_metric, def.then_metric] : [def.metric, def.other];
  const missing = names.filter((n) => !isCount(stats[n]));
  if (missing.length) return { ...base, state: 'no_data', note: `liveness input "${missing.join('", "')}" not provided` };
  let healthy;
  if (def.rule === 'min') healthy = stats[def.metric] >= def.min;
  else if (def.rule === 'implies') healthy = !(stats[def.if_metric] > 0) || stats[def.then_metric] > 0;
  else if (def.rule === 'at_least') healthy = stats[def.metric] >= stats[def.other];
  else throw new Error(`unknown liveness rule "${def.rule}" in ${def.id}`);
  return healthy ? { ...base, state: 'ok' } : { ...base, state: 'no_data', note: def.failure };
}

function evaluateAlert(def, stats) {
  const base = { id: def.id, title: def.title, metric: def.metric, warn: def.warn, critical: def.critical };
  const raw = stats[def.metric];
  if (!isCount(raw)) return { ...base, state: 'no_data', value: null, note: `metric "${def.metric}" not provided` };

  let value = raw;
  if (def.kind === 'share') {
    let num = raw;
    let den = stats[def.denominator];
    if (!isCount(den)) return { ...base, state: 'no_data', value: null, note: `denominator "${def.denominator}" not provided` };
    // Synthetic probes are 4xx POSTs on the same path; take them out of both sides so they never feed the share (N44-01).
    if (def.exclude_probe && isCount(stats.probe_sent)) {
      num = Math.max(0, num - stats.probe_sent);
      den = Math.max(0, den - stats.probe_sent);
    }
    if (den < def.min_denominator) {
      return { ...base, state: 'insufficient_volume', value: den === 0 ? 0 : num / den, count: num, denominator: den,
        note: `fewer than ${def.min_denominator} ${def.denominator}; share not evaluated` };
    }
    value = num / den;
    base.count = num;
    base.denominator = den;
  }
  const state = value >= def.critical ? 'critical' : value >= def.warn ? 'warn' : 'ok';
  return { ...base, state, value };
}

function evaluate(stats, definitions = loadDefinitions()) {
  validateStats(stats);
  const liveness = (definitions.liveness || []).map((def) => evaluateLiveness(def, stats));
  const failing = new Set(liveness.filter((l) => l.state !== 'ok').map((l) => l.id));
  const results = definitions.alerts.map((def) => {
    const r = evaluateAlert(def, stats);
    const blind = (def.requires_liveness || []).filter((id) => failing.has(id));
    // A quiet reading from a pipeline that failed its liveness check is not "ok". Real warn/critical readings are kept.
    if (blind.length && (r.state === 'ok' || r.state === 'insufficient_volume')) {
      return { ...r, state: 'no_data', value: null, note: `pipeline liveness failed (${blind.join(', ')}); a zero here is not evidence of a quiet system` };
    }
    return r;
  });
  let overall = 'ok';
  for (const r of [...results, ...liveness]) if (STATE_RANK[r.state] > STATE_RANK[overall]) overall = r.state;
  const info = {};
  for (const k of ['edge_429_gateway', 'pt400_log_count', 'pt429_log_rows_any', 'pt400_log_rows_any', 'probe_sent']) if (isCount(stats[k])) info[k] = stats[k];
  return { overall, exitCode: EXIT_CODE[overall], windowMinutes: definitions.window_minutes, results, liveness, info };
}

function formatText(report) {
  const lines = [`quiz-funnel alerts (window ${report.windowMinutes} min): ${report.overall.toUpperCase()}`];
  for (const r of report.results) {
    const val = r.value === null ? 'n/a' : (r.denominator !== undefined && r.state !== 'insufficient_volume') ? `${(r.value * 100).toFixed(1)}% (${r.count}/${r.denominator})` : String(r.value);
    lines.push(`  [${r.state.toUpperCase()}] ${r.id}  ${r.metric}=${val}  warn>=${r.warn} critical>=${r.critical}${r.note ? `  (${r.note})` : ''}`);
  }
  const bad = report.liveness.filter((l) => l.state !== 'ok');
  lines.push(`  liveness: ${report.liveness.length - bad.length}/${report.liveness.length} ok`);
  for (const l of bad) lines.push(`  [${l.state.toUpperCase()}] ${l.id}${l.note ? `  (${l.note})` : ''}`);
  for (const [k, v] of Object.entries(report.info)) lines.push(`  info ${k}=${v}`);
  return lines.join('\n');
}

function main(argv) {
  const args = argv.slice(2);
  const asJson = args.includes('--json');
  const file = args.find((a) => a !== '--json');
  if (!file) {
    process.stderr.write('usage: quiz-funnel-alerts.js <stats.json|-> [--json]\n');
    return 3;
  }
  let report;
  try {
    const text = file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
    report = evaluate(JSON.parse(text));
  } catch (e) {
    process.stderr.write(`invalid input: ${e.message}\n`);
    return 3;
  }
  process.stdout.write(`${asJson ? JSON.stringify(report, null, 2) : formatText(report)}\n`);
  return report.exitCode;
}

module.exports = { DEFINITIONS_PATH, EXIT_CODE, evaluate, evaluateAlert, evaluateLiveness, formatText, loadDefinitions, main, validateStats };

if (require.main === module) process.exitCode = main(process.argv);
