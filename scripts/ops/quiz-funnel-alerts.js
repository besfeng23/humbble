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
  if (isCount(stats.edge_429_total) && isCount(stats.edge_429_postgrest) && isCount(stats.edge_429_gateway)
      && stats.edge_429_postgrest + stats.edge_429_gateway !== stats.edge_429_total) {
    throw new Error('edge_429_postgrest + edge_429_gateway must equal edge_429_total');
  }
}

function evaluateAlert(def, stats) {
  const base = { id: def.id, title: def.title, metric: def.metric, warn: def.warn, critical: def.critical };
  const raw = stats[def.metric];
  if (!isCount(raw)) return { ...base, state: 'no_data', value: null, note: `metric "${def.metric}" not provided` };

  let value = raw;
  if (def.kind === 'share') {
    const den = stats[def.denominator];
    if (!isCount(den)) return { ...base, state: 'no_data', value: null, note: `denominator "${def.denominator}" not provided` };
    if (den < def.min_denominator) {
      return { ...base, state: 'insufficient_volume', value: den === 0 ? 0 : raw / den, count: raw, denominator: den,
        note: `fewer than ${def.min_denominator} ${def.denominator}; share not evaluated` };
    }
    value = raw / den;
    base.count = raw;
    base.denominator = den;
  }
  const state = value >= def.critical ? 'critical' : value >= def.warn ? 'warn' : 'ok';
  return { ...base, state, value };
}

function evaluate(stats, definitions = loadDefinitions()) {
  validateStats(stats);
  const results = definitions.alerts.map((def) => evaluateAlert(def, stats));
  let overall = 'ok';
  for (const r of results) if (STATE_RANK[r.state] > STATE_RANK[overall]) overall = r.state;
  const info = {};
  for (const k of ['edge_429_gateway', 'pt400_log_count']) if (isCount(stats[k])) info[k] = stats[k];
  return { overall, exitCode: EXIT_CODE[overall], windowMinutes: definitions.window_minutes, results, info };
}

function formatText(report) {
  const lines = [`quiz-funnel alerts (window ${report.windowMinutes} min): ${report.overall.toUpperCase()}`];
  for (const r of report.results) {
    const val = r.value === null ? 'n/a' : (r.denominator !== undefined && r.state !== 'insufficient_volume') ? `${(r.value * 100).toFixed(1)}% (${r.count}/${r.denominator})` : String(r.value);
    lines.push(`  [${r.state.toUpperCase()}] ${r.id}  ${r.metric}=${val}  warn>=${r.warn} critical>=${r.critical}${r.note ? `  (${r.note})` : ''}`);
  }
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

module.exports = { DEFINITIONS_PATH, EXIT_CODE, evaluate, evaluateAlert, formatText, loadDefinitions, main, validateStats };

if (require.main === module) process.exitCode = main(process.argv);
