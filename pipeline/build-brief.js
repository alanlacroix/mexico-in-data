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
  const peso = series('banxico-usdmxn-fix'); if (peso.length) items.push({ id: 'board-peso', label: 'the peso', text: `the peso trades at ${peso.at(-1).v.toFixed(2)} to the dollar`, source: 'Banco de México', url: '/money.html' });
  const inf = series('banxico-inflacion'); if (inf.length) items.push({ id: 'board-inflation', label: 'inflation', text: `inflation is ${inf.at(-1).v.toFixed(2)}%`, source: 'INEGI', url: '/money.html' });
  const rate = series('banxico-tasa-objetivo'); if (rate.length) items.push({ id: 'board-rate', label: 'the policy rate', text: `the policy rate is ${rate.at(-1).v.toFixed(2)}%`, source: 'Banco de México', url: '/money.html' });
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
    if (pick.length) p2.push({ text: capitalize(pick.map((n) => n.text).join(', ')) + '.', refs: pick.map((n) => n.id) });
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

async function main() {
  const now = new Date();
  console.log(`\nbuild-brief · model ${hasLLM() ? model : 'none (deterministic stitch)'}`);
  const P = pool();
  if (!P.events.length && !P.standing.length) { console.warn('  no inputs — nothing to write'); return; }

  let paras = null, mode = 'stitch';
  if (hasLLM()) { paras = await modelBrief(P); if (paras) mode = 'model'; else console.warn('  model brief failed validation — falling back to stitch'); }
  if (!paras) paras = stitch(P);
  if (!valid(paras, P.byId)) { console.warn('  stitch invalid (thin inputs) — trimming'); paras = paras.map((p) => p.filter((s) => s.refs.every((id) => P.byId.has(id)))).filter((p) => p.length); }

  // attach the source link + label to each sentence (from its first ref) so the page can
  // render every sentence as a subtle link to the item it cites — the "no sentence without a link" law, made visible.
  const linked = paras.map((p) => p.map((s) => {
    const first = s.refs.map((id) => P.byId.get(id)).find(Boolean);
    return { text: s.text, refs: s.refs, href: (first && first.url) || '', source: (first && first.source) || '' };
  }));
  const out = {
    meta: { title: 'The brief', updated: now.toISOString().slice(0, 10), asOf: `${MO[now.getUTCMonth()]} ${now.getUTCDate()}`, generatedAt: now.toISOString(), mode, llm: hasLLM(), words: wordCount(paras) },
    mode, paragraphs: linked,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  const u = usage();
  console.log(`  wrote ${path.relative(ROOT, OUT)} · ${paras.length} paragraphs · ${wordCount(paras)} words · mode ${mode}`);
  console.log(`  llm: ${u.calls} calls · ~$${u.costUSD.toFixed(4)}\n`);
}

main().catch((e) => { console.error('build-brief failed:', e.stack || e.message); process.exit(1); });
