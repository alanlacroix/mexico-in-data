// build-areas.js — the homepage "areas": the tagged event store projected into topic blocks,
// each a short synthesis + its top headlines. This is how Al reads — by topic — so the areas
// are the page's browse layer (they replace the flat cross-domain list). Same law: every
// headline dated + linked; the synthesis is the model's READ of items shown right below it,
// never new facts.
//
// Fail-soft: only events with an explicitly promoted `context` that passes the report gate
// may render. A synthesis uses that reviewed context, or generated copy when
// ALLOW_GENERATED_PUBLIC_COPY=1 and the same strict gate accepts it. Raw `why` fields and
// feed deks never become public fallback prose. Empty topics stay empty, never padded.
//
//   node build-areas.js            # write data/areas.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askJSON, hasLLM, usage, model } from './lib/anthropic.js';
import { lintReportText } from './lib/lint.js';
import { PUBLIC_TOPIC_AREAS } from './lib/publication-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const D = (...p) => path.join(ROOT, 'data', ...p);
const OUT = process.env.AREAS_OUT || D('areas.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const WINDOW_DAYS = 30, PER_AREA = 3;
const ALLOW_GENERATED_PUBLIC_COPY = process.env.ALLOW_GENERATED_PUBLIC_COPY === '1';

// The six public topics, in the same order and language as the site navigation. Payments and Trade
// are narrower lenses over the event store; Economy & money excludes those specific events so a
// payment release does not disappear into the broader economy bucket. This file is the canonical
// taxonomy for the homepage. Do not create a second set of topic names in a template.
const PAYMENTS_RX = /\bpayments?\b|\bpagos?\b|\bspei\b|\bcodi\b|\bdimo\b|fintech|tarjet|card payments?|cashless|transferencias?/i;
const TRADE_RX = /\bexports?\b|\bimports?\b|\btrade\b|comercio|exportaci|importaci|aduan|customs|manufactur|automotive|autos?\b|nearshor/i;
const AREA_ROUTING = {
  economy: { sections: ['economy', 'money'], beats: ['economy', 'money'], exclude: new RegExp(`${PAYMENTS_RX.source}|${TRADE_RX.source}`, 'i') },
  payments: { sections: [], beats: [], match: PAYMENTS_RX },
  trade: { sections: [], beats: [], match: TRADE_RX },
  politics: { sections: ['politics'], beats: ['politics'] },
  society: { sections: ['society', 'security'], beats: ['society', 'security'] },
  usmexico: { sections: ['us-mexico'], beats: ['us-mexico'] },
};
const AREAS = PUBLIC_TOPIC_AREAS.map((topic) => ({ ...topic, ...AREA_ROUTING[topic.key] }));

const norm = (t) => (t || '').toLowerCase().replace(/[^a-z0-9áéíóúñü ]/g, ' ').replace(/\s+/g, ' ').trim();
function jaccard(a, b) { const A = new Set(a.split(' ').filter((w) => w.length > 3)), B = new Set(b.split(' ').filter((w) => w.length > 3)); if (!A.size || !B.size) return 0; let i = 0; for (const w of A) if (B.has(w)) i++; return i / (A.size + B.size - i); }
function weekKey(dt) { const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return d.getUTCFullYear() + '-W' + String(Math.ceil((((d - ys) / 864e5) + 1) / 7)).padStart(2, '0'); }

// gather the CURATED events only (happening.json). The raw news wire was retired from public
// surfaces (Fable, 2026-07-11): the areas render human-curated developments only — ten curated
// items beat eighty raw ones, and "Chocolate Abuelita under Security" is what auto-filing looks
// like without a human. The wire still runs internally as the inbox curation draws from.
function allItems(now) {
  const events = arr(readJson(D('happening.json'), { events: [] }).events).map((e) => {
    const context = String(e.context || '').replace(/\s+/g, ' ').trim();
    const gate = lintReportText({ text: context, inputs: [e.date, e.title, context], maxWords: 45, maxSentences: 2 });
    if (context && !gate.ok) console.warn(`  exclude ${e.id || e.title}: reviewed context failed report gate (${gate.flags.join('; ')})`);
    return {
      kind: 'event', section: e.section, beat: e.section, title: e.title, why: e.why || '',
      context: gate.ok ? context : '', source: e.source, url: e.url,
      date: (e.date || '').slice(0, 10), importance: e.importance || 3,
      _t: Date.parse(e.date) || 0,
    };
  }).filter((e) => e.context);
  return { events, news: [] };
}

function forArea(area, items, used) {
  const inArea = (x) => {
    const text = (x.title || '') + ' ' + (x.why || '');
    if (area.exclude && area.exclude.test(text)) return false;
    return (area.sections.includes(x.section)) || (area.beats.includes(x.beat)) || (area.match && area.match.test(text));
  };
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
  // A reviewed context is the deterministic last-good summary. If none exists, leave the
  // summary out and keep the dated, sourced headlines. An empty line is better than filler.
  const fallback = (items) => {
    for (const item of items) {
      const text = String(item.context || '').replace(/\s+/g, ' ').trim();
      const gate = lintReportText({ text, inputs: [item.date, item.title, text], maxWords: 45, maxSentences: 2 });
      if (gate.ok) return text;
    }
    return '';
  };
  if (!hasLLM() || !ALLOW_GENERATED_PUBLIC_COPY) return areasWithItems.map((a) => {
    const synthesis = fallback(a.items);
    return { ...a, synthesis, synthesisStatus: synthesis ? 'reviewed' : 'unavailable' };
  });
  const schema = { type: 'object', additionalProperties: false, required: ['syntheses'], properties: { syntheses: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'text'], properties: { key: { type: 'string' }, text: { type: 'string' } } } } } };
  const payload = areasWithItems.filter((a) => a.items.length).map((a) => ({ key: a.key, area: a.label, items: a.items.map((i) => `${i.title}${i.context ? ': ' + i.context : ''}`) }));
  const system = `You write the one- to two-sentence synthesis that opens each topic area of a personal Mexico brief. For each area, read its items and write the READ: what's the through-line and why it matters — built ONLY from the items given, no new facts, no forecasts, no adjectives standing in for an argument. Plain and calm. Max 40 words per area. Return JSON: syntheses = [{key, text}].`;
  const out = await askJSON({ system, user: JSON.stringify(payload), schema, maxTokens: 1200 });
  const byKey = new Map((out && arr(out.syntheses) || []).map((s) => [s.key, s.text]));
  return areasWithItems.map((a) => {
    const generated = String(byKey.get(a.key) || '').trim();
    const inputs = a.items.flatMap((i) => [i.date, i.title, i.context]);
    const gate = lintReportText({ text: generated, inputs, maxWords: 40, maxSentences: 2 });
    if (generated && !gate.ok) console.warn(`  reject ${a.key} synthesis: ${gate.flags.join('; ')}`);
    if (generated && gate.ok) return { ...a, synthesis: generated, synthesisStatus: 'generated-gated' };
    const synthesis = fallback(a.items);
    return { ...a, synthesis, synthesisStatus: synthesis ? 'reviewed' : 'unavailable' };
  });
}

async function main() {
  const now = new Date();
  console.log(`\nbuild-areas · ${hasLLM() && ALLOW_GENERATED_PUBLIC_COPY ? model : 'reviewed context only'}`);
  const items = allItems(now);
  const used = new Set();   // an item lands in exactly one area — the first that claims it, in the fixed order
  const withItems = AREAS.map((a) => ({ key: a.key, label: a.label, href: a.href, items: forArea(a, items, used) }));
  const synthd = await synthesize(withItems);
  const areas = synthd.map((a) => ({
    key: a.key, label: a.label, href: a.href, synthesis: a.synthesis, synthesisStatus: a.synthesisStatus,
    // context carried through for the hover-preview feature (Fable 2026-07-16): already gated
    // + sourced, so surfacing it costs nothing and no headline appears that can't explain itself.
    headlines: a.items.map((i) => ({ title: i.title, source: i.source, url: i.url, date: i.date, context: i.context })),
  }));
  const out = { meta: { title: 'The areas', updated: now.toISOString().slice(0, 10), generatedAt: now.toISOString(), llm: hasLLM() }, areas };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  const u = usage();
  console.log(`  wrote ${path.relative(ROOT, OUT)} · ${areas.length} areas · ${areas.reduce((n, a) => n + a.headlines.length, 0)} headlines · ${areas.filter((a) => !a.headlines.length).length} empty`);
  console.log(`  llm: ${u.calls} calls · ~$${u.costUSD.toFixed(4)}\n`);
}

main().catch((e) => { console.error('build-areas failed:', e.stack || e.message); process.exit(1); });
