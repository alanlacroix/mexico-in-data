// Build the homepage brief from the latest reviewed events.
// The optional model may only synthesize the selected titles and context. Every card keeps
// its source link and event ref; a failed synthesis gets a plain headline fallback. The brief
// uses a rolling window so it does not become empty at midnight or turn one early article into
// the whole day. The wider fallback is capped and every story keeps its publication date.

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askJSON, hasLLM } from './lib/anthropic.js';
import { lintReportText } from './lib/lint.js';
import newsDay from './lib/news-day.cjs';
import newsThreads from './lib/news-threads.cjs';
import newsWindow from './lib/news-window.cjs';

const { editorialDay } = newsDay;
const { groupEvents } = newsThreads;
const { DEFAULT_WINDOW_HOURS, FALLBACK_WINDOW_HOURS, recentEvents } = newsWindow;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const D = (...p) => path.join(ROOT, 'data', ...p);
const OUT = process.env.BRIEF_OUT || D('brief.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// ---- the board (a few live numbers, each a referenceable item) ----
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

// ---- the referenceable pool: recent events + standing facts + board numbers ----
function pool(now = new Date()) {
  const events = arr(readJson(D('happening.json'), { events: [] }).events);
  return {
    recent: recentEvents(events, now, DEFAULT_WINDOW_HOURS),
    fallback: recentEvents(events, now, FALLBACK_WINDOW_HOURS),
    nums: board(),
  };
}

const endPunct = (t) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t && !/[.!?]$/.test(t) ? t + '.' : t; };
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const fallbackSummary = (picked) => picked.slice(0, 3)
  .map((event) => endPunct(stripDash(event.title)))
  .join(' ');

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

// Major investment commitments get a deterministic floor so an unusually large deal is not
// buried by a conservative source score. Both a money signal and an investment term must match.
const BIG_MONEY = /\$?\s?\d{1,4}\s?(?:billion|bn)\b|\d{1,4}\s?mil\s?millones\s?de\s?d[oó]lares/i;
const INVEST_TERM = /\b(invest|inversi[oó]n|private credit|cr[eé]dito privado|nearshoring|fund|fondo|acquisi|adquisici|stake|\bIPO\b)\b/i;
const bigCapital = (e) => { const t = `${e.title || ''} ${e.why || ''} ${e.context || ''}`; return BIG_MONEY.test(t) && INVEST_TERM.test(t); };
const effImp = (e) => (bigCapital(e) ? Math.max(e.importance || 0, 8) : (e.importance || 0));

// Declared interests reorder qualifying news; they never decide what counts as news. Stories
// at importance 8+ take their slots first, and one untagged wildcard prevents a closed bubble.
const INTERESTS = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL('../data/interests.json', import.meta.url), 'utf8'))
      .interests.map((x) => ({ tag: x.tag, rx: new RegExp(x.pattern, 'i') }));
  } catch { return []; }
})();
const interestTags = (e) => {
  const hay = `${e.title || ''} ${e.why || ''} ${e.section || ''}`;
  return INTERESTS.filter((x) => x.rx.test(hay)).map((x) => x.tag);
};
function select(events) {
  const THRESH = 5, CAP = 5, NEVER_OUTRANKED = 8, BOOST = 2;
  const eligible = events.filter((e) => {
    const gate = contextGate(e);
    if (!gate.ok && (e.importance || 0) >= THRESH) console.warn(`  hold ${e.id}: ${gate.flags.join('; ')}`);
    return gate.ok && e.url && e.source;
  });
  const ranked = groupEvents(eligible).map((group) => ({
    ...group.event,
    importance: group.importance,
    coverage: group.coverage,
  })).filter((e) => effImp(e) >= THRESH)
    .sort((a, b) => (effImp(b) - effImp(a)) || (b._t - a._t));
  for (const e of ranked) { e._tags = interestTags(e); e._boosted = false; }

  // Pass 1: defining stories take slots first, regardless of the interest list.
  const picked = ranked.filter((e) => effImp(e) >= NEVER_OUTRANKED).slice(0, CAP);

  // Pass 2: remaining slots by importance, interests and a small breadth preference.
  // Breadth is only a tiebreaker. It can surface another qualified source or beat, but it
  // cannot make weak news outrank an important development.
  const rest = ranked.filter((e) => !picked.includes(e));
  while (picked.length < CAP && rest.length) {
    const usedSources = new Set(picked.map((e) => e.source).filter(Boolean));
    const usedSections = new Set(picked.map((e) => e.section).filter(Boolean));
    rest.sort((a, b) => {
      const score = (e) => effImp(e)
        + (e._tags.length ? BOOST : 0)
        + (!usedSources.has(e.source) ? 0.6 : 0)
        + (!usedSections.has(e.section) ? 0.25 : 0);
      return score(b) - score(a) || b._t - a._t;
    });
    const e = rest.shift();
    e._boosted = e._tags.length > 0;
    picked.push(e);
  }

  // Anti-bubble wildcard: the brief can never be all interest stories.
  const boostedCount = picked.filter((e) => e._tags.length).length;
  if (picked.length === CAP && boostedCount === CAP) {
    const wildcard = ranked.find((e) => !picked.includes(e) && !e._tags.length);
    if (wildcard) {
      const dropped = picked[picked.length - 1];
      picked[picked.length - 1] = wildcard;
      console.log(`  wildcard: "${wildcard.title.slice(0, 50)}" replaces "${dropped.title.slice(0, 50)}" (anti-bubble slot)`);
    }
  }
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
  const system = `Write THE BRIEF: the 2-4 sentence paragraph that opens The Mexico Brief, explaining the latest key developments for someone tracking Mexico. Use ONLY the facts in the items provided; any number must appear verbatim in an item. Use named actors and concrete verbs. State what happened before explaining the consequence. Connect stories only when the items support the connection. Do not use vague phrases such as "losing momentum", "fiscal room", "welfare commitments", "signals a broader shift", or "raises questions". No opinion, forecasts, em-dash, semicolon, "meanwhile", or marketing language. Maximum 80 words. Return JSON: {summary}.`;
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
  const editorialDate = editorialDay(now);
  console.log(`\nbuild-brief · ${hasLLM() ? 'llm available (drafts only, gated)' : 'no llm — human context'}`);
  const P = pool(now);

  // The prior brief (the last content-changed version): powers the "new since your last
  // visit" delta and the change-gated clock below.
  const prev = readJson(OUT, null);
  const prevHrefs = new Set([prev && prev.lead && prev.lead.href, ...arr(prev && prev.items).map((i) => i.href)].filter(Boolean));

  let windowHours = DEFAULT_WINDOW_HOURS;
  let picked = select(P.recent);
  if (picked.length < 3) {
    const wider = select(P.fallback);
    if (wider.length > picked.length) {
      picked = wider;
      windowHours = FALLBACK_WINDOW_HOURS;
    }
  }
  if (!picked.length) {
    const contentSig = fingerprint([]);
    const unchanged = prev?.meta?.contentSig === contentSig && prev?.meta?.editorialDate === editorialDate;
    const reviewedAt = unchanged ? (prev.meta.reviewedAt || now.toISOString()) : now.toISOString();
    const out = {
      meta: {
        title: 'The brief', editorialDate, updated: editorialDate, asOf: editorialDate,
        reviewedAt, latestItemDate: '', quiet: true, newCount: 0,
        generatedAt: now.toISOString(), mode: 'curated', count: 0, words: 8,
        windowHours,
      },
      summary: 'No major developments have cleared the brief yet.',
      lead: null,
      items: [],
      standing: buildStanding(P.nums),
    };
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(`  wrote ${path.relative(ROOT, OUT)} · quiet day · 0 items`);
    return;
  }
  const isNew = (e) => !prevHrefs.has(e.url || '');
  const lead0 = picked[0];
  const pass4 = (e) => ({ background: String(e.background || '').trim(), drivers: String(e.drivers || '').trim(), implications: String(e.implications || '').trim(), next: String(e.next || '').trim(), image: /^https:\/\//i.test(String(e.image || '')) ? String(e.image).trim() : '', publishedAt: String(e.publishedAt || '').trim(), coverage: arr(e.coverage) });
  // Ranking provenance (Fable 2026-07-20): base importance, interest tags, boost, final rank.
  const rankOf = (e, i) => ({ rank: i + 1, importance: e.importance || 0, tags: e._tags || [], boosted: !!e._boosted });
  const lead = { h1: stripDash(lead0.title).replace(/\.\s*$/, ''), context: ctxOf(lead0), ...pass4(lead0), refs: [lead0.id],
    href: lead0.url || '', source: lead0.source || '', date: lead0.date || '', section: lead0.section || '', isNew: isNew(lead0), ranking: rankOf(lead0, 0) };
  const items = picked.slice(1).map((e, i) => ({ headline: stripDash(e.title).replace(/\.\s*$/, ''), context: ctxOf(e), ...pass4(e),
    refs: [e.id], href: e.url || '', source: e.source || '', date: e.date || '', section: e.section || '', isNew: isNew(e), ranking: rankOf(e, i + 1) }));
  const standing = buildStanding(P.nums);
  const quiet = false;
  const newCount = [lead, ...items].filter((it) => it.isNew).length;

  // the link law + word caps (warn, never truncate — the curator trims the `why`, we don't mangle it)
  for (const it of [lead, ...items]) if (!it.href || !it.refs.length) console.warn('  WARN missing source link:', it.headline || it.h1);
  if (WORDS(lead.context) > 70) console.warn(`  WARN lead context ${WORDS(lead.context)}w (cap 70)`);
  items.forEach((it) => { if (WORDS(it.context) > 45) console.warn(`  WARN "${it.headline.slice(0, 30)}" ${WORDS(it.context)}w (cap 45)`); });

  const words = WORDS(lead.context) + items.reduce((n, it) => n + WORDS(it.context), 0) + (standing ? WORDS(standing.text) : 0);
  const selectedDates = [lead, ...items].map((it) => it.date).filter(Boolean).sort();

  // Hold the editorial clock only when every visible story field is unchanged. generatedAt
  // still records the actual build time for operations and health checks.
  const contentSig = fingerprint([lead, ...items].map((it) => [
    it.href, it.date, it.h1 || it.headline, it.context, it.source,
    it.background, it.implications, it.next,
  ]));
  const unchanged = prev && prev.meta && prev.meta.contentSig === contentSig && prev.meta.editorialDate === editorialDate;
  const reviewedAt = unchanged ? (prev.meta.reviewedAt || now.toISOString()) : now.toISOString();
  // Keep an unchanged summary stable. When the story set changes, a failed model draft gets
  // a deterministic summary of the current headlines, never prose from the previous set.
  const summary = (unchanged && String(prev.summary || '').trim()) || await writeSummary(picked) || fallbackSummary(picked);
  const out = { meta: { title: 'The brief', editorialDate, updated: editorialDate, asOf: editorialDate,
    reviewedAt, latestItemDate: selectedDates.at(-1) || '', quiet, newCount,
    generatedAt: now.toISOString(), mode: 'curated', count: 1 + items.length, words, contentSig,
    windowHours }, summary, lead, items, standing };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`  wrote ${path.relative(ROOT, OUT)} · ${1 + items.length} items · ${words} words · picked: ${picked.map((e) => e.importance).join('/')} · ${unchanged ? 'content unchanged (clock held)' : 'content changed (clock bumped)'}`);
}

main().catch((e) => { console.error('build-brief failed:', e.stack || e.message); process.exit(1); });
