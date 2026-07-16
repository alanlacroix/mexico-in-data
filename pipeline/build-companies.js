// build-companies.js — the automated "Companies worth following" tracker.
//
// Fully automated per Alan (the pipeline PICKS the companies AND writes the copy) and
// built LAST, run DARK first per Fable (this is the highest slop-regression risk on the
// list, so it ships behind the same deterministic gate and stays hidden on the homepage
// until a clean week is verified — flip _data/dailyBrief.js COMPANIES_LIVE to go live).
//
// It reads the curated event log, groups events by the `company` the curator tagged,
// ranks companies by recent activity x importance, and for each emits its LATEST dated
// development as the "signal" — the gated event context, nothing hand-written and nothing
// invented. No standing thesis (that was the one genuinely editorial thing); the machine
// writes only from owned, slop-gated facts.
//
//   node build-companies.js            # write data/companies.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSlop } from './lib/lint.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const D = (...p) => path.join(ROOT, 'data', ...p);
const OUT = D('companies.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const DAY = 864e5;
const MAX = 6;   // the watchlist stays a glance, never a directory

const SECTOR = { economy: 'Economy', money: 'Markets & money', politics: 'Politics', security: 'Security', society: 'Society', 'us-mexico': 'U.S.–Mexico' };

// Normalize a company name for grouping: drop legal suffixes + punctuation, lowercase.
const norm = (s) => String(s || '').trim().toLowerCase()
  .replace(/\b(s\.?a\.?b?\.?\s*de\s*c\.?v\.?|s\.?a\.?p\.?i\.?|inc|corp|ltd|plc|group|grupo|company|co)\b/g, '')
  .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

function main() {
  const now = new Date();
  const nowMs = now.getTime();
  const events = arr(readJson(D('happening.json'), { events: [] }).events)
    .filter((e) => e && String(e.company || '').trim() && !isSlop(e));

  const byCo = new Map();
  for (const e of events) {
    const key = norm(e.company); if (!key) continue;
    const g = byCo.get(key) || { name: e.company.trim(), events: [] };
    // Keep the shortest clean display name we have seen for this entity.
    if (e.company.trim().length < g.name.length) g.name = e.company.trim();
    g.events.push(e);
    byCo.set(key, g);
  }

  const companies = [...byCo.values()].map((g) => {
    g.events.sort((a, b) => String(b.date).localeCompare(String(a.date)) || ((b.importance || 0) - (a.importance || 0)));
    const latest = g.events[0];
    const ageDays = Math.max(0, (nowMs - (Date.parse(latest.date) || 0)) / DAY);
    const recency = ageDays <= 14 ? 1 : ageDays <= 30 ? 0.5 : 0.2;
    const score = g.events.reduce((s, e) => s + (e.importance || 0), 0) * recency;
    return {
      name: g.name,
      sector: SECTOR[latest.section] || 'Economy',
      signal: String(latest.context || latest.why || '').trim(),
      date: latest.date, url: latest.url || '', section: latest.section,
      count: g.events.length, _score: score,
    };
  })
    // Final gate: a company card must have a real dated, linked, clean signal.
    .filter((c) => c.signal && c.url && c.date && !isSlop({ title: c.name, context: c.signal, url: c.url, date: c.date }))
    .sort((a, b) => b._score - a._score || String(b.date).localeCompare(String(a.date)))
    .slice(0, MAX)
    .map(({ _score, ...c }) => c);

  const out = {
    meta: {
      title: 'Companies worth following',
      note: 'Auto-tracked: the companies most active in the curated event log, each with its latest dated development. Machine-written from gated facts only; no hand-written copy.',
      generatedAt: now.toISOString(), count: companies.length,
    },
    companies,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`  wrote ${path.relative(ROOT, OUT)} · ${companies.length} companies (from ${events.length} tagged events)`);
}

main();
