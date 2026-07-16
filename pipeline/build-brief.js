// build-brief.js — the homepage brief generator. Writes the two-paragraph synthesis that
// opens the site: paragraph 1 = "what's moving" (this week's developments), paragraph 2 =
// "where things stand" (standing conditions + live numbers). Per Fable's ruling, the model
// only ARRANGES facts we already own; it is never the source of truth.
//
// THE LAW — enforced by this build, not by the prompt:
//   • Closed world. The only inputs are three files: happening.json (events), the board
//     numbers, and standing.json (structural facts). Nothing else.
//   • No sentence without a link. Every output sentence carries the item id(s) it draws
//     from; a sentence with no ref, or a ref to an id that isn't in the pool, is rejected.
//     This bans forecasts, outside facts, and vibes — they'd have nothing to link to.
//   • The model never does math. Any number in the prose must appear verbatim in an input.
//   • 120 words, hard cap. The anti-wall-of-text guarantee.
//   • Fail-soft is a feature. No key, refusal, lint fail, or an unlinked sentence → a
//     deterministic stitch (top events + a standing line), which Fable judged 90% of the
//     value at zero model risk. The page never blocks on the model, never ships unlinked prose.
//
//   node build-brief.js            # write data/brief.json
//
// Output: data/brief.json — { meta, mode, paragraphs:[[{text, refs:[id]}]] }. The homepage
// renders each sentence as a subtle link to the item it cites.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askJSON, hasLLM, usage, model } from './lib/anthropic.js';
import { lintReportText } from './lib/lint.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const D = (...p) => path.join(ROOT, 'data', ...p);
const OUT = process.env.BRIEF_OUT || D('brief.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const WORD_CAP = 120;

// ---- the board (a few live numbers, each a referenceable item) ----
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function series(id) {
  const j = readJson(D('series', id + '.json'), null);
  return (j?.data || []).filter((x) => x && x.value != null)
    .map((x) => ({ t: Date.parse(x.date), v: +x.value, date: x.date }))
    .filter((x) => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
}
function board() {
  const items = [];
  // Each board item carries its series id + a {v} template, so the PAGE re-renders the number live
  // from the same series the board reads, formatted the same way — the prose can never drift from
  // the board (the 17.60-vs-17.48 bug). The baked text stays as the no-JS/fetch-fail fallback.
  const peso = series('banxico-usdmxn-fix'); if (peso.length) items.push({ id: 'board-peso', label: 'the peso', text: `the peso trades at ${peso.at(-1).v.toFixed(2)} pesos to the dollar`, source: 'Banco de México', url: '/economy.html', series: 'banxico-usdmxn-fix', tmpl: 'the peso trades at {v} pesos to the dollar' });
  const inf = series('banxico-inflacion'); if (inf.length) items.push({ id: 'board-inflation', label: 'inflation', text: `inflation is ${inf.at(-1).v.toFixed(2)}%`, source: 'INEGI', url: '/economy.html', series: 'banxico-inflacion', tmpl: 'inflation is {v}%' });
  const rate = series('banxico-tasa-objetivo'); if (rate.length) items.push({ id: 'board-rate', label: 'the policy rate', text: `the policy rate is ${rate.at(-1).v.toFixed(2)}%`, source: 'Banco de México', url: '/economy.html', series: 'banxico-tasa-objetivo', tmpl: 'the policy rate is {v}%' });
  const gdp = series('banxico-pib-crecimiento'); if (gdp.length) { const v = gdp.at(-1).v; items.push({ id: 'board-growth', label: 'growth', text: `growth is running near ${(v >= 0 ? '+' : '') + v.toFixed(1)}%`, source: 'INEGI', url: '/economy.html' }); }
  return items;
}

// ---- the referenceable pool: events + standing facts + board numbers ----
function pool() {
  const events = arr(readJson(D('happening.json'), { events: [] }).events)
    .map((e) => ({ ...e, _t: Date.parse(e.date) || 0 }))
    .sort((a, b) => (b.importance - a.importance) || (b._t - a._t));
  const standing = arr(readJson(D('standing.json'), { facts: [] }).facts);
  const nums = board();
  const byId = new Map();
  [...events.map((e) => ({ id: e.id, url: e.url, source: e.source })),
   ...standing.map((s) => ({ id: s.id, url: s.url, source: s.source })),
   ...nums.map((n) => ({ id: n.id, url: n.url, source: n.source }))].forEach((x) => byId.set(x.id, x));
  return { events, standing, nums, byId };
}

const wordCount = (paras) => paras.flat().reduce((n, s) => n + (s.text.trim().split(/\s+/).filter(Boolean).length), 0);

// ---- deterministic stitch (the always-valid fallback; ships when the model can't) ----
const endPunct = (t) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t && !/[.!?]$/.test(t) ? t + '.' : t; };
function stitch({ events, standing, nums }) {
  const p1 = [];
  for (const e of events.slice(0, 3)) if (e.title) p1.push({ text: endPunct(e.title), refs: [e.id] });
  const p2 = [];
  // one structural anchor + the standing swing factor
  const usmca = standing.find((s) => s.id === 'std-usmca-review'), dep = standing.find((s) => s.id === 'std-us-dependence'), growth = standing.find((s) => s.id === 'std-weak-growth');
  if (dep) p2.push({ text: dep.fact, refs: [dep.id] });
  if (growth) p2.push({ text: growth.fact, refs: [growth.id] });
  // the live numbers, in one verbatim sentence
  if (nums.length) {
    const pick = nums.filter((n) => ['board-inflation', 'board-rate', 'board-peso'].includes(n.id));
    if (pick.length) p2.push({ text: capitalize(pick.map((n) => n.text).join('; ')) + '.', refs: pick.map((n) => n.id), live: pick.map((n) => ({ series: n.series, tmpl: n.tmpl })) });
  }
  if (usmca) p2.push({ text: usmca.fact, refs: [usmca.id] });
  return [p1.length ? p1 : (p2.splice(0, 1)), p2].filter((p) => p.length);
}
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ---- validation: every sentence must carry a ref, and every ref must exist ----
function valid(paras, byId) {
  if (!paras.length || !paras.flat().length) return false;
  for (const s of paras.flat()) {
    if (!s || !s.text || !Array.isArray(s.refs) || !s.refs.length) return false;
    if (!s.refs.every((id) => byId.has(id))) return false;
  }
  if (wordCount(paras) > WORD_CAP) return false;
  return true;
}

// ---- model path: arrange the owned facts into two paragraphs, each sentence linked ----
async function modelBrief(P) {
  const { events, standing, nums, byId } = P;
  const items = [
    ...events.slice(0, 8).map((e) => ({ id: e.id, kind: 'event', date: e.date, section: e.section, text: `${e.title}${e.why ? ' — ' + e.why : ''}` })),
    ...standing.map((s) => ({ id: s.id, kind: 'standing', text: s.fact })),
    ...nums.map((n) => ({ id: n.id, kind: 'number', text: n.text })),
  ];
  const schema = { type: 'object', additionalProperties: false, required: ['paragraphs'], properties: { paragraphs: { type: 'array', items: {
    type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'refs'], properties: {
      text: { type: 'string' }, refs: { type: 'array', items: { type: 'string' } } } } } } } };
  const system = `You write the two-paragraph brief that opens The Mexico Brief — a personal daily read for someone who wants to understand Mexico. You do NOT report; you ARRANGE the facts already gathered below into a tight synthesis.
IRON RULES:
- Use ONLY the items provided. Every sentence must set "refs" to the id(s) of the item(s) it is built from. Never state anything you cannot attribute to a provided item's id.
- No forecasts, no outside facts, no opinion, no adjectives standing in for an argument. Any number must appear verbatim in an item you cite.
- Paragraph 1 = "what's moving": synthesize the 3-4 most important recent EVENTS into flowing prose, date-anchored ("This week…"), not a list.
- Paragraph 2 = "where things stand": the standing conditions and live numbers — the structural state and the swing factor.
- Hard limit: 120 words across both paragraphs. Plain, calm, concrete. Return JSON: paragraphs = array of paragraphs; each paragraph = array of {text, refs}.`;
  const out = await askJSON({ system, user: JSON.stringify(items), schema, maxTokens: 900 });
  if (!out || !Array.isArray(out.paragraphs)) return null;
  const paras = out.paragraphs.map((p) => arr(p).map((s) => ({ text: String(s.text || '').trim(), refs: arr(s.refs).filter((id) => byId.has(id)) })));
  return valid(paras, byId) ? paras : null;
}

// ---- the new Brief (Fable 2026-07-12): 3-5 rubric-ranked items, each headline + explained context ----
const stripDash = (t) => String(t || '').replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim();  // voice law: no em-dash
const WORDS = (t) => stripDash(t).split(/\s+/).filter(Boolean).length;
// The event's shipped context is its `context` field, or the curator's `why` when no
// hand-promoted context exists. `why` used to be distrusted (it could be a raw truncated
// feed dek), so the Brief only accepted `context`, which is what kept fresh curated events
// out of the Brief and left it stale. Now build-happening's slop gate guarantees every
// stored `why` is clean rewritten English (link + date + whole sentences), so it may feed
// the Brief. lintReportText still enforces style + the no-invented-numbers rule below.
const shippedContext = (e) => (e && (e.context || e.why)) || '';
const contextGate = (e) => lintReportText({
  text: shippedContext(e),
  inputs: [e.date, e.title, e.context, e.why],
  maxWords: 55,
  maxSentences: 2,
});
const ctxOf = (e) => stripDash(contextGate(e).ok ? shippedContext(e) : '');
// select the lead items by the rubric (importance >= 5, cap 8 per the 2026-07-16 audit,
// soft floor 3). The threshold is the selectivity; the count flexes 3-8. See BRIEF-RUBRIC.md.
function select(events) {
  const THRESH = 5, CAP = 8, FLOOR = 3;
  const ranked = events.filter((e) => {
    const gate = contextGate(e);
    if (!gate.ok && (e.importance || 0) >= THRESH) console.warn(`  hold ${e.id}: ${gate.flags.join('; ')}`);
    return gate.ok && e.url && e.source;
  }).sort((a, b) => (b.importance - a.importance) || (b._t - a._t));
  let picked = ranked.filter((e) => (e.importance || 0) >= THRESH).slice(0, CAP);
  if (picked.length < FLOOR) picked = ranked.slice(0, FLOOR);
  return picked;
}
function buildStanding(nums) {
  const pick = nums.filter((n) => ['board-peso', 'board-inflation', 'board-rate'].includes(n.id));
  if (!pick.length) return null;
  return { text: capitalize(pick.map((n) => n.text).join('; ')) + '.', live: pick.map((n) => ({ series: n.series, tmpl: n.tmpl })),
    refs: pick.map((n) => n.id), href: '/economy.html', source: 'Banco de México / INEGI' };
}

async function main() {
  const now = new Date();
  console.log(`\nbuild-brief · ${hasLLM() ? 'llm available (drafts only, gated)' : 'no llm — human context'}`);
  const P = pool();
  if (!P.events.length) { console.warn('  no events — nothing to write'); return; }

  const picked = select(P.events);
  if (!picked.length) throw new Error('no reviewed event context is ready for the Brief; keeping the last-good brief');
  const lead0 = picked[0];
  const lead = { h1: stripDash(lead0.title).replace(/\.\s*$/, ''), context: ctxOf(lead0), refs: [lead0.id],
    href: lead0.url || '', source: lead0.source || '', date: lead0.date || '', section: lead0.section || '' };
  const items = picked.slice(1).map((e) => ({ headline: stripDash(e.title).replace(/\.\s*$/, ''), context: ctxOf(e),
    refs: [e.id], href: e.url || '', source: e.source || '', date: e.date || '', section: e.section || '' }));
  const standing = buildStanding(P.nums);

  // the link law + word caps (warn, never truncate — the curator trims the `why`, we don't mangle it)
  for (const it of [lead, ...items]) if (!it.href || !it.refs.length) console.warn('  WARN missing source link:', it.headline || it.h1);
  if (WORDS(lead.context) > 70) console.warn(`  WARN lead context ${WORDS(lead.context)}w (cap 70)`);
  items.forEach((it) => { if (WORDS(it.context) > 45) console.warn(`  WARN "${it.headline.slice(0, 30)}" ${WORDS(it.context)}w (cap 45)`); });

  const words = WORDS(lead.context) + items.reduce((n, it) => n + WORDS(it.context), 0) + (standing ? WORDS(standing.text) : 0);
  const selectedDates = [lead, ...items].map((it) => it.date).filter(Boolean).sort();

  // Change-gate the editorial clock. The brief rebuilds on every 4x/day refresh, but
  // the prose only CHANGES when the selected story set changes (append-only merge keeps
  // each story's wording stable). So bump the "updated" stamp only when the content
  // signature moves; on an unchanged run, preserve the prior timestamp. This kills
  // machine-churn and makes "Updated <when>" an honest claim, never the run time. The
  // live standing numbers still refresh underneath (they are re-rendered from the series).
  const contentSig = JSON.stringify({
    lead: [lead.h1, lead.context, lead.date, lead.href],
    items: items.map((it) => [it.headline, it.context, it.date, it.href]),
  });
  const prev = readJson(OUT, null);
  const unchanged = prev && prev.meta && prev.meta.contentSig === contentSig;
  const reviewedAt = unchanged ? (prev.meta.reviewedAt || now.toISOString()) : now.toISOString();
  const stampDate = new Date(reviewedAt);
  const out = { meta: { title: 'The brief', updated: reviewedAt.slice(0, 10), asOf: `${MO[stampDate.getUTCMonth()]} ${stampDate.getUTCDate()}`,
    reviewedAt, latestItemDate: selectedDates.at(-1) || '',
    generatedAt: reviewedAt, mode: 'curated', count: 1 + items.length, words, contentSig }, lead, items, standing };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`  wrote ${path.relative(ROOT, OUT)} · ${1 + items.length} items · ${words} words · picked: ${picked.map((e) => e.importance).join('/')} · ${unchanged ? 'content unchanged (clock held)' : 'content changed (clock bumped)'}`);
}

main().catch((e) => { console.error('build-brief failed:', e.stack || e.message); process.exit(1); });
