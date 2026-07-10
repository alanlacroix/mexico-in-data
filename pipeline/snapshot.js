// snapshot.js — a daily snapshot of every tracked indicator's latest value, so the
// daily-habit homepage can compute "what changed since your last visit" deltas and
// draw sparklines. Fable's do-first, do-today move: this history CANNOT be backfilled
// (data accrues in real time; code can be written any time), so it starts accruing
// from the moment this ships. Deterministic, no LLM anywhere.
//
//   node snapshot.js
//
// Upserts ONE entry per calendar day into data/snapshots.json (today's overwrites
// through the day; keeps the last ~180 days). New indicators appear automatically the
// day they're wired, and their history starts from that day.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const D = path.join(__dirname, '..', 'data');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const today = new Date().toISOString().slice(0, 10);

const ind = {};

// every wired series → its latest value (auto-includes any series added later)
const seriesDir = path.join(D, 'series');
if (fs.existsSync(seriesDir)) {
  for (const f of fs.readdirSync(seriesDir).filter((x) => x.endsWith('.json'))) {
    const j = readJson(path.join(seriesDir, f), null);
    const rows = j?.data;
    if (!Array.isArray(rows) || !rows.length) continue;
    const last = rows[rows.length - 1];
    if (last?.value == null) continue;
    ind[j.meta?.id || f.replace(/\.json$/, '')] = { v: +last.value, d: last.date, metric: j.meta?.metric || null };
  }
}

// composite indicators from the built data files
const tj = readJson(path.join(D, 'trade-us.json'), null);
if (tj?.latest?.twoway_bn) ind['us_mx_trade_twoway'] = { v: tj.latest.twoway_bn, d: tj.latest.month, metric: 'trade_twoway' };

const snapFile = path.join(D, 'snapshots.json');
const store = readJson(snapFile, { meta: { note: 'Daily snapshot of every tracked indicator, for since-last-visit deltas. One entry per calendar day, most-recent value that day.' }, days: {} });
store.days[today] = { date: today, indicators: ind };

// keep the last 180 days
const keys = Object.keys(store.days).sort();
while (keys.length > 180) delete store.days[keys.shift()];

fs.mkdirSync(D, { recursive: true });
fs.writeFileSync(snapFile, JSON.stringify(store));
console.log(`snapshot ${today}: ${Object.keys(ind).length} indicators · ${Object.keys(store.days).length} day(s) banked`);
