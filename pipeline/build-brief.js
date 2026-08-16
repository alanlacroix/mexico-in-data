// Build the homepage brief from the latest reviewed events.
// The optional model may only synthesize the selected titles and context. Every card keeps
// its source link and event ref; a failed synthesis gets a plain headline fallback. The brief
// separates exact-day reporting from consequential prior-day context. The combined edition
// is capped at five and every story keeps its publication date and lane.

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askJSON, hasLLM } from './lib/anthropic.js';
import briefStanding from './lib/brief-standing.cjs';
import { lintReportText, reportContextDistinct } from './lib/lint.js';
import newsDay from './lib/news-day.cjs';
import newsThreads from './lib/news-threads.cjs';
import plainLanguage from './lib/plain-language.cjs';
import briefSelection from './lib/brief-selection.cjs';
import reportEvidence from './lib/report-evidence.cjs';
import freshnessContract from './lib/freshness-contract.cjs';

const { editorialDay } = newsDay;
const { board, buildStanding } = briefStanding;
const { groupEvents, sameThread } = newsThreads;
const DEFAULT_WINDOW_HOURS = 36;
const CARRYOVER_WINDOW_HOURS = 60;
const { plainExplanation, plainHeadline } = plainLanguage;
const { optionalAnalysis, selectEditionBrief } = briefSelection;
const { evidenceInputs } = reportEvidence;
const { curationReadiness } = freshnessContract;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const D = (...p) => path.join(ROOT, 'data', ...p);
const OUT = process.env.BRIEF_OUT || D('brief.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// ---- the referenceable pool: recent events + standing facts + board numbers ----
function pool(now = new Date()) {
  const happening = readJson(D('happening.json'), { meta: {}, events: [] });
  return {
    events: arr(happening.events),
    curation: happening.meta?.curation || null,
    nums: board(),
  };
}

const endPunct = (t) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t && !/[.!?]$/.test(t) ? t + '.' : t; };
const fallbackSummary = (picked) => picked.slice(0, 3)
  .map((event) => endPunct(plainExplanation(ctxOf(event)) || plainHeadline(stripDash(event.title))))
  .join(' ');

// ---- the Brief: 3-5 rubric-ranked developments, each headline + explained context ----
const stripDash = (t) => String(t || '').replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim();  // voice law: no em-dash
const WORDS = (t) => stripDash(t).split(/\s+/).filter(Boolean).length;
// The event's shipped context is its `context` field, or the curator's `why` when no
// hand-promoted context exists. `why` used to be distrusted (it could be a raw truncated
// feed dek), so the Brief only accepted `context`, which is what kept fresh curated events
// out of the Brief and left it stale. Now build-happening's slop gate guarantees every
// stored `why` is clean rewritten English (link + date + whole sentences), so it may feed
// the Brief. lintReportText still enforces style + the no-invented-numbers rule below.
const shippedContext = (e) => (e && (e.context || e.why)) || '';
const contextGate = (e) => {
  const gate = lintReportText({
    text: shippedContext(e),
    inputs: evidenceInputs(e),
    maxWords: 55,
    maxSentences: 2,
  });
  if (gate.ok && !reportContextDistinct({ headline: e.title, context: shippedContext(e) })) {
    return { ok: false, flags: ['context repeats the headline without adding a sourced fact'] };
  }
  return gate;
};
const ctxOf = (e) => stripDash(contextGate(e).ok ? shippedContext(e) : '');
const effImp = (e) => Math.max(
  Number(e && e.importance) || 0,
  Number(e && e.scheduledImportanceFloor) || 0,
);

// Declared interests are same-band tie-breakers only. They never decide what counts as
// news and can never make a lower-importance story outrank a higher-importance one.
const INTERESTS = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL('../data/interests.json', import.meta.url), 'utf8'))
      .interests.map((x) => ({ tag: x.tag, rx: new RegExp(x.pattern, 'i') }));
  } catch { return []; }
})();
const interestTags = (e) => {
  // Tie-break interests come from the retained source facts as well as the public
  // rewrite. Editing a headline for clarity must not silently change its rank.
  const hay = `${e.title || ''} ${e.why || ''} ${e.reportEvidence?.title || ''} ${e.reportEvidence?.dek || ''} ${e.section || ''}`;
  return INTERESTS.filter((x) => x.rx.test(hay)).map((x) => x.tag);
};
function select(events, editorialDate) {
  const candidates = groupEvents(events).map((group) => ({
    ...group.event,
    importance: group.importance,
    coverage: group.coverage,
  }));
  const result = selectEditionBrief(candidates, {
    editorialDate,
    effectiveImportance: effImp,
    interestTags,
    scheduledMatch: (event) => Boolean(event.scheduledEventId),
    candidateGate: (event) => {
      if (!event?.url) return { ok: false, reason: 'missing-url' };
      if (!event?.source) return { ok: false, reason: 'missing-source' };
      const gate = contextGate(event);
      if (!gate.ok) {
        if (effImp(event) >= 5) console.warn(`  hold ${event.id}: ${gate.flags.join('; ')}`);
        return { ok: false, reason: `copy-gate:${gate.flags.join('|')}` };
      }
      return { ok: true };
    },
  });
  const receiptById = new Map(result.receipt.map((row) => [row.id, row]));
  const picked = result.selected.map((event) => ({
    ...event,
    _tags: interestTags(event),
    _effectiveImportance: effImp(event),
    _selectionReason: receiptById.get(event.id)?.reason || '',
    _lane: receiptById.get(event.id)?.lane || 'today',
  }));
  return { picked, receipt: result.receipt, counts: result.counts, carryoverDate: result.carryoverDate };
}

function assertUniqueEvents(events) {
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      if (sameThread(events[i], events[j])) {
        throw new Error(`duplicate event reached publication: "${events[i].title || events[i].h1}" / "${events[j].title || events[j].headline}"`);
      }
    }
  }
}
// THE BRIEF summary (Alan 2026-07-16: "too short — it should summarize all key news
// stories"). A 2-4 sentence synthesis of the picked stories, closed-world: written ONLY
// from their titles + shipped context, every number verbatim, gated by the report lint.
// Fail-soft to the lead headline; regenerated only when the story set changes (no churn).
async function writeSummary(picked) {
  if (!hasLLM()) return '';
  const items = picked.map((e) => ({ section: e.section, title: e.title, context: shippedContext(e) }));
  const schema = { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string' } } };
  const system = `Write THE BRIEF: the 2-4 sentence paragraph that opens The Mexico Brief, explaining the latest key developments for someone tracking Mexico. Use ONLY the facts in the items provided; any number must appear verbatim in an item. Use named actors and concrete verbs. State what happened before explaining the consequence. Connect stories only when the items support the connection. Never make the reader decode an acronym: write the institution, agreement or indicator in plain English on first mention (for example, "US trade office", "US-Mexico-Canada Agreement", and "Mexico's statistics agency"). "US" is fine. Do not use vague phrases such as "losing momentum", "fiscal room", "welfare commitments", "signals a broader shift", or "raises questions". No opinion, forecasts, em-dash, semicolon, "meanwhile", or marketing language. Maximum 80 words. Return JSON: {summary}.`;
  const out = await askJSON({ system, user: JSON.stringify(items), schema, maxTokens: 2500, effort: 'low' });
  const raw = String(out && out.summary || '').replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim();
  const text = plainExplanation(raw);
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
  const selectionOnly = process.argv.includes('--selection-only');
  const editorialDate = editorialDay(now);
  console.log(`\nbuild-brief · ${hasLLM() ? 'llm available (drafts only, gated)' : 'no llm — human context'}`);
  const P = pool(now);
  const freshness = curationReadiness(P.curation, editorialDate, { allowMissing: true });
  if (!freshness.ok) throw new Error(`today's curation is incomplete: ${freshness.reason}`);

  // The prior brief (the last content-changed version): powers the "new since your last
  // visit" delta and the change-gated clock below.
  const prev = readJson(OUT, null);
  const prevHrefs = new Set([prev && prev.lead && prev.lead.href, ...arr(prev && prev.items).map((i) => i.href)].filter(Boolean));

  const selection = select(P.events, editorialDate);
  const picked = selection.picked;
  const windowHours = selection.counts.keyDevelopments ? CARRYOVER_WINDOW_HOURS : DEFAULT_WINDOW_HOURS;
  if (!picked.length) {
    // A quiet edition says so plainly. Never relabel yesterday's claims as today's:
    // those stories cannot appear in today's selection receipt and must not be certified.
    const contentSig = fingerprint([]);
    const unchanged = prev?.meta?.contentSig === contentSig && prev?.meta?.editorialDate === editorialDate;
    const reviewedAt = unchanged ? (prev.meta.reviewedAt || now.toISOString()) : now.toISOString();
    const out = {
      meta: {
        title: 'The brief', editorialDate, updated: editorialDate, asOf: editorialDate,
        reviewedAt, latestItemDate: '', quiet: true, newCount: 0,
        generatedAt: now.toISOString(), mode: 'curated', count: 0, words: 8, contentSig,
        windowHours,
        selection: {
          policy: 'exact-day-plus-carryover-v1',
          receipt: selection.receipt,
          lockedIds: [],
          empty: true,
          lanes: selection.counts,
          carryoverDate: selection.carryoverDate,
          scheduledOutcomes: readJson(D('event-status.json'), null)?.meta || null,
        },
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
  const pickedIds = picked.map((event) => event.id).filter(Boolean);
  const lockedIds = arr(prev?.meta?.selection?.lockedIds);
  if (!selectionOnly && prev?.meta?.editorialDate === editorialDate && lockedIds.length
      && JSON.stringify(lockedIds) !== JSON.stringify(pickedIds)) {
    throw new Error(`selected story set changed after analysis enrichment: ${lockedIds.join(',')} -> ${pickedIds.join(',')}`);
  }
  const lead0 = picked[0];
  const pass4 = (e) => {
    // Every selected development carries the same evidence-linked explanatory unit.
    // Ranking still happens first and never changes to hide an explanation failure.
    const approved = optionalAnalysis(e);
    return {
      background: approved ? plainExplanation(approved.background) : '',
      view: approved ? plainExplanation(approved.view) : '',
      prediction: approved ? plainExplanation(approved.prediction) : '',
      analysisV: approved ? Number(approved.analysisV) : 0,
      analysisRefs: approved ? approved.analysisRefs : {},
      analysisSources: approved ? approved.analysisSources : [],
      drivers: plainExplanation(e.drivers), implications: plainExplanation(e.implications), next: plainExplanation(e.next),
      image: /^https:\/\//i.test(String(e.image || '')) ? String(e.image).trim() : '', publishedAt: String(e.publishedAt || '').trim(), coverage: arr(e.coverage),
    };
  };
  // Ranking provenance (Fable 2026-07-20): base importance, interest tags, boost, final rank.
  const rankOf = (e, i) => ({
    rank: i + 1,
    importance: e.importance || 0,
    effectiveImportance: e._effectiveImportance || effImp(e),
    tags: e._tags || [],
    scheduledEventId: e.scheduledEventId || '',
    reason: e._selectionReason || '',
  });
  const lead = { h1: plainHeadline(stripDash(lead0.title)).replace(/\.\s*$/, ''), context: plainExplanation(ctxOf(lead0)), ...pass4(lead0), refs: [lead0.id],
    href: lead0.url || '', source: lead0.source || '', date: lead0.date || '', section: lead0.section || '', lane: lead0._lane,
    isNew: isNew(lead0), ranking: rankOf(lead0, 0) };
  const items = picked.slice(1).map((e, i) => ({ headline: plainHeadline(stripDash(e.title)).replace(/\.\s*$/, ''), context: plainExplanation(ctxOf(e)), ...pass4(e),
    refs: [e.id], href: e.url || '', source: e.source || '', date: e.date || '', section: e.section || '', lane: e._lane,
    isNew: isNew(e), ranking: rankOf(e, i + 1) }));
  // Last line of defense: a regression upstream must fail the build instead of putting
  // two cards for the same event on the public Brief.
  assertUniqueEvents([lead, ...items]);
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
    it.href, it.date, it.lane, it.h1 || it.headline, it.context, it.source,
    it.background, it.view, it.prediction, it.analysisV, it.analysisRefs, it.analysisSources, it.implications, it.next,
  ]));
  const unchanged = prev && prev.meta && prev.meta.contentSig === contentSig && prev.meta.editorialDate === editorialDate;
  const reviewedAt = unchanged ? (prev.meta.reviewedAt || now.toISOString()) : now.toISOString();
  // Keep an unchanged summary stable. When the story set changes, a failed model draft gets
  // a deterministic summary of the current headlines, never prose from the previous set.
  const summary = (unchanged && String(prev.summary || '').trim())
    || (!selectionOnly ? await writeSummary(picked) : '')
    || fallbackSummary(picked);
  const out = { meta: { title: 'The brief', editorialDate, updated: editorialDate, asOf: editorialDate,
    reviewedAt, latestItemDate: selectedDates.at(-1) || '', quiet, newCount,
    generatedAt: now.toISOString(), mode: 'curated', count: 1 + items.length, words, contentSig,
    windowHours,
    selection: {
      policy: 'exact-day-plus-carryover-v1',
      receipt: selection.receipt,
      lockedIds: selectionOnly ? pickedIds : (lockedIds.length ? lockedIds : pickedIds),
      lanes: selection.counts,
      carryoverDate: selection.carryoverDate,
      scheduledOutcomes: readJson(D('event-status.json'), null)?.meta || null,
    } }, summary, lead, items, standing };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`  wrote ${path.relative(ROOT, OUT)} · ${1 + items.length} items · ${words} words · picked: ${picked.map((e) => e.importance).join('/')} · ${unchanged ? 'content unchanged (clock held)' : 'content changed (clock bumped)'}`);
}

main().catch((e) => { console.error('build-brief failed:', e.stack || e.message); process.exit(1); });
