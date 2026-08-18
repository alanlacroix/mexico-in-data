// build-happening.js — the cross-domain event log generator behind "What's happening",
// the homepage lead. This is the radar half of the product: while the number pipeline
// (run.js) tracks scheduled DATA RELEASES, this tracks EVENTS — a decree in the DOF, a
// Banxico decision, a court ruling, a security development, a tariff or USMCA move, a
// major deal — across every domain, not just economics.
//
// It reads the collected news wire (all beats), asks the model to SELECT the genuine
// dated developments a reader tracking Mexico needs, assign each a section + importance
// + a clean title + one honest line on why it matters, then MERGES them append-only into
// data/happening.json. It never invents: title and why are written only from the item's
// own headline + dek, and every entry keeps its source link and date.
//
// The factual event log is fail-soft: with no ANTHROPIC_API_KEY it falls back to a
// deterministic pick (top-tier, most-recent, spread across sections). Publication is
// stricter: every selected story must later clear the evidence-linked Briefly Explained
// gate. One event keeps one stable id, moves to the newest curated report, and retains
// other outlets and adjacent-day reports as coverage.
//
//   node build-happening.js                    # update data/happening.json in place
//   HAPPENING_OUT=/tmp/h.json node build-happening.js   # write elsewhere (dry test)
//
// Honesty law: cross-domain by construction (a per-section cap on the homepage keeps any
// one beat from dominating), every entry dated + linked to its source, model writes only
// from provided text.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askJSON, budgetStatus, hasLLM, usage, model, models } from './lib/anthropic.js';
import { REPORT, ANALYSIS_SHAPE, TRUST, SEAM, EARNED_LINE, BAN } from './lib/voice.js';
import { lintEventReport, lintReportText, lintAnalysisText, analysisNeedsScale, slopFlags, isSlop } from './lib/lint.js';
import { eventCandidateEligible, mexicoRelevant } from './lib/news-trust.js';
import { reconcileHappeningFactCopy } from './lib/fact-copy.js';
import { fetchArticle } from './lib/fetch-article.js';
import newsDay from './lib/news-day.cjs';
import newsThreads from './lib/news-threads.cjs';
import scheduledCandidate from './lib/scheduled-candidate.cjs';
import importanceRubric from './lib/importance-rubric.cjs';
import candidatePriority from './lib/candidate-priority.cjs';
import reportEvidence from './lib/report-evidence.cjs';
import analysisAttempts from './lib/analysis-attempts.cjs';
import curationCheckpoint from './lib/curation-checkpoint.cjs';

const { editorialDay } = newsDay;
const { groupEvents, mergeCoverage } = newsThreads;
const { linkScheduledCandidate } = scheduledCandidate;
const { applyScheduledImportanceFloor, normalizeModelImportanceRow, scoreImportance } = importanceRubric;
const { attentionSignal, decisionCoverage, fallbackImportanceComponents, prioritizeCandidates } = candidatePriority;
const { evidenceInputs } = reportEvidence;
const { mergeApprovedAttempt } = analysisAttempts;
const { candidateSignature, canReuseCuration } = curationCheckpoint;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const D = (...p) => path.join(ROOT, 'data', ...p);
const OUT = process.env.HAPPENING_OUT || D('happening.json');
const QUARANTINE_OUT = D('happening-quarantine.json');

// Canonical description of the log. Overrides any stale note carried in the existing
// file (the old "hand-curated for now" note was wrong once the pipeline took over).
const NOTE = "Curated cross-domain event log: the developments moving Mexico, each rewritten in plain English, dated, and linked to the original publisher or record source. Auto-generated from the news wire on every refresh. Raw or non-English items are quarantined and never published.";

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const NEWS_SOURCES = arr(readJson(path.join(__dirname, 'news-sources.json'), { sources: [] }).sources);

// Items rejected this run (raw source language, feed boilerplate, truncation, or a
// missing link/date). They never reach the log; they are written to a quarantine file
// for visibility and are re-encountered from the news ledger on the next run, so a
// down-LLM cycle retries automatically. See lib/lint.js slopFlags.
const QUARANTINE = [];
function quarantine(ev, flags) {
  QUARANTINE.push({ ...ev, _flags: flags });
  console.warn(`  quarantine ${ev.id || ev.title?.slice(0, 40)}: ${flags.join('; ')}`);
}

const WINDOW_DAYS = 3;       // daily curation is a recent-news job, not a 30-day backlog replay
const KEEP_DAYS = 60;        // the stored log holds a rolling ~60-day window (older ages out, unless imp 5)
const MAX_STORE = 60;        // hard cap on stored entries
const MAX_NEW = 16;          // model returns at most this many new events per run
const MAX_CANDIDATES = 24;   // small enough for one exhaustive decision per row; attention priority protects consequential older items.
const CURATION_MAX_TOKENS = 6000; // enough for 24 compact decisions; the old 16k ceiling falsely exhausted the monthly guard.

const SECTIONS = ['economy', 'money', 'politics', 'security', 'us-mexico', 'society'];

// Fallback section routing when the model isn't available (the model assigns section otherwise).
const SEC_RX  = /homicid|violen|c[áa]rtel|cartel|narco|crimen|segurid|extradi|fentanil|desaparec|security|militar|guardia nacional/i;
const USMX_RX = /usmca|t-?mec|arancel|tariff|frontera|border|trump|ustr|deporta|migra|remesa|remittanc|censo de comercio|section 2(32|01|22)/i;
const POL_RX  = /sheinbaum|morena|reforma|congreso|senado|diputad|judicial|corte|elecci|gobernad|amlo|pol[íi]tic|decreto|\bdof\b|constituc/i;
const MONEY_RX= /banxico|peso|inflaci|tasa de inter|bono|cetes|mercado|bolsa|\bbmv\b|rating|calificaci|moody|fitch|s&p/i;

function beatSection(x) {
  const t = (x.title || '') + ' ' + (x.dek || '') + ' ' + (x.beat || '');
  if (x.sourceName === 'Mexico Business News' && x.beat === 'economy') return 'economy';
  if (x.beat === 'fintech') return 'money';
  if (x.beat === 'companies' || x.beat === 'deals') return 'economy';
  if (SEC_RX.test(t)) return 'security';
  if (USMX_RX.test(t)) return 'us-mexico';
  if (POL_RX.test(t)) return 'politics';
  if (MONEY_RX.test(t)) return 'money';
  return 'economy';   // companies / deals / fintech / generic → economy
}

// ---- candidate gathering (dedup, 30-day window) — mirrors build-email's candidates() ----
const normTitle = (t) => (t || '').toLowerCase().replace(/[^a-z0-9áéíóúñü ]/g, ' ').replace(/\s+/g, ' ').trim();
const TASTE_RX = /automotive|vehicle|rail|manufactur|investment|nearshor|trade|usmca|t-?mec|fintech|bank|payment|embedded finance|\bai\b|artificial intelligence|data cent|energy|pemex|cfe|public financ|digital rules|technology/i;
const publishableCandidate = (x) => (x.tier === 1 || x.tier === 2 || x.tier === 'specialist')
  && eventCandidateEligible(x, NEWS_SOURCES)
  && mexicoRelevant(`${x.title || ''} ${x.dek || ''}`)
  && (x.sourceName !== 'Mexico Business News' || TASTE_RX.test(`${x.title || ''} ${x.dek || ''}`));
function jaccard(a, b) {
  const A = new Set(a.split(' ').filter((w) => w.length > 3)), B = new Set(b.split(' ').filter((w) => w.length > 3));
  if (!A.size || !B.size) return 0; let i = 0; for (const w of A) if (B.has(w)) i++;
  return i / (A.size + B.size - i);
}
function weekKey(dt) {
  const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return d.getUTCFullYear() + '-W' + String(Math.ceil((((d - ys) / 864e5) + 1) / 7)).padStart(2, '0');
}
function candidatePool(now, existingEvents = [], schedule = []) {
  const seen = new Set(), all = [];
  for (let i = 0; i <= 5; i++) {                         // last ~6 ISO-week files cover a 30-day window
    const w = weekKey(new Date(now.getTime() - i * 7 * 864e5));
    for (const x of arr(readJson(D('news', w + '.json'), []))) {
      if (x && x.url && x.title && !seen.has(x.url)) { seen.add(x.url); all.push(x); }
    }
  }
  const cutoff = now.getTime() - WINDOW_DAYS * 864e5;
  // Aggregators are discovery tools, not publishers. A Google News redirect or a
  // "via GDELT" label must never reach the public Brief. GDELT items with a real
  // publisher domain are retained; raw Google News records remain in the ledger
  // for discovery and health checks only.
  const pool = all.filter((x) => Date.parse(x.published_at) >= cutoff)
    .filter((x) => x.source !== 'news.google.com')
    .filter((x) => !/^google news\b|^via gdelt$/i.test(String(x.sourceName || '')))
    .filter(publishableCandidate);
  const alreadyPublished = new Set(arr(existingEvents).flatMap((event) => [
    event.url,
    ...arr(event.coverage).map((source) => source.url),
  ]).filter(Boolean));
  pool.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  // Use the same transitive event clustering as storage and publication. A one-pass
  // “compare with the kept headline” loop loses bridge reports and makes the result
  // depend on source order.
  const grouped = groupEvents(pool).map((group) => ({
    ...group.event,
    _n: normTitle(group.event.title),
    _coverage: group.coverage,
    _scheduled: linkScheduledCandidate(group.event, schedule, editorialDay(group.event.published_at)),
    _alreadyPublished: group.coverage.some((source) => alreadyPublished.has(source.url)),
  }));
  // The input cap is a cost control, never an editorial policy. Exact scheduled outcomes
  // and reports the log has not processed get first access to the curator. Old recurring
  // commentary can no longer crowd a central-bank decision out before it is even scored.
  return grouped;
}
// ---- shape an event-log entry from a news item ----
const clampImp = (n) => Math.max(0, Math.min(10, Math.round(+n || 5)));   // 0-10 Brief rubric (see BRIEF-RUBRIC.md)
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 52);
function mkEvent(x, section, importance, title, why, company = '') {
  const date = editorialDay(x.published_at);
  const scheduled = x._scheduled || null;
  const event = {
    id: 'n-' + slug(x.title) + '-' + date,
    date, section, title: (title || x.title || '').trim(), why: (why || '').trim(),
    company: (company || '').trim(),
    source: x.sourceName || x.source || '', url: x.url,
    importance: clampImp(Math.max(Number(importance) || 0, Number(scheduled?.importanceFloor) || 0)), kind: 'event',
    publishedAt: x.published_at || '', sourceTier: x.tier || '',
    reportEvidence: {
      title: String(x.title || '').trim(),
      dek: String(x.dek || '').trim(),
    },
    coverage: mergeCoverage(x._coverage || [], {
      source: x.sourceName || x.source || '', url: x.url, publishedAt: x.published_at || '',
      date, title: (title || x.title || '').trim(), summary: (why || x.dek || '').trim(),
    }),
  };
  if (scheduled) Object.assign(event, {
    scheduledEventId: scheduled.id,
    scheduledImportanceFloor: scheduled.importanceFloor,
    requiredForBrief: scheduled.requiredForBrief,
    importanceProvenance: `scheduled-floor:${scheduled.id}`,
  });
  return event;
}

function scheduledObligation(x) {
  const scheduled = x?._scheduled;
  if (!scheduled) return null;
  const host = (value) => {
    try { return new URL(String(value || '')).hostname.replace(/^www\./, ''); }
    catch { return ''; }
  };
  const reportHost = host(x.url);
  const officialHost = host(scheduled.sourceUrl);
  return {
    id: scheduled.id,
    kind: scheduled.topic === 'policy-rate' ? 'decision' : 'release',
    scheduledFor: scheduled.date,
    matched: true,
    outcomeObserved: true,
    scheduleAuthoritative: true,
    authoritativeEvidence: Boolean(reportHost && officialHost
      && (reportHost === officialHost || reportHost.endsWith(`.${officialHost}`))),
    importanceFloor: scheduled.importanceFloor,
    evidence: {
      source: x.sourceName || x.source || '',
      url: x.url,
      publishedAt: x.published_at || x.publishedAt || '',
    },
  };
}

// Without the model, the fallback remains conservative: skip obvious non-events, require
// a Mexico signal and publish only complete English source copy. A small deterministic
// version of the same five-part rubric still separates a government or cross-border state
// change from a product launch. The Brief must not freeze merely because its monthly model
// budget is exhausted.
// Bars the soft-feature classes a keyless fallback can't tell from real events: quizzes, versus
// listicles, "the N most ___" rankings, brand-history features ("la historia de…"), routine FX
// open/close recaps ("así abre el tipo de cambio", "peso busca rescatar…"), forecast-cut rehashes,
// sports, how-tos, entertainment. The model path filters on meaning; this keeps the fallback honest.
const JUNK_RX = /¿(qui[eé]n|c[óo]mo|qu[eé]|cu[áa]l)|vs\.?\s|los? m[áa]s (barat|car|vendid)|entre l[ao]s \d+ m[áa]s|la historia de|as[íi] (abre|cierra)|busca rescatar|(d[óo]lar|tipo de cambio) hoy|precio del d[óo]lar|recorte de expectativas|pase vip|saltar fila|\branking\b|paso a paso|hor[óo]scopo|receta|qu[eé] ver|streaming|nfl|nba|mlb|liga mx|fichaje|premios|celebr|tel[ei]nov|checa (las|los)|te decimos|aqu[íi] (los|las)/i;
const RAW_HEADLINE_RX = /^[“"'‘].{0,100}[”"'’]:|\b(batman|mother courage|avenging|bombshell|nightmare|you won.t believe|shocking|stunning|slams?|blasts?)\b|\bmarks? the end\b|\b(?:tariff|crime|migration) wave\b|[!?]{2,}/i;
function firstWholeSentence(text, max = 280) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const match = clean.match(/^(.{30,280}?[.!?])(?:\s|$)/);
  if (match && match[1].length <= max) return match[1];
  return clean.length <= max && /[.!?]$/.test(clean) ? clean : '';
}
function curateFallback(cands, now) {
  const scored = cands
    .map((x) => ({ x, summary: firstWholeSentence(x.dek) }))
    .filter(({ summary }) => summary)                                     // need a whole sourced sentence for "why"
    .filter(({ x }) => x.tier === 1 || x.tier === 2 || x.tier === 'specialist') // drop raw aggregator items
    .filter(({ x }) => !JUNK_RX.test((x.title || '') + ' ' + (x.dek || '')))  // no listicles / sports / how-tos
    .filter(({ x }) => !RAW_HEADLINE_RX.test(x.title || ''))                   // no raw clickbait without an editor rewrite
    .filter(({ x }) => mexicoRelevant((x.title || '') + ' ' + (x.dek || ''))) // must be about Mexico, not off-topic
    .filter(({ x }) => x.sourceName !== 'Mexico Business News' || TASTE_RX.test((x.title || '') + ' ' + (x.dek || '')))
    .map(({ x, summary }) => {
      const base = scoreImportance(fallbackImportanceComponents(x), { componentSource: 'deterministic-fallback-v1' });
      const importance = x._scheduled ? applyScheduledImportanceFloor(base, scheduledObligation(x)) : base;
      return { x, summary, importance };
    })
    .filter(({ importance }) => importance.importance >= 2);
  scored.sort((a, b) => b.importance.importance - a.importance.importance
    || Date.parse(b.x.published_at) - Date.parse(a.x.published_at));
  const out = [], cap = {};
  for (const { x, summary, importance } of scored) {
    const s = beatSection(x);
    if ((cap[s] || 0) >= 2) continue;                                     // ≤2 per section, keep it cross-domain
    const ev = mkEvent(x, s, importance.importance, x.title, summary);
    ev.importance = importance.importance;
    ev.importanceComponents = importance.importanceComponents;
    ev.importanceProvenance = importance.importanceProvenance;
    const flags = lintEventReport({ event: ev, inputs: evidenceInputs(ev) }).flags;
    if (flags.length) { quarantine(ev, flags); continue; }                // no LLM to translate/clean → raw source is quarantined, never published
    cap[s] = (cap[s] || 0) + 1;
    out.push(ev);
    if (out.length >= MAX_NEW) break;
  }
  return out;
}

function curationResult(cands, now, events, details = {}) {
  const editorialDate = editorialDay(now);
  const freshCandidates = cands.filter((candidate) => editorialDay(candidate.published_at) === editorialDate
    && !candidate._alreadyPublished);
  return {
    events,
    receipt: {
      policy: 'exact-day-assessment-v1',
      editorialDate,
      candidateCount: cands.length,
      candidateSig: details.candidateSig || candidateSignature(cands),
      freshCandidateCount: freshCandidates.length,
      assessedCount: Number(details.assessedCount) || 0,
      keptCount: events.length,
      rejectedCount: Number(details.rejectedKeeps) || 0,
      mode: details.mode || 'unknown',
      complete: Boolean(details.complete),
      reason: details.reason || '',
    },
  };
}

// ---- assess every candidate, then rank + write, via the model (fail-soft) ----
async function curate(cands, now) {
  if (!cands.length) return curationResult(cands, now, [], {
    mode: 'no-candidates', complete: true, assessedCount: 0,
  });
  if (!hasLLM()) {
    const fallback = curateFallback(cands, now);
    return curationResult(cands, now, fallback, {
      mode: 'deterministic-fallback',
      // The fallback is an assessment path, not an outage path. It applies the same
      // source, Mexico-relevance, importance and copy gates locally. Items it cannot
      // safely translate or frame are quarantined instead of blocking every other
      // story and the edition itself.
      complete: true,
      assessedCount: cands.length,
      reason: 'model unavailable; conservative deterministic assessment used',
    });
  }
  // Anthropic structured outputs reject minimum/maximum on integers. Code clamps
  // every returned component below, so the provider schema only describes shape.
  const SCORE = { type: 'integer' };
  const schema = { type: 'object', additionalProperties: false, required: ['decisions'], properties: { decisions: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['i', 'decision', 'section', 'importanceComponents', 'title', 'why', 'company'], properties: {
      i: { type: 'integer' }, decision: { type: 'string', enum: ['keep', 'routine', 'duplicate', 'outside-scope', 'thin-evidence'] },
      section: { type: 'string', enum: SECTIONS },
      importanceComponents: { type: 'object', additionalProperties: false,
        required: ['nationalConsequence', 'usMexicoStakes', 'modelImpact', 'durability', 'officialness'],
        properties: { nationalConsequence: SCORE, usMexicoStakes: SCORE, modelImpact: SCORE, durability: SCORE, officialness: SCORE } },
      title: { type: 'string' }, why: { type: 'string' }, company: { type: 'string' },
    } } } } };
  const system = `You are the editor of The Mexico Brief's event log — "What's happening", the homepage lead. ASSESS EVERY candidate news item. Return exactly one decision for every input index, with no missing or repeated index. Use decision "keep" only for a genuine, dated development someone tracking Mexico needs to know: a decree or law (DOF), a Banxico or government policy decision, a court ruling, a security development, a tariff or USMCA move, an election or cabinet change, a major deal or company event. Give particular weight to companies, investment, trade, technology and AI, payments and fintech, energy, public finances, and policy changes with economic consequences. Use the other decision codes for routine market recaps, price blurbs, consumer-service trivia, listicles, opinion, sports, generic global-market stories without a direct Mexico consequence, duplicates, or evidence too thin to report.
CRIME AND VIOLENCE SCOPE (important): The Mexico Brief is not a crime tracker. SKIP an event when the violence IS the story, reported for its own sake: cartel or gang violence, individual homicides, shootings, murders, kidnappings, disappearances, body counts, or a personal tragedy. KEEP an event that carries a genuine political, economic, electoral, or diplomatic angle even when it involves crime, gangs, or death: a security law or reform, a court or legal ruling with political weight, a U.S.-Mexico security or migration dispute, a sanction or extradition with diplomatic stakes, or the government's own crime statistics presented as a record of its performance. When a violent event also has real political or economic consequence, keep it and FRAME it by that consequence, not the violence. When in doubt, ask whether a reader following Mexico's economy, politics, and U.S. relationship needs it; if the only thing there is the crime itself, skip it.
SCHEDULED OUTCOMES (hard requirement): a candidate with scheduledOutcome is an exact-day actor + subject + outcome match to an editorial obligation. SELECT it. A decision to hold a rate or leave a policy unchanged is still a new outcome because the decision, vote and guidance resolve uncertainty. Do not mistake "unchanged" for "not news."
For EVERY item, return:
- i: its index in the list
- decision: keep | routine | duplicate | outside-scope | thin-evidence
- section: exactly one of economy | money | politics | security | us-mexico | society
- importanceComponents: score 0, 1, or 2 on EACH of five criteria: nationalConsequence, usMexicoStakes, modelImpact, durability, and officialness. Return the five scores separately. Code, not you, owns the arithmetic.
- title: for keep, a clean factual headline in present tense; otherwise "". No hype, em-dash, clickbait or unexplained acronyms. Say "US trade office", "US-Mexico-Canada trade agreement", "Mexico's statistics agency", or an equally clear plain-English name instead of USTR, USMCA, INEGI, DOF, and similar shorthand.
- why: for keep, ONE or two sentences of context that add a sourced fact; otherwise "". Write ONLY from the provided title and dek. Copy every number exactly as supplied. No invented facts or adjectives doing the work of an argument.
- company: for keep, the one named company when the event is primarily about it; otherwise "". Never invent a company.
A scheduled outcome must use decision "keep". A defining national event scores 9-10; a solid worth-a-line item lands 5-6; routine or out-of-scope material scores 0. Code chooses the final ${MAX_NEW} by the component total. Return JSON.

${REPORT}

${BAN}`;
  const payload = cands.map((x, i) => ({
    i,
    beat: x.beat,
    date: editorialDay(x.published_at),
    source: x.sourceName || x.source || '',
    sourceTier: x.tier || '',
    url: x.url,
    scheduledOutcome: x._scheduled ? {
      id: x._scheduled.id,
      label: x._scheduled.label,
      officialSource: x._scheduled.source,
      importanceFloor: x._scheduled.importanceFloor,
      requiredForBrief: x._scheduled.requiredForBrief,
    } : null,
    title: x.title,
    dek: (x.dek || '').slice(0, 200),
  }));
  // The response is deliberately exhaustive. A model omission is a failed curation
  // contract, not an invisible editorial decision. Keeping the input to 24 makes the
  // one-row-per-candidate receipt cheaper than repeatedly rescoring a 50-item backlog.
  const out = await askJSON({ system, user: JSON.stringify(payload), schema, maxTokens: CURATION_MAX_TOKENS, effort: 'low', model: models.HAIKU, priority: 'core' });
  if (!out || !Array.isArray(out.decisions)) {
    console.warn('  curate: no model result — deterministic fallback');
    const fallback = curateFallback(cands, now);
    return curationResult(cands, now, fallback, {
      mode: 'deterministic-fallback',
      complete: true,
      assessedCount: cands.length,
      reason: 'model request unavailable; conservative deterministic assessment used',
    });
  }
  const coverage = decisionCoverage(cands.length, out.decisions);
  if (!coverage.ok) {
    const reason = `model decision receipt incomplete: missing=${coverage.missing.join(',') || 'none'} duplicate=${coverage.duplicates.join(',') || 'none'} invalid=${coverage.invalid.join(',') || 'none'}`;
    console.warn(`  curate: ${reason} — deterministic fallback`);
    // The model call has already happened. Retrying the same malformed batch on every
    // hourly run spends money without improving the edition. Assess the complete set
    // with the conservative local policy, persist that receipt, and let unsupported or
    // untranslated items stay quarantined.
    const fallback = curateFallback(cands, now);
    return curationResult(cands, now, fallback, {
      mode: 'deterministic-fallback',
      complete: true,
      assessedCount: cands.length,
      reason,
    });
  }
  const assessed = out.decisions.map((row) => {
    const x = cands[row.i];
    return { row, x, scored: normalizeModelImportanceRow(row, { scheduledObligation: scheduledObligation(x) }) };
  });
  const counts = assessed.reduce((memo, item) => {
    memo[item.row.decision] = (memo[item.row.decision] || 0) + 1;
    return memo;
  }, {});
  console.log(`  curation receipt ${assessed.length}/${cands.length} decisions · ${JSON.stringify(counts)}`);
  for (const item of assessed) {
    if (item.row.decision !== 'keep' && attentionSignal(item.x) >= 2) {
      console.warn(`  reviewed signal candidate ${item.row.i}: ${item.row.decision} (${item.scored.importance}/10) · ${String(item.x.title || '').slice(0, 100)}`);
    }
  }
  const kept = assessed.filter((item) => item.row.decision === 'keep')
    .sort((a, b) => b.scored.importance - a.scored.importance
      || Number(Boolean(b.x._scheduled)) - Number(Boolean(a.x._scheduled))
      || a.row.i - b.row.i)
    .slice(0, MAX_NEW);
  const events = [];
  for (const { row: r, x, scored } of kept) {
    const sec = SECTIONS.includes(r.section) ? r.section : beatSection(x);
    if (RAW_HEADLINE_RX.test(String(r.title || ''))) {
      console.warn(`  reject generated event ${r.i}: headline is not neutral`);
      continue;
    }
    const ev = mkEvent(x, sec, scored.importance, r.title, r.why, r.company);
    const gate = lintEventReport({ event: ev, inputs: evidenceInputs(ev) });
    if (!gate.ok) {
      console.warn(`  reject generated event ${r.i}: ${gate.flags.join('; ')}`);
      continue;
    }
    ev.importance = scored.importance;
    ev.importanceComponents = scored.importanceComponents;
    ev.importanceProvenance = scored.importanceProvenance;
    events.push(ev);
  }
  const published = events.slice(0, MAX_NEW);
  const rejectedKeeps = kept.length - published.length;
  return curationResult(cands, now, published, {
    mode: 'model',
    // Completeness means every candidate received a decision. A generated headline
    // that fails the copy gate is correctly quarantined; it does not make the other
    // 23 decisions incomplete or justify rerunning the same paid batch forever.
    complete: true,
    assessedCount: assessed.length,
    rejectedKeeps,
    reason: rejectedKeeps ? `${rejectedKeeps} selected event(s) quarantined by the copy gate` : '',
  });
}

// ---- BRIEFLY EXPLAINED: the required value-added layer for selected developments.
// The visible summary remains reported fact. The disclosure adds three distinct things:
//   background  — the structural facts a newcomer needs
//   view        — a narrow, evidence-backed judgment, explicitly labeled as ours
//   prediction  — what we expect or the measurable condition that would change the view
// All three are grounded in retained evidence. Thin evidence blocks publication; it
// never produces filler and it never changes the factual ranking. v9 also requires a
// primary record and a separate claim-by-claim evidence audit. ----
const ANALYSIS_VERSION = 9;
const BG_MAX = 5;             // The Brief itself has a hard cap of five selected stories.
const BG_FETCH_MAX = 9;       // Failed article fetches must not consume the scarce analysis slots.
const BG_DAYS = 14;           // recent events earn the analysis fetch
const BG_MIN_IMP = 5;         // ordinary headlines do not need an analysis layer
const stripDashWs = (s) => String(s || '').replace(/\s*—\s*/g, ', ').replace(/;\s*/g, ', ').replace(/\s+/g, ' ').trim();
const contextualEvidence = (source) => source && source.kind !== 'article' && /^https:\/\//i.test(String(source.url || ''));
const sourceHost = (value) => {
  try { return new URL(String(value || '')).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
};
const sourceKey = (value) => String(value || '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
const primaryRecordUrl = (value) => {
  const host = sourceHost(value);
  return Boolean(host && (
    /(?:^|\.)gob\.mx$/.test(host)
    || /(?:^|\.)gov$/.test(host)
    || /(?:^|\.)gov\.[a-z]{2}$/.test(host)
    || ['banxico.org.mx', 'inegi.org.mx', 'diariooficial.gob.mx', 'ift.org.mx', 'pemex.com', 'cfe.mx',
      'oecd.org', 'imf.org', 'worldbank.org', 'iadb.org'].some((domain) => host === domain || host.endsWith(`.${domain}`))
  ));
};
const primaryResearchUrl = (value) => {
  if (primaryRecordUrl(value)) return true;
  try {
    const url = new URL(String(value || ''));
    return /\/(?:investor|investors|investor-relations|inversionistas|filings?|reports?|annual-report|quarterly-results|newsroom|press-releases?|sala-de-prensa)(?:\/|$)/i.test(url.pathname);
  } catch { return false; }
};

const SECTION_TOPICS = {
  economy: ['economy', 'trade', 'energy', 'fiscal'],
  money: ['money', 'payments', 'economy'],
  politics: ['politics', 'fiscal'],
  security: ['security', 'politics', 'society'],
  society: ['society', 'economy'],
  'us-mexico': ['us-mexico', 'trade', 'migration'],
};
const evidenceTokens = (value) => new Set(normTitle(value).split(' ').filter((word) => word.length > 3));
const tokenOverlap = (left, right) => {
  const a = evidenceTokens(left), b = evidenceTokens(right);
  let score = 0;
  for (const word of a) if (b.has(word)) score++;
  return score;
};
function topicalKeys(event) {
  const text = `${event.title || ''} ${event.why || ''}`;
  const keys = new Set(SECTION_TOPICS[event.section] || ['economy']);
  if (/tariff|trade|export|import|usmca|t-?mec|customs/i.test(text)) keys.add('trade');
  if (/inflation|rate|banxico|peso|bank|credit|market|stock/i.test(text)) keys.add('money');
  if (/power|electric|energy|pemex|cfe|gas|water|grid/i.test(text)) keys.add('energy');
  if (/migration|border|remittance/i.test(text)) keys.add('migration');
  if (/crime|security|cartel|homicide|extortion/i.test(text)) keys.add('security');
  return keys;
}
function relevantStanding(event, facts, limit = 5) {
  const keys = topicalKeys(event);
  const text = `${event.title || ''} ${event.why || ''}`;
  return facts.map((fact) => ({
    fact,
    score: arr(fact.topics).filter((topic) => keys.has(topic)).length * 10 + tokenOverlap(text, fact.fact),
  })).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.fact.id).localeCompare(String(b.fact.id)))
    .slice(0, limit).map((item) => item.fact);
}

async function addBackgrounds(events, now, { priorityIds = [], onlyPriority = false } = {}) {
  const priority = new Set(priorityIds);
  const cutoff = now.getTime() - BG_DAYS * 864e5;
  const totalWords = (e) => ['background', 'view', 'prediction']
    .reduce((n, f) => n + String(e[f] || '').split(/\s+/).filter(Boolean).length, 0);
  const IMG_MAX_TRIES = 6;   // a few chances so a late og:image (or a now-unblocked fetch) is caught
  const CORE = ['background', 'view', 'prediction'];
  const coreComplete = (e) => CORE.every((f) => stripDashWs(e[f]));
  const refsComplete = (e) => CORE.every((field) => arr(e?.analysisRefs?.[field]).some((ref) => stripDashWs(ref)));
  const sourcesComplete = (e) => arr(e?.analysisSources).some(contextualEvidence);
  const analysisReady = (e) => Boolean(e && coreComplete(e) && refsComplete(e) && sourcesComplete(e) && e.analysisV === ANALYSIS_VERSION);
  const needsAnalysis = (e) => !analysisReady(e) || totalWords(e) > 190;
  const outcome = (event, reason) => ({ id: event?.id || '', ready: analysisReady(event), reason });
  if (!hasLLM()) return {
    added: 0,
    outcomes: priorityIds.map((id) => {
      const event = events.find((candidate) => candidate.id === id);
      return outcome(event, analysisReady(event) ? 'ready' : 'no-llm');
    }),
  };
  // A fresh article often loads BEFORE its og:image is set (or behind a first-hit consent
  // page), so "fetched, no image" is NOT final — retry up to a few times over later runs so
  // the picture is picked up once it appears (Audit 2026-07-18: an El País Ruffo story was
  // permanently blank because the first fetch loaded the page image-less and locked it).
  const needsImage = (e) => !e.image && (e.imgTries || 0) < IMG_MAX_TRIES;
  const want = events.filter((e) => (e.importance || 0) >= BG_MIN_IMP && (needsAnalysis(e) || needsImage(e)) && e.url && (Date.parse(e.date) || 0) >= cutoff)
    .filter((e) => !onlyPriority || priority.has(e.id))
    .sort((a, b) => Number(priority.has(b.id)) - Number(priority.has(a.id))
      || Number(Boolean(b.scheduledEventId)) - Number(Boolean(a.scheduledEventId))
      || (Number(b.importance) || 0) - (Number(a.importance) || 0)
      || (Date.parse(b.publishedAt || b.date) || 0) - (Date.parse(a.publishedAt || a.date) || 0))
    .slice(0, BG_FETCH_MAX);
  if (!want.length) return {
    added: 0,
    outcomes: priorityIds.map((id) => {
      const event = events.find((candidate) => candidate.id === id);
      return outcome(event, analysisReady(event) ? 'ready' : 'not-eligible');
    }),
  };
  const standingFacts = arr(readJson(D('standing.json'), { facts: [] }).facts);
  const calendar = arr(readJson(D('events.json'), { events: [] }).events)
    .filter((event) => event?.date && Date.parse(`${event.date}T12:00:00Z`) >= now.getTime() - 864e5
      && Date.parse(`${event.date}T12:00:00Z`) <= now.getTime() + (60 * 864e5));
  // These are the homepage's own current reference numbers. Each stays attached to
  // its official source so the writer can connect a story to a dated baseline and the
  // reader can follow that connection.
  const siteNumbers = [
    ['banxico-usdmxn-fix', 'Peso, MXN per US dollar', /peso|currency|exchange|dollar|export|import|remittance/i],
    ['banxico-cetes-28d', 'Cetes 28-day rate, percent', /cetes|rate|yield|credit|borrow|bond|financ/i],
    ['banxico-bmv-ipc', 'IPC stock index', /stock|market|listed|equity|bmv|ipc/i],
    ['fred-ust10', 'US 10-year Treasury yield, percent', /US rate|treasury|yield|bond|rate gap/i],
    ['banxico-exports-total', 'Monthly goods exports, US dollars', /trade|tariff|export|manufactur|border|usmca|t-?mec/i],
    ['banxico-inflacion', 'Headline inflation, percent year over year', /inflation|price|banxico|rate|wage/i],
    ['banxico-tasa-objetivo', 'Banxico policy rate, percent', /banxico|policy rate|interest|inflation|credit|peso/i],
    ['banxico-remesas', 'Monthly remittances, US dollars', /remittance|migrant|household|border|peso/i],
  ].flatMap(([id, label, match]) => {
    const doc = readJson(D(`series/${id}.json`), {});
    const rows = arr(doc.data).filter((r) => Number.isFinite(Number(r?.value)));
    const last = rows[rows.length - 1];
    return last ? [{
      id: `number:${id}`, kind: 'number', source: doc.meta?.source || label,
      url: doc.meta?.sourceUrl || '', match,
      text: `${label}: ${last.value} (as of ${String(last.date).slice(0, 10)})`,
    }] : [];
  });
  const fetched = await Promise.all(want.map(async (e) => {
    const r = await fetchArticle(e.url).catch(() => ({ ok: false, text: '', image: '', fetched: false }));
    const related = arr(e.coverage).filter((source) => source.url && source.url !== e.url).slice(0, 1);
    const secondary = await Promise.all(related.map(async (source) => ({
      source: source.source || '',
      title: source.title || '',
      summary: source.summary || '',
      result: await fetchArticle(source.url).catch(() => ({ ok: false, text: '' })),
    })));
    return { e, r, secondary, research: [] };
  }));
  // A news report can contain the relevant facts and still describe the current stage
  // incorrectly. That happened with both the FAA Category 1 review and the strawberry
  // dumping case on 2026-08-13. Discover one primary public record for each selected
  // non-official article, fetch the record ourselves, and make it part of the closed
  // evidence set. Search finds the document; it never writes the analysis.
  const researchTargets = fetched.filter((item) => needsAnalysis(item.e) && !primaryRecordUrl(item.e.url));
  if (researchTargets.length) {
    const researchSchema = { type: 'object', additionalProperties: false, required: ['source'], properties: { source: {
      type: 'object', additionalProperties: false, required: ['url', 'source', 'title'], properties: {
        url: { type: 'string' }, source: { type: 'string' }, title: { type: 'string' },
      },
    } } };
    // One small request per story is simpler and more dependable than asking one model
    // turn to perform five searches and hoping it uses the full allowance. Search only
    // identifies the record; the fetched document, not the search answer, is evidence.
    for (const target of researchTargets) {
      const researched = await askJSON({
        system: `Use the web search exactly once. Find one public PRIMARY RECORD for this Mexico news story. Prefer the government agency, regulator, court, legislature, official statistics release, company filing, or company investor-relations document that establishes the current status and procedural stage. Do not return another news article, search result page, social post, Wikipedia page, lobby group, or commentary. The record must help catch a stale or mistaken stage in the article, not merely repeat its headline. Return an empty URL when no primary public record exists. Return JSON only.`,
        user: JSON.stringify({ headline: target.e.title, summary: target.e.why, source: target.e.source, sourceUrl: target.e.url }),
        schema: researchSchema,
        maxTokens: 500,
        model: models.HAIKU,
        priority: 'core',
        returnMeta: true,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
      });
      const proposed = researched?.data?.source || {};
      const searched = arr(researched?.webSources);
      const exact = searched.find((source) => sourceKey(source.url) === sourceKey(proposed.url));
      const source = exact || searched.find((candidate) => primaryResearchUrl(candidate.url));
      if (!source || !primaryResearchUrl(source.url) || sourceHost(source.url) === sourceHost(target.e.url)) {
        console.warn(`  research miss ${target.e.id}: no verified primary record`);
        continue;
      }
      const result = await fetchArticle(source.url).catch(() => ({ ok: false, text: '' }));
      if (String(result.text || '').length < 250) {
        console.warn(`  research miss ${target.e.id}: primary record could not be read`);
        continue;
      }
      target.research.push({
        source: stripDashWs(proposed.source) || sourceHost(source.url),
        title: stripDashWs(proposed.title) || stripDashWs(source.title),
        url: source.url,
        result,
      });
    }
    console.log(`  research: ${fetched.filter((item) => primaryRecordUrl(item.e.url) || item.research.length).length}/${fetched.filter((item) => needsAnalysis(item.e)).length} selected stories have a primary record`);
  }
  // The article's own link-preview image rides along free with the fetch (unfurl-style
  // thumbnail; https-only). Count every attempt so retries are bounded at IMG_MAX_TRIES.
  for (const x of fetched) {
    if (x.r.image && !x.e.image) x.e.image = x.r.image;
    x.e.imgTries = (x.e.imgTries || 0) + 1;
  }
  const evidenceFor = (x) => {
    const evidence = [];
    const seenIds = new Set(), seenUrls = new Set();
    const push = (item) => {
      const id = stripDashWs(item?.id), text = stripDashWs(item?.text), url = stripDashWs(item?.url);
      if (!id || !text || seenIds.has(id)) return;
      if (url && !/^https:\/\//i.test(url)) return;
      evidence.push({ id, kind: item.kind || 'source', source: stripDashWs(item.source) || 'Source', url, text });
      seenIds.add(id); if (url) seenUrls.add(url);
    };
    const raw = x.e.reportEvidence || {};
    push({
      id: 'article', kind: primaryRecordUrl(x.e.url) ? 'primary' : 'article', source: x.e.source, url: x.e.url,
      text: [raw.title, raw.dek, String(x.r.text || '').slice(0, 1800)].filter(Boolean).join(' '),
    });
    for (const [index, source] of x.research.entries()) push({
      id: `primary:${index + 1}`, kind: 'primary', source: source.source, url: source.url,
      text: [source.title, String(source.result.text || '').slice(0, 2200)].filter(Boolean).join(' '),
    });
    for (const [index, source] of x.secondary.entries()) {
      const coverage = arr(x.e.coverage).find((item) => item.url && item.url !== x.e.url && item.source === source.source) || {};
      push({
        id: `report:${index + 1}`, kind: 'report', source: source.source,
        url: coverage.url || '',
        text: [source.title, source.summary, String(source.result.text || '').slice(0, 900)].filter(Boolean).join(' '),
      });
    }
    for (const source of arr(x.e.coverage)) {
      if (!source.url || source.url === x.e.url || seenUrls.has(source.url)) continue;
      push({
        id: `coverage:${evidence.length}`, kind: 'report', source: source.source,
        url: source.url, text: [source.title, source.summary].filter(Boolean).join(' '),
      });
    }
    for (const fact of relevantStanding(x.e, standingFacts)) push({
      id: `standing:${fact.id}`, kind: 'standing', source: fact.source, url: fact.url, text: fact.fact,
    });
    const eventText = `${x.e.title || ''} ${x.e.why || ''}`;
    for (const number of siteNumbers.filter((item) => item.match.test(eventText)).slice(0, 3)) push(number);
    const eventKeys = topicalKeys(x.e);
    const relevantCalendar = calendar.map((item) => ({
      item,
      score: tokenOverlap(eventText, `${item.label || ''} ${item.mechanism || ''}`)
        + (eventKeys.has(item.kind) ? 5 : 0),
    })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || String(a.item.date).localeCompare(String(b.item.date))).slice(0, 2);
    for (const { item } of relevantCalendar) push({
      id: `calendar:${item.id || `${item.date}:${slug(item.label || item.title)}`}`,
      kind: 'calendar', source: item.source, url: item.sourceUrl,
      text: `${item.date}: ${item.label || item.title}. ${item.mechanism || ''}`,
    });
    const relatedEvents = events.filter((event) => event.id !== x.e.id && (event.importance || 0) >= 5
      && Date.parse(event.date) >= now.getTime() - BG_DAYS * 864e5)
      .map((event) => ({ event, score: (event.section === x.e.section ? 3 : 0) + tokenOverlap(eventText, `${event.title || ''} ${event.why || ''}`) }))
      .filter((item) => item.score >= 4)
      .sort((a, b) => b.score - a.score || (Date.parse(b.event.date) || 0) - (Date.parse(a.event.date) || 0)).slice(0, 3);
    for (const { event } of relatedEvents) push({
      id: `event:${event.id}`, kind: 'prior-event', source: event.source, url: event.url,
      text: [event.date, event.reportEvidence?.title || event.title, event.reportEvidence?.dek || event.why].filter(Boolean).join(' '),
    });
    return evidence.slice(0, 14);
  };
  // A blocked article body is not allowed to take down the explanation by itself.
  // The retained publisher title/dek and linked contextual evidence are still a closed,
  // auditable evidence set. If even that set is empty, the story remains unready.
  const items = fetched.filter((x) => needsAnalysis(x.e)).slice(0, BG_MAX).map((x, i) => ({
    i, e: x.e, evidence: evidenceFor(x),
  })).filter((item) => item.evidence.some(contextualEvidence));
  const imgGot = fetched.filter((x) => x.r.image).length;
  console.log(`  fetch: ${want.length} wanted · ${items.length} to analyze · ${imgGot} images grabbed`);
  if (!items.length) return {
    added: 0,
    outcomes: priorityIds.map((id) => {
      const event = events.find((candidate) => candidate.id === id);
      return outcome(event, analysisReady(event) ? 'ready' : 'thin-evidence');
    }),
  };
  const FIELD = { type: 'string' };
  const REFS = { type: 'array', items: { type: 'string' } };
  const schema = { type: 'object', additionalProperties: false, required: ['analyses'], properties: { analyses: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['i', 'background', 'backgroundRefs', 'view', 'viewRefs', 'prediction', 'predictionRefs'], properties: {
      i: { type: 'integer' }, background: FIELD, backgroundRefs: REFS,
      view: FIELD, viewRefs: REFS, prediction: FIELD, predictionRefs: REFS,
    } } } } };
  const system = `You are writing the required BRIEFLY EXPLAINED unit for every selected story in The Mexico Brief. The headline and summary already report what happened. Use only the numbered EVIDENCE supplied with each story.
THE VALUE TEST: every field must add something the headline and summary do not already tell the reader. Paraphrase is failure. Connect the story to another report, standing fact, current number, calendar item, or earlier event when the connection is genuinely useful. Do not force a connection just to sound analytical.
- background: the one institution, rule, market structure, or durable fact a newcomer needs to follow this story. Usually one sentence, two only when the second adds scale.
- view: verdict first. Explain the practical consequence, the mechanism that produces it, and the relevant tradeoff. Say who is affected. If the story leads with money, capacity, jobs, or another announcement number, use a supplied denominator or comparison. If none exists, do not call the number large, small, good, or important.
- prediction: the concrete next decision, release, or result and the observable fork it will resolve. Add a likely outcome only when the evidence supports one. Use a supplied date only when one exists. Distinguish an announcement from financing, permits, construction, enforcement, or operation.
DRAFT TARGETS: background at most 35 words, view at most 50, prediction at most 35. These targets leave editing room below the hard publication caps of 45, 60, and 45 words. Aim for 60 to 105 words across the complete unit, not per field.
MISSING FIELDS: write only the fields named in missingFields for each item. For every other field return "" and []. This lets one bounded retry repair only what failed without rewriting approved work.
CORRECTIONS: when an item includes corrections, those are exact deterministic reasons the prior draft failed. Fix each named problem. An unsupported number must either be removed or supported by adding the evidence ID that contains it, without exceeding two references. A word-cap failure must be rewritten below the stated cap, not merely trimmed mid-sentence.
PREDICTION SHAPE: name the next real step, then use if, unless, whether, confirm, or weaken to state the observable evidence that tests the view. Do not force a probability call when the supplied evidence supports only the next decision or release.
EVIDENCE REFERENCES: return one or two exact evidence IDs for each field in backgroundRefs, viewRefs, and predictionRefs. Cite only evidence actually supporting that field. backgroundRefs must include evidence beyond the original article, preferably a primary record and otherwise a separate report, standing fact, official number, or calendar record. Background is where the second source establishes context before interpretation begins. A judgment may be an inference, but its mechanism must be supported. Never round, shorten, or drop decimals from a supplied number. Unknown ID, unsupported number, or factual claim not supported by the cited evidence fails publication.
If the evidence cannot support a field, return "" and [] for that field. That will block publication for review; inventing or padding is worse.
Briefly Explained is not written in the first person. Do not use I, me, my, we, or our. Start with the actual actor, event, or outcome. Do not mechanically begin predictions with "The base case is" or follow with "That view would change if". Those phrases may appear once in a batch if they are genuinely the clearest wording, but repeated openers are a publication failure. First person is not part of the publication voice.
Length is a claim about stakes, so make it true. A "this matters less than it looks" verdict should be short. Never write "fiscal room"; say ability to spend or borrow. Never make the reader decode an acronym: spell it out on first mention. "US" is fine. Calm, direct, normal language. No em dash, semicolon, canned contrast, headline fragments, marketing language, or number absent from the cited evidence. Return JSON.

${TRUST}

${SEAM}

${ANALYSIS_SHAPE}

${EARNED_LINE}

${BAN}`;
  // Keep only fields that passed during this exact locked-selection run. A retry sees
  // identical evidence and the same story, so combining independently approved fields
  // is still one reviewed unit. Nothing from an earlier edition is carried forward.
  const approvedThisRun = new Map();
  const approvedRefsThisRun = new Map();
  const rejectionsThisRun = new Map();
  const rememberRejection = (eventId, field, reasons) => {
    const prior = rejectionsThisRun.get(eventId) || {};
    prior[field] = arr(reasons).filter(Boolean);
    rejectionsThisRun.set(eventId, prior);
  };
  const payloadFor = (batch) => ({
    items: batch.map((x) => ({
      i: x.i,
      headline: x.e.title,
      summary: x.e.context || x.e.why || '',
      evidence: x.evidence,
      missingFields: CORE.filter((field) => !approvedThisRun.get(x.e.id)?.[field]),
      corrections: rejectionsThisRun.get(x.e.id) || {},
    })),
  });
  // Start cheaply against the exact selected set. A single medium-effort retry is
  // reserved for any story whose three fields fail as a unit; selection never changes
  // to hide an explanation failure.
  const request = (batch, effort, maxTokens) => askJSON({
    system,
    user: JSON.stringify(payloadFor(batch)),
    schema,
    maxTokens,
    effort,
    model: models.HAIKU,
    priority: 'core',
  });
  const CAPS = { background: [50, 2], view: [70, 3], prediction: [55, 2] };
  let added = 0;
  const completed = new Set();
  const applyDraft = (out, batch) => {
    if (!out || !Array.isArray(out.analyses)) return false;
    for (const r of out.analyses) {
      const item = batch.find((x) => x.i === r.i); if (!item) continue;
      // Treat the disclosure as one editorial unit. Older published prose never enters
      // this object; only fields approved in this run against this locked evidence do.
      const proposed = {};
      const proposedRefs = {};
      const evidenceById = new Map(item.evidence.map((entry) => [entry.id, entry]));
      for (const field of CORE) {
        if (approvedThisRun.get(item.e.id)?.[field]) continue;
        const text = stripDashWs(r[field]);
        if (!text) { rememberRejection(item.e.id, field, ['field was empty']); continue; }
        const refField = `${field}Refs`;
        let refs = [...new Set(arr(r[refField]).map(stripDashWs).filter(Boolean))];
        const invalidRefs = refs.filter((ref) => !evidenceById.has(ref));
        if (!refs.length || refs.length > 2 || invalidRefs.length) {
          const reason = !refs.length ? 'no evidence reference'
            : refs.length > 2 ? `${refs.length} evidence references (cap 2)`
              : `unknown evidence reference ${invalidRefs.join(', ')}`;
          console.warn(`  analysis reject ${item.e.id}.${field}: ${reason}`);
          rememberRejection(item.e.id, field, [reason]);
          continue;
        }
        if (field === 'background' && !refs.some((ref) => contextualEvidence(evidenceById.get(ref)))) {
          const reason = 'background must cite evidence beyond the original article';
          console.warn(`  analysis reject ${item.e.id}.${field}: ${reason}`);
          rememberRejection(item.e.id, field, [reason]);
          continue;
        }
        const [maxWords, maxSentences] = CAPS[field];
        // Validate the public claim against only the evidence the draft itself cites.
        // Including generated copy or the whole research bundle here would let an
        // unsupported claim appear grounded merely because another source was nearby.
        const gateFor = (candidateRefs) => {
          const inputs = candidateRefs.map((ref) => evidenceById.get(ref).text);
          return field === 'background'
            ? lintReportText({ text, inputs, maxWords, maxSentences })
            : lintAnalysisText({ text, inputs, role: field, maxWords, maxSentences,
              requireScale: field === 'view' && analysisNeedsScale([item.e.title, item.e.context || item.e.why]),
              strictForecast: field === 'prediction', forbidFirstPerson: true });
        };
        let gate = gateFor(refs);
        // If the prose is otherwise sound and its only problem is a number found in
        // another supplied source, attach that source deterministically. This repairs
        // provenance, not prose: no claim changes and the two-source cap still applies.
        if (!gate.ok && refs.length < 2 && gate.flags.every((flag) => /^unsupported number/.test(flag))) {
          const supporting = item.evidence.find((entry) => !refs.includes(entry.id)
            && gateFor([...refs, entry.id]).ok);
          if (supporting) {
            refs = [...refs, supporting.id];
            gate = gateFor(refs);
            console.log(`  analysis evidence repair ${item.e.id}.${field}: added ${supporting.id}`);
          }
        }
        const slop = slopFlags({ title: item.e.title, context: text, url: item.e.url, date: item.e.date });
        if (!gate.ok || slop.length) {
          const reasons = [...gate.flags, ...slop];
          console.warn(`  analysis reject ${item.e.id}.${field}: ${reasons.join('; ')}`);
          rememberRejection(item.e.id, field, reasons);
          continue;
        }
        // Anti-repetition (Audit 2026-07-17): drop a field that merely restates the one-line
        // summary or an earlier field, so the four parts stay four distinct things.
        const priors = [item.e.context || item.e.why, ...Object.values(proposed)].filter(Boolean);
        if (priors.some((p) => jaccard(normTitle(text), normTitle(p)) >= 0.6)) {
          console.warn(`  analysis drop ${item.e.id}.${field}: repeats the summary or an earlier field`);
          rememberRejection(item.e.id, field, ['repeats the summary or an earlier field']);
          continue;
        }
        proposed[field] = text;
        proposedRefs[field] = refs;
        const priorRejections = rejectionsThisRun.get(item.e.id) || {};
        delete priorRejections[field];
        rejectionsThisRun.set(item.e.id, priorRejections);
      }
      const approved = mergeApprovedAttempt(approvedThisRun.get(item.e.id), proposed, CORE);
      approvedThisRun.set(item.e.id, approved);
      const approvedRefs = { ...(approvedRefsThisRun.get(item.e.id) || {}), ...proposedRefs };
      approvedRefsThisRun.set(item.e.id, approvedRefs);
      // v9: all three fields, their exact references, and at least one primary record
      // must pass before anything becomes visible. The fields may come from the first
      // attempt or its one bounded retry, but never from old prose.
      if (CORE.every((field) => approved[field] && arr(approvedRefs[field]).length)) {
        const citedIds = [...new Set(CORE.flatMap((field) => approvedRefs[field]))];
        if (!citedIds.some((id) => contextualEvidence(evidenceById.get(id)))) {
          delete approved.background;
          delete approvedRefs.background;
          rememberRejection(item.e.id, 'background', ['the complete unit did not cite evidence beyond the original article']);
          console.warn(`  analysis incomplete ${item.e.id}: no independent context cited`);
          continue;
        }
        const analysisSources = citedIds.map((id) => evidenceById.get(id))
          .filter((source) => /^https:\/\//i.test(String(source?.url || '')))
          .filter((source, index, sources) => sources.findIndex((other) => other.url === source.url) === index)
          .slice(0, 5)
          .map((source) => ({ id: source.id, kind: source.kind, source: source.source, url: source.url }));
        if (!analysisSources.length) {
          console.warn(`  analysis incomplete ${item.e.id}: cited evidence has no reader-accessible source link`);
          continue;
        }
        Object.assign(item.e, approved, { analysisV: ANALYSIS_VERSION, analysisRefs: approvedRefs, analysisSources });
        if (!completed.has(item.e.id)) added++;
        completed.add(item.e.id);
      } else if (Object.keys(approved).length) {
        console.warn(`  analysis incomplete ${item.e.id}: missing ${CORE.filter((f) => !approved[f]).join(', ')} — held for the bounded retry; no BE shown`);
      }
      if (!stripDashWs(r.background)) console.warn(`  standing-gap: no background written for "${item.e.title.slice(0, 60)}" — is a standing fact missing?`);
    }
    return true;
  };

  // Numeric-token lint cannot catch a reversed status or stage. On 2026-08-13 a
  // draft cited an article that said Mexico had recovered FAA Category 1, then wrote
  // that Mexico was still trying to regain it. A separate copy-desk pass now compares
  // each field with its cited text and every primary record before the unit can ship.
  const auditSchema = { type: 'object', additionalProperties: false, required: ['reviews'], properties: { reviews: {
    type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['i', 'ok', 'failures'], properties: {
        i: { type: 'integer' }, ok: { type: 'boolean' }, failures: { type: 'array', items: {
          type: 'object', additionalProperties: false, required: ['field', 'reason'], properties: {
            field: { type: 'string', enum: CORE }, reason: { type: 'string' },
          },
        } },
      },
    },
  } } };
  const auditCompleted = async (batch, label) => {
    const candidates = batch.filter((item) => completed.has(item.e.id));
    if (!candidates.length) return true;
    const payload = { items: candidates.map((item) => {
      const approved = approvedThisRun.get(item.e.id) || {};
      const refs = approvedRefsThisRun.get(item.e.id) || {};
      const byId = new Map(item.evidence.map((entry) => [entry.id, entry]));
      return {
        i: item.i,
        headline: item.e.title,
        summary: item.e.context || item.e.why || '',
        fields: CORE.map((field) => ({
          field, text: approved[field], refs: refs[field],
          evidence: arr(refs[field]).map((id) => byId.get(id)).filter(Boolean),
        })),
        contextEvidence: item.evidence.filter(contextualEvidence),
      };
    }) };
    const result = await askJSON({
      system: `You are the independent evidence editor for Briefly Explained. Review every field claim by claim. Return ok true only when: (1) every factual status, stage, date, actor and number is directly supported by that field's cited evidence; (2) no supplied primary or contextual record contradicts it; (3) a labeled view is a narrow inference whose mechanism follows from the evidence; and (4) What we're watching names a real next step and an observable test without treating correlation as proof of motive. Pay special attention to words such as alleged, initiated, preliminary, final, proposed, approved, recovered, retained and lost. A source link alone proves nothing. Reject paraphrase that adds no context. For each failure name the field and give one concrete correction. Return exactly one review for every input index and JSON only.`,
      user: JSON.stringify(payload),
      schema: auditSchema,
      maxTokens: 2400,
      model: models.HAIKU,
      priority: 'core',
    });
    const reviews = new Map(arr(result?.reviews).map((review) => [Number(review.i), review]));
    let allPassed = true;
    for (const item of candidates) {
      const review = reviews.get(item.i);
      if (review?.ok) continue;
      allPassed = false;
      const failures = arr(review?.failures).filter((failure) => CORE.includes(failure?.field));
      const rejectedFields = failures.length ? [...new Set(failures.map((failure) => failure.field))] : CORE;
      const approved = approvedThisRun.get(item.e.id) || {};
      const refs = approvedRefsThisRun.get(item.e.id) || {};
      for (const field of rejectedFields) {
        const reasons = failures.filter((failure) => failure.field === field).map((failure) => stripDashWs(failure.reason));
        rememberRejection(item.e.id, field, reasons.length ? reasons : [`${label} evidence audit did not approve this field`]);
        delete approved[field];
        delete refs[field];
      }
      approvedThisRun.set(item.e.id, approved);
      approvedRefsThisRun.set(item.e.id, refs);
      delete item.e.analysisV;
      delete item.e.analysisRefs;
      delete item.e.analysisSources;
      for (const field of CORE) delete item.e[field];
      if (completed.delete(item.e.id)) added = Math.max(0, added - 1);
      console.warn(`  analysis evidence audit reject ${item.e.id}: ${rejectedFields.join(', ')}`);
    }
    return allPassed;
  };

  const first = await request(items, 'low', 3500);
  const firstReturned = applyDraft(first, items);
  if (firstReturned) await auditCompleted(items, 'first-pass');
  const retryItems = items.filter((item) => !completed.has(item.e.id));
  let retryReturned = false;
  if (retryItems.length && budgetStatus('core').available) {
    console.warn(`  analysis retry: ${retryItems.length} selected ${retryItems.length === 1 ? 'story' : 'stories'} did not clear all three fields`);
    retryReturned = applyDraft(await request(retryItems, 'medium', 7000), retryItems);
    if (retryReturned) await auditCompleted(retryItems, 'final');
  }
  if (!firstReturned && !retryReturned) console.warn('  analysis: no model result — selected stories remain unpublished');
  return {
    added,
    outcomes: priorityIds.map((id) => {
      const event = events.find((candidate) => candidate.id === id);
      const fetch = fetched.find((item) => item.e.id === id);
      if (analysisReady(event)) return outcome(event, 'ready');
      if (fetch && !fetch.r.ok && !evidenceFor(fetch).length) return outcome(event, 'fetch-failed');
      if (!budgetStatus('core').available) return outcome(event, 'budget-unavailable');
      if (!firstReturned && !retryReturned) return outcome(event, 'model-unavailable');
      return outcome(event, 'field-rejected');
    }),
  };
}

// ---- merge append-only into the existing log ----
function mergeLog(existing, fresh, now) {
  let events = arr(existing.events).slice();
  const before = events.length;
  // Self-heal: purge any stored entry that no longer meets the copy contract (raw
  // source language, feed boilerplate, truncation, missing link/date). Legacy fallback
  // pollution and any future regression get swept every run, not only the day they land.
  events = events.filter((e) => {
    if (/news\.google\.com/i.test(String(e.url || '')) || /^google news\b|^via gdelt$/i.test(String(e.source || ''))) {
      quarantine(e, ['purged: aggregator is discovery, not a publishable source']);
      return false;
    }
    if (!eventCandidateEligible({ sourceName: e.source, url: e.url }, NEWS_SOURCES)) {
      quarantine(e, ['purged: commentary is reading, not a dated Brief event']);
      return false;
    }
    // Re-evaluate low-confidence deterministic MBN picks on every run. Model- or
    // human-curated MBN stories score 5+ and remain canonical.
    if (e.source === 'Mexico Business News' && (e.importance || 0) <= 2) return false;
    const flags = e.reportEvidence
      ? lintEventReport({ event: e, inputs: evidenceInputs(e) }).flags
      : slopFlags(e);
    if (flags.length) { quarantine(e, ['purged: ' + flags.join('; ')]); return false; }
    return true;
  });

  // Cluster old and new reports together in one transitive pass. An existing event keeps
  // its stable id; a newer report can update the visible facts and clears old analysis so
  // Briefly Explained must be regenerated against the new state.
  const existingIds = new Set(events.map((event) => event.id).filter(Boolean));
  const groups = groupEvents([...events, ...fresh]);
  const added = groups.filter((group) => !group.members.some((member) => existingIds.has(member.id))).length;
  events = groups.map((group) => {
    const existingMembers = group.members.filter((member) => existingIds.has(member.id));
    const displayedExisting = existingMembers.find((member) => member.id === group.event.id);
    const prior = displayedExisting || existingMembers[0] || null;
    if (!prior) return { ...group.event, importance: group.importance, coverage: group.coverage };

    const freshest = group.members.reduce((winner, member) =>
      (Date.parse(member.publishedAt || member.published_at || member.date) || 0)
        > (Date.parse(winner.publishedAt || winner.published_at || winner.date) || 0) ? member : winner, prior);
    const priorTime = Date.parse(prior.publishedAt || prior.date) || 0;
    const freshTime = Date.parse(freshest.publishedAt || freshest.published_at || freshest.date) || 0;
    const merged = { ...prior, importance: group.importance, coverage: group.coverage };
    if (freshTime > priorTime && !existingIds.has(freshest.id)) {
      for (const key of ['date', 'section', 'title', 'why', 'company', 'source', 'url', 'publishedAt', 'sourceTier', 'image', 'imgTries', 'reportEvidence',
        'scheduledEventId', 'scheduledImportanceFloor', 'requiredForBrief', 'importanceProvenance', 'importanceComponents']) {
        if (freshest[key] !== undefined) merged[key] = freshest[key];
      }
      if (!merged.image && group.event.image) merged.image = group.event.image;
      for (const key of ['background', 'view', 'prediction', 'drivers', 'implications', 'next', 'analysisV', 'analysisRefs', 'analysisSources']) delete merged[key];
    }
    if (!merged.reportEvidence) {
      const evidenced = group.members.find((member) => member.reportEvidence);
      if (evidenced) merged.reportEvidence = evidenced.reportEvidence;
    }
    return merged;
  });
  const cutoff = now.getTime() - KEEP_DAYS * 864e5;
  const kept = events.filter((e) => { const t = Date.parse(e.date) || 0; return t >= cutoff || (e.importance || 0) >= 5; });
  kept.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)
    || (Number(b.importance) || 0) - (Number(a.importance) || 0)
    || (Date.parse(b.publishedAt || b.date) || 0) - (Date.parse(a.publishedAt || a.date) || 0));
  return { events: kept.slice(0, MAX_STORE), added, removedDuplicates: Math.max(0, before + fresh.length - events.length) };
}

function attachScheduledMetadata(events, schedule) {
  return events.map((event) => {
    const scheduled = linkScheduledCandidate(event, schedule, event.date);
    if (!scheduled) return event;
    const alreadyAudited = event.scheduledEventId === scheduled.id
      && event.importanceComponents && event.importanceProvenance;
    const scored = alreadyAudited ? {
      importance: event.importance,
      importanceComponents: event.importanceComponents,
      importanceProvenance: event.importanceProvenance,
    } : normalizeModelImportanceRow({
      importance: event.importance,
      importanceComponents: event.importanceComponents || {},
    }, { scheduledObligation: scheduledObligation({ ...event, _scheduled: scheduled }) });
    return {
      ...event,
      importance: clampImp(Math.max(Number(event.importance) || 0, scored.importance)),
      importanceComponents: event.importanceComponents || scored.importanceComponents,
      scheduledEventId: scheduled.id,
      scheduledImportanceFloor: scheduled.importanceFloor,
      requiredForBrief: scheduled.requiredForBrief,
      importanceProvenance: scored.importanceProvenance,
    };
  });
}

async function main() {
  const now = new Date();
  const analysisOnly = process.argv.includes('--analysis-for-brief');
  const skipAnalysis = process.argv.includes('--skip-analysis');
  const resumeCurrentEdition = process.argv.includes('--resume-current-edition');
  console.log(`\nbuild-happening · model ${hasLLM() ? model : 'none (deterministic fallback)'}`);
  const existing = readJson(D('happening.json'), { meta: {}, events: [] });
  if (analysisOnly) {
    const brief = readJson(D('brief.json'), {});
    if (brief?.meta?.selection?.empty) {
      console.log('  targeted analysis: quiet edition, no selected stories');
      return;
    }
    const selectedIds = [brief.lead, ...arr(brief.items)]
      .map((story) => arr(story?.refs)[0])
      .filter(Boolean);
    if (!selectedIds.length) {
      console.log('  targeted analysis: quiet edition, no selected stories');
      return;
    }
    const lockedIds = arr(brief?.meta?.selection?.lockedIds);
    if (!lockedIds.length || JSON.stringify(lockedIds) !== JSON.stringify(selectedIds)) {
      throw new Error('targeted analysis requires the exact selection-only lock for this edition');
    }
    const events = arr(existing.events);
    const analysis = await addBackgrounds(events, now, { priorityIds: selectedIds, onlyPriority: true });
    const out = {
      ...existing,
      meta: {
        ...existing.meta,
        updated: editorialDay(now),
        generatedAt: now.toISOString(),
        count: events.length,
        llm: hasLLM(),
        analysisTarget: { policy: 'every-selected-story-context-audited-v3', ids: selectedIds, ...analysis },
      },
      events,
    };
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    const u = usage();
    console.log(`  targeted analysis: ${analysis.outcomes.filter((item) => item.ready).length}/${selectedIds.length} selected stories ready`);
    console.log(`  llm: ${u.calls} calls · ${u.input}+${u.output} tok · ~$${u.costUSD.toFixed(4)}\n`);
    return;
  }
  const schedule = readJson(D('events.json'), { events: [] });
  const universe = candidatePool(now, existing.events, schedule);
  const signature = candidateSignature(universe);
  const publicationStatus = readJson(D('publication-status.json'), {});
  const persistedCheckpoint = publicationStatus.state === 'deferred'
    && publicationStatus.editorialDate === editorialDay(now)
    ? publicationStatus.curation : null;
  const checkpoint = existing.meta?.curation?.editorialDate === editorialDay(now)
    ? existing.meta.curation : persistedCheckpoint;
  if (resumeCurrentEdition && canReuseCuration(checkpoint, editorialDay(now), signature)) {
    console.log('  curation checkpoint still matches the source ledger — reusing the assessed event log');
    return;
  }
  if (resumeCurrentEdition && checkpoint?.editorialDate === editorialDay(now)) {
    console.log('  new eligible reporting arrived — invalidating the earlier curation checkpoint');
  }
  const cands = prioritizeCandidates(universe).slice(0, MAX_CANDIDATES);
  console.log(`  candidates ${cands.length} (last ${WINDOW_DAYS}d) · existing log ${arr(existing.events).length}`);
  const curation = await curate(cands, now);
  curation.receipt.candidateSig = signature;
  const fresh = curation.events;
  console.log(`  curated ${fresh.length} fresh events`);
  const merged = attachScheduledMetadata(mergeLog(existing, fresh, now).events, schedule);
  // Curated framing stays human; referenced values are re-derived from the stored
  // first-party dataset on every run so corrected source data cannot leave stale copy.
  const events = reconcileHappeningFactCopy(merged, { tradeUS: readJson(D('trade-us.json'), null) });
  const bgResult = skipAnalysis ? { added: 0, outcomes: [] } : await addBackgrounds(events, now);
  if (bgResult.added) console.log(`  background: ${bgResult.added} written (article-grounded)`);

  const out = {
    meta: {
      title: "What's happening",
      note: NOTE,
      updated: editorialDay(now),
      source: 'The Mexico Brief', sourceUrl: 'https://mexicobrief.com/',
      count: events.length, generatedAt: now.toISOString(), llm: hasLLM(),
      curation: curation.receipt,
    },
    events,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

  // Persist this run's rejects for visibility + the "should we keep quarantining"
  // risk check (gitignored — never a site input, never committed).
  const qOut = { meta: { note: 'Items rejected by the slop gate this run — never published. See pipeline/lib/lint.js slopFlags.', generatedAt: now.toISOString(), count: QUARANTINE.length }, items: QUARANTINE.slice(0, 120) };
  fs.writeFileSync(QUARANTINE_OUT, JSON.stringify(qOut, null, 2));

  const bySec = {}; events.forEach((e) => { bySec[e.section] = (bySec[e.section] || 0) + 1; });
  const u = usage();
  console.log(`  wrote ${path.relative(ROOT, OUT)} · ${events.length} events · ${QUARANTINE.length} quarantined · sections ${JSON.stringify(bySec)}`);
  console.log(`  llm: ${u.calls} calls · ${u.input}+${u.output} tok · ~$${u.costUSD.toFixed(4)}\n`);
}

main().catch((e) => { console.error('build-happening failed:', e.stack || e.message); process.exit(1); });
