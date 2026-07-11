// db-sync.js — logs the DELTA of every pull into the historical vintage store (Fable's DB spine).
//
// Reads data/series/*.json and, for each point, compares it to the DB's latest value for that
// (metric, period). Inserts only NEW periods or CHANGED values (revisions) — not the whole history
// every run. First run backfills the current JSON as the initial vintage; after that it's a trickle.
//
// Fail-soft: with no SUPABASE_URL/SUPABASE_SERVICE_KEY it's a no-op and the pipeline runs unchanged.
// Never blocks a deploy — the site reads JSON, never this store. Run after the connectors + fetch-trade.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasStore, insertRun, upsertMetrics, latestObsFor, insertObservations } from './lib/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SER = path.join(__dirname, '..', 'data', 'series');

(async () => {
  if (!hasStore()) { console.log('db-sync: no SUPABASE_URL/SUPABASE_SERVICE_KEY — skipping (pipeline unaffected).'); return; }
  if (!fs.existsSync(SER)) { console.log('db-sync: no series dir; nothing to log.'); return; }

  const files = fs.readdirSync(SER).filter((f) => f.endsWith('.json'));
  const runId = await insertRun({ git_sha: process.env.GITHUB_SHA || null, status: 'success' });
  const metrics = [];
  const toInsert = [];
  const fetchedAt = new Date().toISOString();

  for (const f of files) {
    const id = f.replace('.json', '');
    let d; try { d = JSON.parse(fs.readFileSync(path.join(SER, f), 'utf8')); } catch { continue; }
    if (!Array.isArray(d.data) || !d.data.length) continue;
    const m = d.meta || {};
    metrics.push({
      metric_id: id, source: m.source || null,
      source_series_id: (String(m.sourceUrl || '').match(/series\/([A-Za-z]{2,4}\d+)/) || [])[1] || null,
      unit: m.units || null, cadence: m.cadence || null, title: m.title || m.metric || null,
    });
    const known = await latestObsFor(id);   // {period -> current DB value}
    for (const p of d.data) {
      const v = Number(p.value); if (!Number.isFinite(v)) continue;
      const period = String(p.date).length === 7 ? p.date + '-01' : String(p.date).slice(0, 10);
      const prev = known.get(period);
      if (prev == null || Math.abs(prev - v) > 1e-9) toInsert.push({ metric_id: id, period, value: v, fetched_at: fetchedAt, run_id: runId });
    }
  }

  if (metrics.length) await upsertMetrics(metrics);
  if (toInsert.length) await insertObservations(toInsert);
  console.log(`db-sync: ${metrics.length} metrics · ${toInsert.length} new/changed observations logged to the vintage store.`);
})().catch((e) => { console.error('db-sync error (non-fatal):', e.message); process.exit(0); });
