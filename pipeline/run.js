// run.js — the orchestrator. Loads every connector, runs each through the shared
// harness, and writes data/health.json (the machine-generated data-health page's
// backing data + the CI alert source). Never throws on a data failure: the site
// must still deploy with last-good. Failures surface as health flags + alerts.
//
//   node run.js                 # run all connectors
//   node run.js --only cre      # run connectors whose id includes "cre"
//   ENABLE_IMSS=1 node run.js --only imss

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runConnector, seriesIdFromUrl } from './lib/contract.js';
import { collectedAlerts } from './lib/alert.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONNECTOR_DIR = path.join(__dirname, 'connectors');
const HEALTH = path.join(__dirname, '..', 'data', 'health.json');

async function loadConnectors() {
  const files = fs.readdirSync(CONNECTOR_DIR).filter((f) => f.endsWith('.js'));
  const all = [];
  for (const f of files) {
    const mod = await import(path.join(CONNECTOR_DIR, f));
    const list = mod.connectors || (mod.manifest ? [mod] : []);
    for (const c of list) all.push(c);
  }
  return all;
}

// Load pipeline/.env (gitignored) into process.env if present — so tokens live
// in one local file, never in the shell history or the repo. CI uses real
// secrets instead. Zero-dependency KEY=VALUE parser.
function loadDotEnv() {
  const f = path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadDotEnv();
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  const now = new Date().toISOString();
  const ctx = { now, runId: now.replace(/[^0-9]/g, '').slice(0, 14) };

  let connectors = await loadConnectors();
  if (only) connectors = connectors.filter((c) => c.manifest.id.includes(only));
  if (!connectors.length) { console.error(`no connectors match "${only}"`); process.exit(1); }

  console.log(`\n▶ Mexico pipeline — ${connectors.length} connector(s) @ ${now}\n`);

  const records = [];
  for (const c of connectors) {
    const g = c.manifest.gatedBy;
    // A gated connector (heavy/infrequent) is SKIPPED — not failed — unless its
    // env gate is set or it was explicitly asked for. Skipping never alerts.
    if (g && process.env[g] !== '1' && !only) {
      console.log(`  · ${c.manifest.id.padEnd(26)} skipped     (gated by ${g})`);
      const sm = c.manifest;
      records.push({ id: sm.id, title: sm.title, metric: sm.metric, source: sm.source, seriesId: seriesIdFromUrl(sm.sourceUrl), sourceUrl: sm.sourceUrl, track: sm.track, kind: sm.kind, cadence: sm.cadence, status: 'skipped', gatedBy: g });
      continue;
    }
    const rec = await runConnector(c, ctx);
    const mark = rec.status === 'ok' ? '✓' : rec.status === 'ok_flagged' ? '⚠' : '✗';
    console.log(`  ${mark} ${rec.id.padEnd(26)} ${rec.status.padEnd(10)} ${rec.vintage || rec.message || ''}`);
    records.push(rec);
  }

  // geo-epoch (may not be built yet)
  let geo = null;
  try {
    const { geoEpoch } = await import('./lib/crosswalk.js');
    geo = geoEpoch();
  } catch { geo = { built: false }; }

  // one-canonical-source-per-metric: report where >1 source feeds a metric.
  const byMetric = {};
  for (const c of connectors) {
    (byMetric[c.manifest.metric] ||= []).push({ id: c.manifest.id, canonical: !!c.manifest.canonicalSource });
  }
  const contested = Object.entries(byMetric)
    .filter(([, list]) => list.length > 1)
    .map(([metric, list]) => ({ metric, canonical: list.find((x) => x.canonical)?.id || null, sources: list.map((x) => x.id) }));

  const alerts = collectedAlerts();
  const summary = {
    ok: records.filter((r) => r.status === 'ok').length,
    flagged: records.filter((r) => r.status === 'ok_flagged').length,
    failed: records.filter((r) => r.status === 'failed').length,
    skipped: records.filter((r) => r.status === 'skipped').length,
    darkSources: records.filter((r) => r.status === 'failed' && r.stale).map((r) => r.id),
  };

  // On a scoped (--only) run, MERGE into the existing health rather than replacing
  // it, so a partial run never blanks the other sources' status on the site.
  let sources = records;
  if (only && fs.existsSync(HEALTH)) {
    try {
      const prev = JSON.parse(fs.readFileSync(HEALTH, 'utf8'));
      const ran = new Set(records.map((r) => r.id));
      sources = [...prev.sources.filter((s) => !ran.has(s.id)), ...records];
      summary.ok = sources.filter((s) => s.status === 'ok').length;
      summary.flagged = sources.filter((s) => s.status === 'ok_flagged').length;
      summary.failed = sources.filter((s) => s.status === 'failed').length;
      summary.skipped = sources.filter((s) => s.status === 'skipped').length;
    } catch { /* fall back to records-only */ }
  }
  const health = { generatedAt: now, runId: ctx.runId, geoEpoch: geo, summary, alerts, reconciliation: contested, sources };
  fs.mkdirSync(path.dirname(HEALTH), { recursive: true });
  fs.writeFileSync(HEALTH, JSON.stringify(health, null, 2));

  console.log(`\n  ${summary.ok} ok · ${summary.flagged} flagged · ${summary.failed} failed`);
  if (alerts.length) {
    console.log(`  ${alerts.length} alert(s):`);
    for (const a of alerts) console.log(`    - [${a.id}] ${a.message}`);
    // Emit a CI-consumable file so a GitHub Action can open/refresh an issue.
    fs.writeFileSync(path.join(__dirname, 'alerts.json'), JSON.stringify(alerts, null, 2));
  }
  console.log(`\n  health -> data/health.json\n`);
  // Exit 0 even with data failures: the site deploys with last-good; CI reads alerts.json.
}

main().catch((e) => { console.error('FATAL orchestrator error:', e); process.exit(1); });
