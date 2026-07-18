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

// Recency decay (Fable QA 2026-07-16, the daily-habit fix). Importance alone optimizes
// for a MONTHLY visitor: a defining July-1 story holds the lede for weeks. For a page
// someone opens every morning, the headline must be what's NEW. A story stays on the
// page on importance, but its LEDE eligibility decays after a couple of days. An old,
// important story becomes context below the fold; it cannot stay the headline.
const DAY = 864e5;
function recencyWeight(ageDays) {
  if (ageDays <= 2) return 1;      // today / yesterday: full weight
  if (ageDays <= 4) return 0.6;
  if (ageDays <= 8) return 0.3;
  if (ageDays <= 16) return 0.15;
  return 0.08;                     // still on the page if important, never the headline
}
// Priority signal (Alan, 2026-07-16): a major foreign investment or capital commitment to
// Mexico — a multi-billion fund target, a large private-credit / nearshoring commitment, a
// big acquisition or stake — is a top-of-page story (national consequence + US-Mexico stakes).
// Floor its EFFECTIVE importance so it leads even when the curator scored it conservatively
// (the Apollo $20bn miss). Requires both a large-money signal AND an investment term, so a
// political "20 billion pesos" subsidy story is not swept in. Config as taste, applied
// deterministically at ranking time (re-ranks stored events too, not just future ones).
const BIG_MONEY = /\$?\s?\d{1,4}\s?(?:billion|bn)\b|\d{1,4}\s?mil\s?millones\s?de\s?d[oó]lares/i;
const INVEST_TERM = /\b(invest|inversi[oó]n|private credit|cr[eé]dito privado|nearshoring|fund|fondo|acquisi|adquisici|stake|\bIPO\b)\b/i;
const bigCapital = (e) => { const t = `${e.title || ''} ${e.why || ''} ${e.context || ''}`; return BIG_MONEY.test(t) && INVEST_TERM.test(t); };
const effImp = (e) => (bigCapital(e) ? Math.max(e.importance || 0, 8) : (e.importance || 0));
const ledeScore = (e, nowMs) => effImp(e) * recencyWeight(Math.max(0, (nowMs - (e._t || 0)) / DAY));

// Select the story set by the rubric (effective importance >= 5 = the selectivity, cap 8,
// soft floor 3), then ORDER by importance x recency so the freshest consequential story leads.
// Collapse cross-source duplicates of the SAME story before ranking (Alan 2026-07-17: the
// same BlackRock news ran from two sources — one with an og:image, one without — and BOTH
// entered the brief keyed by their differing URLs, so the imageless card showed). Two events
// are the same story when their titles overlap heavily, or (same company, within 3 days) with
// some overlap. The surviving representative prefers a version WITH an image, then importance,
// then recency — so a duplicate never costs a story its picture.
const titleWords = (t) => new Set(String(t || '').toLowerCase().replace(/[^a-z0-9áéíóúñü ]/g, ' ').split(/\s+/).filter((w) => w.length > 3));
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; for (const w of a) if (b.has(w)) i++; return i / (a.size + b.size - i); };
const hasImg = (e) => /^https:\/\//i.test(String((e && e.image) || ''));
function sameStory(a, b) {
  const j = jaccard(titleWords(a.title), titleWords(b.title));
  const sameCo = a.company && b.company && String(a.company).toLowerCase() === String(b.company).toLowerCase();
  const days = Math.abs((a._t || 0) - (b._t || 0)) / DAY;
  return j >= 0.5 || (sameCo && days <= 3 && j >= 0.25);
}
function betterRep(a, b) {
  if (hasImg(a) !== hasImg(b)) return hasImg(a) ? a : b;                                    // a version WITH an image wins the slot
  if ((a.importance || 0) !== (b.importance || 0)) return (a.importance || 0) > (b.importance || 0) ? a : b;
  return (a._t || 0) >= (b._t || 0) ? a : b;
}
function dedupeStories(events) {
  const kept = [];
  for (const e of events) {
    const at = kept.findIndex((k) => sameStory(k, e));
    if (at < 0) { kept.push(e); continue; }
    const win = betterRep(kept[at], e);
    if (win !== kept[at]) { console.log(`  dedup: "${e.title.slice(0, 40)}" — kept the version ${hasImg(win) ? 'with' : 'without'} an image`); kept[at] = win; }
  }
  return kept;
}
function select(events, nowMs) {
  const THRESH = 5, CAP = 8, FLOOR = 3;
  const eligible = events.filter((e) => {
    const gate = contextGate(e);
    if (!gate.ok && (e.importance || 0) >= THRESH) console.warn(`  hold ${e.id}: ${gate.flags.join('; ')}`);
    return gate.ok && e.url && e.source;
  });
  const ranked = dedupeStories(eligible.slice().sort((a, b) => (ledeScore(b, nowMs) - ledeScore(a, nowMs)) || (b._t - a._t)));
  let picked = ranked.filter((e) => effImp(e) >= THRESH).slice(0, CAP);
  if (picked.length < FLOOR) picked = ranked.slice(0, FLOOR);
  return picked;
}
function buildStanding(nums) {
  const pick = nums.filter((n) => ['board-peso', 'board-inflation', 'board-rate'].includes(n.id));
  if (!pick.length) return null;
  return { text: capitalize(pick.map((n) => n.text).join('; ')) + '.', live: pick.map((n) => ({ series: n.series, tmpl: n.tmpl })),
    refs: pick.map((n) => n.id), href: '/economy.html', source: 'Banco de México / INEGI' };
}

// THE BRIEF summary (Alan 2026-07-16: "too short — it should summarize all key news
// stories"). A 2-4 sentence synthesis of the picked stories, closed-world: written ONLY
// from their titles + shipped context, every number verbatim, gated by the report lint.
// Fail-soft to the lead headline; regenerated only when the story set changes (no churn).
async function writeSummary(picked) {
  if (!hasLLM()) return '';
  const items = picked.map((e) => ({ section: e.section, title: e.title, context: shippedContext(e) }));
  const schema = { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string' } } };
  const system = `Write THE BRIEF: the 2-4 sentence paragraph that opens The Mexico Brief, synthesizing today's key developments for someone tracking Mexico. Use ONLY the facts in the items provided; any number must appear verbatim in an item. Connect the stories where they genuinely connect (do not enumerate mechanically); lead with the most consequential. Plain, calm, concrete English. No opinion, no forecasts, no em-dash, no "meanwhile". Maximum 80 words. Return JSON: {summary}.`;
  const out = await askJSON({ system, user: JSON.stringify(items), schema, maxTokens: 2500 });
  const text = String(out && out.summary || '').replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  // Headroom over the ~80-word target: the model routinely overshoots by a few words, and
  // a 2-word overage must not throw away the whole paragraph (Alan 2026-07-17: the brief
  // collapsed to a one-line headline because a 92-word summary hit a 90 cap). maxSentences
  // still keeps it a paragraph, not an essay.
  const gate = lintReportText({ text, inputs: items.flatMap((i) => [i.title, i.context]), maxWords: 105, maxSentences: 5 });
  if (!gate.ok) { console.warn(`  summary rejected: ${gate.flags.join('; ')}`); return ''; }
  return text;
}

async function main() {
  const now = new Date();
  console.log(`\nbuild-brief · ${hasLLM() ? 'llm available (drafts only, gated)' : 'no llm — human context'}`);
  const P = pool();
  if (!P.events.length) { console.warn('  no events — nothing to write'); return; }

  // The prior brief (the last content-changed version): powers the "new since your last
  // visit" delta and the change-gated clock below.
  const prev = readJson(OUT, null);
  const prevHrefs = new Set([prev && prev.lead && prev.lead.href, ...arr(prev && prev.items).map((i) => i.href)].filter(Boolean));

  const nowMs = now.getTime();
  const picked = select(P.events, nowMs);
  if (!picked.length) throw new Error('no reviewed event context is ready for the Brief; keeping the last-good brief');
  // A story is NEW when it entered the brief since the last update AND is genuinely recent
  // (not an old-dated item that only just cleared the bar). This is the daily-delta signal.
  const isNew = (e) => !prevHrefs.has(e.url || '') && ((nowMs - (e._t || 0)) / DAY) <= 4;
  const lead0 = picked[0];
  const pass4 = (e) => ({ background: String(e.background || '').trim(), drivers: String(e.drivers || '').trim(), implications: String(e.implications || '').trim(), next: String(e.next || '').trim(), image: /^https:\/\//i.test(String(e.image || '')) ? String(e.image).trim() : '' });
  const lead = { h1: stripDash(lead0.title).replace(/\.\s*$/, ''), context: ctxOf(lead0), ...pass4(lead0), refs: [lead0.id],
    href: lead0.url || '', source: lead0.source || '', date: lead0.date || '', section: lead0.section || '', isNew: isNew(lead0) };
  const items = picked.slice(1).map((e) => ({ headline: stripDash(e.title).replace(/\.\s*$/, ''), context: ctxOf(e), ...pass4(e),
    refs: [e.id], href: e.url || '', source: e.source || '', date: e.date || '', section: e.section || '', isNew: isNew(e) }));
  const standing = buildStanding(P.nums);
  // Quiet-stretch honesty (Fable: "quiet day is the truth"): when nothing recent leads,
  // say so rather than dressing a week-old story as today's news.
  const leadAgeDays = (nowMs - (lead0._t || 0)) / DAY;
  const quiet = leadAgeDays > 3;
  const newCount = [lead, ...items].filter((it) => it.isNew).length;

  // the link law + word caps (warn, never truncate — the curator trims the `why`, we don't mangle it)
  for (const it of [lead, ...items]) if (!it.href || !it.refs.length) console.warn('  WARN missing source link:', it.headline || it.h1);
  if (WORDS(lead.context) > 70) console.warn(`  WARN lead context ${WORDS(lead.context)}w (cap 70)`);
  items.forEach((it) => { if (WORDS(it.context) > 45) console.warn(`  WARN "${it.headline.slice(0, 30)}" ${WORDS(it.context)}w (cap 45)`); });

  const words = WORDS(lead.context) + items.reduce((n, it) => n + WORDS(it.context), 0) + (standing ? WORDS(standing.text) : 0);
  const selectedDates = [lead, ...items].map((it) => it.date).filter(Boolean).sort();

  // Change-gate the editorial clock. The brief rebuilds on every 4x/day refresh, but the
  // "Updated <when>" stamp only moves when the story SET or its order changes. The signature
  // keys on story IDENTITY (href + date + position), not the prose (Fable watch item), so a
  // re-worded curator output never churns the stamp, and the append-only merge keeps wording
  // stable anyway. On an unchanged run, preserve the prior timestamp. The live standing
  // numbers still refresh underneath (they are re-rendered from the series client-side).
  const contentSig = JSON.stringify([lead, ...items].map((it) => [it.href, it.date]));
  const unchanged = prev && prev.meta && prev.meta.contentSig === contentSig;
  const reviewedAt = unchanged ? (prev.meta.reviewedAt || now.toISOString()) : now.toISOString();
  const stampDate = new Date(reviewedAt);
  // The synthesis is stable prose: keep the previous one on an unchanged story set (no
  // re-paraphrasing), write a fresh one only when the set actually changed. If a fresh write
  // fails its gate, keep the LAST-GOOD paragraph rather than collapsing to the bare lead
  // headline (Alan 2026-07-17: "why is our brief so short now"). Next good run refreshes it.
  const summary = (unchanged && String(prev.summary || '').trim()) || await writeSummary(picked) || String(prev.summary || '').trim() || '';
  const out = { meta: { title: 'The brief', updated: reviewedAt.slice(0, 10), asOf: `${MO[stampDate.getUTCMonth()]} ${stampDate.getUTCDate()}`,
    reviewedAt, latestItemDate: selectedDates.at(-1) || '', quiet, newCount,
    generatedAt: reviewedAt, mode: 'curated', count: 1 + items.length, words, contentSig }, summary, lead, items, standing };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`  wrote ${path.relative(ROOT, OUT)} · ${1 + items.length} items · ${words} words · picked: ${picked.map((e) => e.importance).join('/')} · ${unchanged ? 'content unchanged (clock held)' : 'content changed (clock bumped)'}`);
}

main().catch((e) => { console.error('build-brief failed:', e.stack || e.message); process.exit(1); });
