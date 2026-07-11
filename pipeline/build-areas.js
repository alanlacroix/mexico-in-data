// build-areas.js — the homepage "areas": the tagged event store projected into topic blocks,
// each a short synthesis + its top headlines. This is how Al reads — by topic — so the areas
// are the page's browse layer (they replace the flat cross-domain list). Same law: every
// headline dated + linked; the synthesis is the model's READ of items shown right below it,
// never new facts.
//
// Fail-soft: with no ANTHROPIC_API_KEY the synthesis falls back to the top item's own
// one-liner (an event's "why", a headline's dek) — honest, just not synthesized. Headlines
// always render. Empty topic → "Nothing major this week", never padded.
//
//   node build-areas.js            # write data/areas.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askJSON, hasLLM, usage, model } from './lib/anthropic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const D = (...p) => path.join(ROOT, 'data', ...p);
const OUT = process.env.AREAS_OUT || D('areas.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const WINDOW_DAYS = 30, PER_AREA = 3;

// The seven areas, fixed order, in Al's language. Each pulls from the event store (happening.json,
// tagged by section) and the news wire (tagged by beat), plus an optional keyword lens.
const AREAS = [
  { key: 'economy',  label: 'The Economy',             href: '/economy.html',   sections: ['economy'],   beats: ['economy'] },
  { key: 'money',    label: 'Money & fintech',         href: '/money.html',     sections: ['money'],     beats: ['companies', 'deals', 'fintech', 'markets'] },
  { key: 'politics', label: 'Politics & elections',    href: '/politics.html',  sections: ['politics'],  beats: ['politics'] },
  { key: 'security', label: 'Security',                href: '/security.html',  sections: ['security'],  beats: ['security'] },
  { key: 'usmexico', label: 'US–Mexico',          href: '/us-mexico.html', sections: ['us-mexico'], beats: ['us-mexico', 'trade'] },
  { key: 'world',    label: 'The wider world → Mexico', href: '/us-mexico.html', sections: [], beats: [], match: /\bchina\b|chino|global|\bfed\b|reserva federal|opec|oil price|precio del petr|world bank|banco mundial|\bimf\b|\bfmi\b|europe|europa|eurozone|arancel.*(china|ee\.?uu|europ)|tariff.*(china|eu\b|europ)/i },
  { key: 'society',  label: 'Society',                 href: '/society.html',   sections: ['society'],   beats: [] },
];

const norm = (t) => (t || '').toLowerCase().replace(/[^a-z0-9áéíóúñü ]/g, ' ').replace(/\s+/g, ' ').trim();
function jaccard(a, b) { const A = new Set(a.split(' ').filter((w) => w.length > 3)), B = new Set(b.split(' ').filter((w) => w.length > 3)); if (!A.size || !B.size) return 0; let i = 0; for (const w of A) if (B.has(w)) i++; return i / (A.size + B.size - i); }
function weekKey(dt) { const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return d.getUTCFullYear() + '-W' + String(Math.ceil((((d - ys) / 864e5) + 1) / 7)).padStart(2, '0'); }

// gather the CURATED events only (happening.json). The raw news wire was retired from public
// surfaces (Fable, 2026-07-11): the areas render human-curated developments only — ten curated
// items beat eighty raw ones, and "Chocolate Abuelita under Security" is what auto-filing looks
// like without a human. The wire still runs internally as the inbox curation draws from.
function allItems(now) {
  const events = arr(readJson(D('happening.json'), { events: [] }).events).map((e) => ({
    kind: 'event', section: e.section, beat: e.section, title: e.title, why: e.why || '',
    source: e.source, url: e.url, date: (e.date || '').slice(0, 10), importance: e.importance || 3,
    _t: Date.parse(e.date) || 0,
  }));
  return { events, news: [] };
}

function forArea(area, items, used) {
  const inArea = (x) => (area.sections.includes(x.section)) || (area.beats.includes(x.beat)) || (area.match && area.match.test((x.title || '') + ' ' + (x.why || '')));
  const pool = [...items.events.filter(inArea), ...items.news.filter(inArea)];
  pool.sort((a, b) => (b.importance - a.importance) || (b._t - a._t));
  const kept = [];
  for (const x of pool) {
    if (used.has(x.url)) continue;                                              // one item, one area (first area in the fixed order wins)
    if (kept.some((k) => jaccard(norm(k.title), norm(x.title)) >= 0.6)) continue;
    kept.push(x); used.add(x.url);
    if (kept.length >= PER_AREA) break;
  }
  return kept;
}

async function synthesize(areasWithItems) {
  // fail-soft default: the top item's own one-liner, trimmed
  const fallback = (items) => { const top = items[0]; if (!top) return ''; let s = (top.why || top.title || '').replace(/\s+/g, ' ').trim(); if (s.length > 180) s = s.slice(0, 177).replace(/\s+\S*$/, '') + '…'; return s; };
  if (!hasLLM()) return areasWithItems.map((a) => ({ ...a, synthesis: fallback(a.items) }));
  const schema = { type: 'object', additionalProperties: false, required: ['syntheses'], properties: { syntheses: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'text'], properties: { key: { type: 'string' }, text: { type: 'string' } } } } } };
  const payload = areasWithItems.filter((a) => a.items.length).map((a) => ({ key: a.key, area: a.label, items: a.items.map((i) => `${i.title}${i.why ? ' — ' + i.why.slice(0, 140) : ''}`) }));
  const system = `You write the one- to two-sentence synthesis that opens each topic area of a personal Mexico brief. For each area, read its items and write the READ: what's the through-line and why it matters — built ONLY from the items given, no new facts, no forecasts, no adjectives standing in for an argument. Plain and calm. Max 40 words per area. Return JSON: syntheses = [{key, text}].`;
  const out = await askJSON({ system, user: JSON.stringify(payload), schema, maxTokens: 1200 });
  const byKey = new Map((out && arr(out.syntheses) || []).map((s) => [s.key, s.text]));
  return areasWithItems.map((a) => ({ ...a, synthesis: (byKey.get(a.key) || fallback(a.items)) }));
}

async function main() {
  const now = new Date();
  console.log(`\nbuild-areas · model ${hasLLM() ? model : 'none (fallback synthesis)'}`);
  const items = allItems(now);
  const used = new Set();   // an item lands in exactly one area — the first that claims it, in the fixed order
  const withItems = AREAS.map((a) => ({ key: a.key, label: a.label, href: a.href, items: forArea(a, items, used) }));
  const synthd = await synthesize(withItems);
  const areas = synthd.map((a) => ({
    key: a.key, label: a.label, href: a.href, synthesis: a.synthesis,
    headlines: a.items.map((i) => ({ title: i.title, source: i.source, url: i.url, date: i.date })),
  }));
  const out = { meta: { title: 'The areas', updated: now.toISOString().slice(0, 10), generatedAt: now.toISOString(), llm: hasLLM() }, areas };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  const u = usage();
  console.log(`  wrote ${path.relative(ROOT, OUT)} · ${areas.length} areas · ${areas.reduce((n, a) => n + a.headlines.length, 0)} headlines · ${areas.filter((a) => !a.headlines.length).length} empty`);
  console.log(`  llm: ${u.calls} calls · ~$${u.costUSD.toFixed(4)}\n`);
}

main().catch((e) => { console.error('build-areas failed:', e.stack || e.message); process.exit(1); });
