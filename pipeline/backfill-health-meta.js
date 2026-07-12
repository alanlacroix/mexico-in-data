// backfill-health-meta.js — one-shot, no-network enrichment of data/health.json.
//
// The live run (run.js -> lib/contract.js) now stamps title, cadence, seriesId and
// sourceUrl onto every health record straight from the connector manifest. This
// script re-stamps those same four fields onto an EXISTING health.json without
// fetching anything, so the committed file the site ships already carries them
// (the sources page reads them directly, instead of a hand-typed source map).
//
// It only fills fields that are missing — it never touches status, vintage,
// flags, fetchedAt or finishedAt. Reading a manifest is side-effect free; no
// connector network call runs here.
//
//   node backfill-health-meta.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seriesIdFromUrl } from './lib/contract.js';

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

async function main() {
  const META = {};
  for (const c of await loadConnectors()) {
    const m = c.manifest;
    META[m.id] = { title: m.title, cadence: m.cadence, sourceUrl: m.sourceUrl, seriesId: seriesIdFromUrl(m.sourceUrl) };
  }

  const health = JSON.parse(fs.readFileSync(HEALTH, 'utf8'));
  let filled = 0;
  const missing = [];
  for (const r of health.sources) {
    const meta = META[r.id];
    if (!meta) { missing.push(r.id); continue; }
    if (r.title == null) r.title = meta.title;
    if (r.cadence == null) r.cadence = meta.cadence;
    if (r.sourceUrl == null) r.sourceUrl = meta.sourceUrl;
    if (r.seriesId == null) r.seriesId = meta.seriesId;
    filled++;
  }
  fs.writeFileSync(HEALTH, JSON.stringify(health, null, 2) + '\n');
  console.log(`backfilled ${filled}/${health.sources.length} records`);
  if (missing.length) console.log(`no manifest for: ${missing.join(', ')}`);
}

main().catch((e) => { console.error('backfill error:', e); process.exit(1); });
