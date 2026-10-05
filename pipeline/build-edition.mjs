// The Mexico Brief's only edition writer.
//
// The whole candidate is built and checked in memory. data/edition.json is replaced
// once, after English, Spanish, evidence, dates and story order all pass. Any failure
// exits non-zero and leaves the previous public edition byte-for-byte unchanged.

import crypto from 'node:crypto';
import { persistModelAccounting } from './lib/persist-model-accounting.mjs';
import { restoreHeldEdition } from './lib/held-edition-recovery.mjs';
import { requirePublicationRequest } from './lib/publication-request.mjs';
import { createEditionQuarantine } from './lib/edition-quarantine.mjs';
import { createFieldRepairPlan, mergeFieldRepairs } from './lib/edition-field-repair.mjs';
import { articleIdentity, publishedProvenanceUrls } from './lib/article-identity.mjs';
import { shapeEvidenceRecord } from './lib/source-evidence.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectNews } from './collect-news.js';
import { fetchArticle } from './lib/fetch-article.js';
import { editorialSourceTier, eventCandidateEligible, mexicoRelevant, registeredSourceFor, stripNewsBoilerplate } from './lib/news-trust.js';
import {
  lintAnalysisText, lintReportText, reportContextDistinct, unsupportedNumericTokens,
} from './lib/lint.js';
import newsDay from './lib/news-day.cjs';
import newsThreads from './lib/news-threads.cjs';
import scheduledCandidate from './lib/scheduled-candidate.cjs';
import candidatePriority from './lib/candidate-priority.cjs';
import analysisEvidence from './lib/analysis-evidence.cjs';
import publicEdition from './lib/public-edition.cjs';
import attemptContract from './lib/edition-attempts.cjs';
import { plainSourceName } from './lib/plain-language.cjs';
import { REPORT, TRUST, SEAM, EARNED_LINE, BAN } from './lib/voice.js';
import { validateNarrativeText } from './lib/publication-contract.js';
import { articleUrlAllowed, sourceHosts } from './lib/url-safety.js';
import bilingualFidelity from './lib/bilingual-fidelity.cjs';
import editionHistory from './lib/edition-history.cjs';
import reviewGate from './lib/review-gate.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const EDITION_FILE = path.join(DATA, 'edition.json');
const ATTEMPTS_FILE = path.join(DATA, 'edition-attempts.json');
const MAX_CANDIDATES = 24;
const MAX_RANKED = 8;
const MAX_VISIBLE = 5;
const MIN_VISIBLE = 3;
const MAX_WEEK_STORIES = 21;
const MONTHLY_LIMIT = 6;
const ANALYSIS_POLICY = 'atomic-bilingual-edition-v1';
const NEWS_SOURCES = read(path.join(__dirname, 'news-sources.json'), { sources: [] }).sources || [];

const { editorialDay } = newsDay;
const { groupEvents, mergeCoverage } = newsThreads;
const { dueScheduledRows, linkScheduledCandidate, missingScheduledRows, seedScheduledCandidate } = scheduledCandidate;
const { prioritizeCandidates, fallbackImportanceComponents, attentionSignal, commentaryOnlyCandidate } = candidatePriority;
const { calendarScore, standingScore } = analysisEvidence;
const { atomicWriteEdition, withArtifactHash, mondayOf, previousDay, weekendDay } = publicEdition;
const { bilingualFidelityFlags } = bilingualFidelity;
const {
  MAX_MODEL_CALLS,
  beginAttempt,
  candidateSignature,
  dailyLimit,
  dateSpend,
  finishAttempt,
  readAttempts,
  readAccountingAttempts,
  resumeFailedAttempt,
  sameSignatureNoonNoop,
  slotAttempt,
} = attemptContract;

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}
const clean = (value) => String(value || '').trim();
const arr = (value) => (Array.isArray(value) ? value : []);
const clamp = (value, low, high) => Math.max(low, Math.min(high, Math.round(Number(value) || low)));
const sectionOf = (item) => {
  // Classify the article, not the publisher's broad registry beat.
  const text = `${item.title || ''} ${item.dek || ''}`;
  if (/fintech|sistema de pagos|payment system|spei|codi|tarjeta|card fee|banca digital/i.test(text)) return 'payments';
  if (/homicid|violen|c[aá]rtel|narco|crimen|segurid|fentanil|desaparec/i.test(text)) return 'security';
  if (/usmca|t-?mec|arancel|tariff|frontera|border|ustr|deporta|migra|remesa|remittanc/i.test(text)) return 'us-mexico';
  if (/sheinbaum|morena|reforma|congreso|senado|diputad|judicial|corte|elecci|gobernad|constituc/i.test(text)) return 'politics';
  if (/banxico|peso|inflaci|tasa de inter|bono|cetes|mercado|bolsa|bmv|rating|fitch|moody/i.test(text)) return 'money';
  if (/cfe|pemex|electric|energ[ií]a|petr[oó]leo|crudo|gasoduct|pipeline|red el[eé]ct|power grid/i.test(text)) return 'energy';
  if (/inversi[oó]n|investment|adquisici[oó]n|acquisition|financiamiento|financing|planta|factory/i.test(text)) return 'deals';
  return 'economy';
};
const sourceAllowed = (item) => {
  const registered = registeredSourceFor(item, NEWS_SOURCES);
  return Boolean(registered)
    && editorialSourceTier(item.tier)
    && item.source !== 'news.google.com'
    && !/^google news\b|^via gdelt$/i.test(clean(item.sourceName))
    && articleUrlAllowed(registered, item.url)
    && eventCandidateEligible(item, NEWS_SOURCES)
    && mexicoRelevant(`${item.title || ''} ${item.dek || ''}`);
};
const isoWeek = (dt) => {
  const date = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 864e5) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};
const mexicoParts = (date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
}).formatToParts(date).map((part) => [part.type, part.value]));
const slotFor = (date) => {
  const explicit = clean(process.env.PUBLICATION_SLOT);
  if (explicit) return explicit;
  const hour = Number(mexicoParts(date).hour);
  if (hour === 6) return 'morning';
  return '';
};
function emitOutcome(values) {
  const body = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n');
  process.stdout.write(`${body}\n`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${body}\n`);
}
const titleKey = (value) => clean(value).toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, ' ').replace(/\s+/g, ' ');
const storyId = (item) => clean(item._scheduled?.id) || `n-${crypto.createHash('sha1').update(clean(item.url) || clean(item.title)).digest('hex').slice(0, 12)}`;

async function candidateUniverse(now, schedule, editorialDate,
  publishedEditions = editionHistory.loadHistory({ current: read(EDITION_FILE, null) })) {
  const weekStart = mondayOf(editorialDate);
  const allowedStart = weekendDay(editorialDate) ? weekStart : previousDay(editorialDate);
  const registeredHosts = NEWS_SOURCES.flatMap(sourceHosts);
  const provenanceFile = path.join(DATA, 'editorial-source-provenance.json');
  const provenance = fs.existsSync(provenanceFile)
    ? JSON.parse(fs.readFileSync(provenanceFile, 'utf8')) : { schemaVersion: 1, records: [] };
  const publishedUrls = new Set([
    ...editionHistory.publishedArticleUrls(publishedEditions, { through: editorialDate }),
    ...publishedProvenanceUrls(publishedEditions, provenance, { through: editorialDate, registeredHosts }),
  ].map(url => articleIdentity(url, registeredHosts)));
  const files = new Set([
    isoWeek(now),
    isoWeek(new Date(now.getTime() - 7 * 864e5)),
  ]);
  const all = [...files].flatMap((week) => read(path.join(DATA, 'news', `${week}.json`), []))
    .map(item => ({ ...item, title: stripNewsBoilerplate(item.title), dek: stripNewsBoilerplate(item.dek) }));
  const byUrl = new Map();
  for (const item of all) {
    const date = editorialDay(item?.published_at);
    if (!item?.url || !item?.title || !sourceAllowed(item) || date < allowedStart || date > editorialDate) continue;
    // Filter before grouping and the 24-item cap so old lead URLs cannot displace
    // a new follow-up. Required scheduled outcomes remain eligible even on reused URLs.
    if (publishedUrls.has(articleIdentity(item.url, registeredHosts)) && !linkScheduledCandidate(item, schedule, date)?.requiredForBrief) continue;
    if (!byUrl.has(item.url)) byUrl.set(item.url, { ...item, _editorialDate: date });
  }
  const grouped = groupEvents([...byUrl.values()]).map((group) => {
    const item = { ...group.event };
    item._editorialDate = editorialDay(item.published_at);
    item._coverage = mergeCoverage(group.coverage || [], group.members || []);
    item._scheduled = linkScheduledCandidate(item, schedule, item._editorialDate);
    item._section = sectionOf(item);
    return item;
  });
  const allDue = dueScheduledRows(schedule, allowedStart, editorialDate);
  const linkedIds = new Set(grouped.map((item) => item._scheduled?.id).filter(Boolean));
  const due = allDue.filter((row) => !linkedIds.has(row.id));
  const seeded = (await Promise.all(due.map(async (row) => {
    const outcomeUrl = row.outcomeSourceUrl || row.sourceUrl;
    const page = await fetchArticle(outcomeUrl, { allowedHosts: [new URL(outcomeUrl).hostname] });
    const item = page.ok ? seedScheduledCandidate(row, page.text) : null;
    if (item) item._section = sectionOf(item);
    return item;
  }))).filter(Boolean);
  const complete = [...seeded, ...grouped];
  const missingDue = missingScheduledRows(allDue, complete);
  if (missingDue.length) {
    throw new Error(`required scheduled outcome unavailable: ${missingDue.map((row) => row.id).join(', ')}`);
  }
  return prioritizeCandidates(complete, {
    editorialDate,
    weekend: weekendDay(editorialDate),
    dateOf: (item) => item._editorialDate,
  }).slice(0, MAX_CANDIDATES);
}

function rankSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['ranked'], properties: {
      ranked: { type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['i', 'importance'], properties: {
          i: { type: 'integer' }, importance: { type: 'integer' },
        },
      } },
    },
  };
}
// Use the same hard requirements on the initial draft and the bounded repair.
// Otherwise the repair is asked to fix symptoms without knowing the release gate.
const DRAFT_GATE_CONTRACT = `Aim for a 10–14-word English headline, a 25–35-word English dek, and 20–35 English words per analysis field, using one or two short sentences when that is clearer. These are drafting targets below the hard ceilings, not permission to omit material facts or caveats. Every headline must stay within 20 English words and 24 Spanish words. English deks must stay within 45 words and two sentences. Background, view and watch must each stay within 55 English words, 65 Spanish words and three sentences. Do not use semicolons. The allowedNumericValues list is a literal-value checklist, not independent evidence. Copy numeric values and their scale from cited evidence exactly: never round or convert millions into billions, and preserve the same numeric values and scale in Spanish. If cited evidence spells a quantity in words, preserve it in words in both languages; do not convert it to digits. For example, casi un millón stays almost one million / casi un millón. For watch, name a sourced next decision, release or result and the observable test it resolves, using a conditional such as if, whether, until, confirm or weaken where appropriate. Do not substitute background or a request for comment for a next test. Never invent a milestone or condition just to satisfy this requirement. Each field must fit within 600 JSON UTF-8 bytes. Return every requested story as a required s<index> key in the stories object, never an array. If evidence cannot support a field, keep its story key and leave that field empty for rejection.`;

const DAILY_EDITORIAL_CONTRACT = `Use everyday words, direct verbs and short, connected sentences in both languages. Explain necessary technical terms instead of repeating official wording. Keep the background, context, why-it-matters explanation and next step: simplify the wording, not the substance or the sections. Preserve all useful facts, comparisons, attribution and uncertainty. Do not force several ideas into one sentence. Preserve the difference between an official completed action, a proposal and a reported claim. Prefer primary records supplied in the evidence, and name the reporting source or claimant when a primary record is absent. Include the observation period and relevant denominator for numerical comparisons. Background adds necessary context rather than repeating the headline. The view explains a narrow business mechanism or practical limit supported by the evidence, not generic importance. The watch names a sourced observable decision or release and what it would establish. Unsupported substance must remain empty for rejection; never invent a fact to complete the shape.`;

function draftSchema(indices) {
  const refs = { type: 'array', items: { type: 'string' } };
  const translation = {
    type: 'object', additionalProperties: false,
    required: ['headline', 'dek', 'background', 'view', 'watch'],
    properties: Object.fromEntries(['headline', 'dek', 'background', 'view', 'watch']
      .map((field) => [field, { type: 'string' }])),
  };
  const item = {
    type: 'object', additionalProperties: false,
    required: ['headline', 'headlineRefs', 'dek', 'dekRefs', 'background', 'backgroundRefs', 'view', 'viewRefs', 'watch', 'watchRefs', 'es'],
    properties: {
      headline: { type: 'string' }, headlineRefs: refs,
      dek: { type: 'string' }, dekRefs: refs,
      background: { type: 'string' }, backgroundRefs: refs,
      view: { type: 'string' }, viewRefs: refs,
      watch: { type: 'string' }, watchRefs: refs,
      es: translation,
    },
  };
  return {
    type: 'object', additionalProperties: false, required: ['stories'],
    definitions: { story: item },
    properties: { stories: {
      type: 'object', additionalProperties: false,
      required: indices.map(index => `s${index}`),
      properties: Object.fromEntries(indices.map(index => [`s${index}`, { $ref: '#/definitions/story' }])),
    } },
  };
}
function auditSchema(indices) {
  return {
    type: 'object', additionalProperties: false, required: ['reviews'],
    definitions: { review: {
      type: 'object', additionalProperties: false, required: ['ok', 'problems'],
      properties: { ok: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } } },
    } },
    properties: { reviews: {
      type: 'object', additionalProperties: false,
      required: indices.map(index => `s${index}`),
      properties: Object.fromEntries(indices.map(index => [`s${index}`, { $ref: '#/definitions/review' }])),
    } },
  };
}

function keyedUnits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).map(([key, unit]) => ({ ...unit, i: /^s\d+$/.test(key) ? Number(key.slice(1)) : NaN }));
}

function publicationCoverage(rows, locked, editorialDate) {
  const ids = new Set(rows.map(row => row.index));
  return rows.length >= MIN_VISIBLE && rows.length <= MAX_VISIBLE
    && (weekendDay(editorialDate) || rows.some(row => row.item._editorialDate === editorialDate))
    && locked.filter(row => row.item._scheduled).every(row => ids.has(row.index));
}

function removableBudgetRow(rows, editorialDate) {
  for (let index = rows.length - 1; index >= 0; index--) {
    if (rows[index].item._scheduled) continue;
    const remaining = rows.filter((_, i) => i !== index);
    if (publicationCoverage(remaining, rows, editorialDate)) return index;
  }
  return -1;
}

function evidenceRecord({ id, kind, source, url, text }) {
  return shapeEvidenceRecord({ id, kind, source, url, text });
}

async function evidenceFor(item, standing, calendar, memory = []) {
  const registered = registeredSourceFor(item, NEWS_SOURCES);
  const article = await fetchArticle(item.url, {
    allowedHosts: registered ? sourceHosts(registered) : [new URL(item.url).hostname],
  }).catch(() => ({ ok: false, text: '' }));
  const leadEvidence = evidenceRecord({
    id: 'article', kind: article.articleBody ? 'article-body' : 'article', source: item.sourceName || item.source, url: item.url,
    // Whole-page fallbacks may contain navigation, consent text, or unrelated cards.
    // Only an explicitly located story body may add fetched prose to the evidence packet.
    text: (article.articleBody ? [item.title, article.text] : [item.title, item.dek]).filter(Boolean).join('\n'),
  });
  // An overlong verified body is not downgraded to an incomplete RSS excerpt.
  if (!leadEvidence) {
    if (item._scheduled?.requiredForBrief) throw new Error(`Required scheduled article exceeds complete evidence limit: ${item.url}`);
    console.warn(`  skip article exceeding complete evidence limit: ${item.url}`);
    return [];
  }
  const evidence = [leadEvidence];
  const seen = new Set([item.url]);
  const push = (record) => {
    if (!record?.url || seen.has(record.url) || !/^https:\/\//i.test(record.url)) return;
    const shaped = evidenceRecord(record);
    if (!shaped) { seen.add(record.url); return; }
    if (!shaped.text || !shaped.source) return;
    seen.add(record.url);
    evidence.push(shaped);
  };

  // Memory proposes sources to reopen; old synthesized prose is never passed as
  // evidence. Fetch at most two original articles, and only use extracted bodies.
  for (const previous of editionHistory.relatedMemory(item, memory)) {
    const url = previous.sourceUrls.find(value => !seen.has(value));
    if (!url) continue;
    const page = await fetchArticle(url, { allowedHosts: [new URL(url).hostname] })
      .catch(() => ({ ok: false }));
    if (page.ok && page.articleBody) push({
      id: `history:${previous.id}`, kind: 'prior-article-body',
      source: new URL(url).hostname, url,
      text: `Previously covered on ${previous.editionDate}. Original reporting rechecked: ${page.text}`,
    });
  }

  for (const source of arr(item._coverage)) {
    if (evidence.length >= 4) break;
    push({
      id: `coverage:${crypto.createHash('sha1').update(clean(source.url)).digest('hex').slice(0, 8)}`,
      kind: 'coverage', source: source.source || source.sourceName, url: source.url,
      text: `${source.title || ''}\n${source.summary || source.dek || ''}`,
    });
  }
  for (const fact of standing.map((fact) => ({ fact, score: standingScore(item, fact) }))
    .filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 2).map((row) => row.fact)) {
    push({ id: `standing:${fact.id}`, kind: 'standing', source: fact.source, url: fact.url, text: fact.fact });
  }
  for (const event of calendar.map((event) => ({ event, score: calendarScore(item, event) }))
    .filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 1).map((row) => row.event)) {
    push({ id: `calendar:${event.id || event.date}`, kind: 'calendar', source: event.source, url: event.sourceUrl, text: `${event.date}: ${event.label}. ${event.mechanism || ''}` });
  }
  if (item._scheduled) push({
    id: `schedule:${item._scheduled.id}`, kind: 'calendar', source: item._scheduled.source,
    url: item._scheduled.sourceUrl,
    text: `${item._scheduled.date}: ${item._scheduled.label}. This scheduled outcome is required for the Brief.`,
  });
  return evidence.slice(0, 6);
}

function citedInputs(row, refs) {
  const wanted = new Set(arr(refs));
  return row.evidence.filter((item) => wanted.has(item.id)).map((item) => item.text);
}
function validRefs(row, refs) {
  const ids = new Set(row.evidence.map((item) => item.id));
  return arr(refs).length >= 1 && arr(refs).length <= 3 && arr(refs).every((ref) => ids.has(ref));
}

function evidenceReady(row) {
  return row.evidence.length >= 2
    || row.evidence.some((item) => item.id === 'article' && item.kind === 'article-body' && item.url === row.item.url);
}

function sentenceParts(text, locale) {
  return [...new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(clean(text))]
    .map((part) => part.segment.trim()).filter(Boolean);
}

const wordCount = (text) => clean(text).split(/\s+/).filter(Boolean).length;

// A style ceiling must not take down an evidence-safe edition. Remove only complete
// trailing analysis sentences, preserving aligned EN/ES meaning when possible. Never
// shorten headline/dek, never edit a sentence fragment, and never force a one-sentence
// field under the cap; the ordinary gates and independent audit still run afterward.
function repairOverlongAnalysis(draft) {
  const repaired = structuredClone(draft);
  for (const [field, englishCap, spanishCap] of [
    ['background', 55, 65], ['view', 55, 65], ['watch', 55, 65],
  ]) {
    const english = sentenceParts(repaired[field], 'en');
    const spanish = sentenceParts(repaired?.es?.[field], 'es');
    while (english.length > 3 || spanish.length > 3
      || wordCount(english.join(' ')) > englishCap || wordCount(spanish.join(' ')) > spanishCap) {
      if (english.length === spanish.length && english.length > 1) {
        english.pop();
        spanish.pop();
        continue;
      }
      let changed = false;
      if ((english.length > 3 || wordCount(english.join(' ')) > englishCap) && english.length > 1) { english.pop(); changed = true; }
      if ((spanish.length > 3 || wordCount(spanish.join(' ')) > spanishCap) && spanish.length > 1) { spanish.pop(); changed = true; }
      if (!changed) break;
    }
    repaired[field] = english.join(' ').trim();
    repaired.es[field] = spanish.join(' ').trim();
  }
  return repaired;
}

// Unsupported numbers are removed, never guessed or rounded. In the three analysis
// fields only, cite an already-fetched record that supports the number before omitting
// a whole contaminated sentence. Headlines and deks must retain their original strict
// source support because a matching number alone cannot establish their full claim.
// When the translations have the same sentence shape, drop the matching sentence in
// both languages; all deterministic and independent bilingual gates still rerun.
function repairUnsupportedAnalysisNumbers(row, draft) {
  const repaired = structuredClone(draft);
  for (const field of ['background', 'view', 'watch']) {
    const refs = repaired[`${field}Refs`];
    let inputs = citedInputs(row, refs);
    let missing = unsupportedNumericTokens(`${repaired[field]} ${repaired?.es?.[field]}`, inputs);
    // If another already-retrieved, topically matched record contains the number,
    // cite that record before deleting prose. This repairs the citation, not the fact.
    for (const evidence of row.evidence) {
      if (!missing.length || refs.length >= 3 || refs.includes(evidence.id)) continue;
      const next = unsupportedNumericTokens(missing.join(' '), [evidence.text]);
      if (next.length >= missing.length) continue;
      refs.push(evidence.id);
      inputs = citedInputs(row, refs);
      missing = unsupportedNumericTokens(`${repaired[field]} ${repaired?.es?.[field]}`, inputs);
    }
    const english = sentenceParts(repaired[field], 'en');
    const spanish = sentenceParts(repaired?.es?.[field], 'es');
    const badEnglish = new Set(english.flatMap((sentence, index) => (
      unsupportedNumericTokens(sentence, inputs).length ? [index] : []
    )));
    const badSpanish = new Set(spanish.flatMap((sentence, index) => (
      unsupportedNumericTokens(sentence, inputs).length ? [index] : []
    )));
    if (!badEnglish.size && !badSpanish.size) continue;
    if (english.length === spanish.length) {
      const rejected = new Set([...badEnglish, ...badSpanish]);
      repaired[field] = english.filter((_, index) => !rejected.has(index)).join(' ').trim();
      repaired.es[field] = spanish.filter((_, index) => !rejected.has(index)).join(' ').trim();
    } else {
      repaired[field] = english.filter((_, index) => !badEnglish.has(index)).join(' ').trim();
      repaired.es[field] = spanish.filter((_, index) => !badSpanish.has(index)).join(' ').trim();
    }
  }
  return repaired;
}

// Failure receipts retain model output only, never evidence text or fetched article
// bodies. Keeping the failed EN/ES field and its evidence IDs makes a bilingual gate
// reviewable without confusing a rejected draft with public, approved copy.
function draftFailureReceipt(row, draft, flags, stage = 'deterministic') {
  const fields = {};
  for (const field of ['headline', 'dek', 'background', 'view', 'watch']) {
    const reasons = flags.filter((flag) => String(flag).startsWith(`${field}:`));
    if (!reasons.length && stage === 'deterministic') continue;
    fields[field] = {
      en: clean(draft?.[field]).slice(0, 600),
      es: clean(draft?.es?.[field]).slice(0, 600),
      refs: arr(draft?.[`${field}Refs`]).map(clean).filter(Boolean).slice(0, 3),
      reasons: reasons.map((reason) => String(reason).slice(field.length + 1).trim()).slice(0, 12),
    };
  }
  return {
    stage, storyId: storyId(row.item),
    reasons: flags.filter((flag) => !Object.keys(fields).some((field) => String(flag).startsWith(`${field}:`)))
      .map((reason) => String(reason).slice(0, 500)).slice(0, 12),
    fields,
  };
}

function deterministicDraftCheck(row, draft) {
  const flags = [];
  const checks = [
    ['headline', 'headlineRefs', 20, 1, 'report'],
    ['dek', 'dekRefs', 45, 2, 'report'],
    ['background', 'backgroundRefs', 55, 3, 'background'],
    ['view', 'viewRefs', 55, 3, 'view'],
    ['watch', 'watchRefs', 55, 3, 'prediction'],
  ];
  for (const [field, refField, maxWords, maxSentences, role] of checks) {
    if (!validRefs(row, draft[refField])) { flags.push(`${field}: invalid evidence references`); continue; }
    const inputs = citedInputs(row, draft[refField]);
    if ([draft[field], draft?.es?.[field]].some((text) => new TextEncoder().encode(JSON.stringify(clean(text))).byteLength > 600)) {
      flags.push(`${field}: exceeds the bounded audit field length`);
    }
    const result = role === 'report'
      ? lintReportText({ text: draft[field], inputs, maxWords, maxSentences })
      : lintAnalysisText({
        text: draft[field], inputs, role, maxWords, maxSentences,
        requireScale: false, strictForecast: role === 'prediction', forbidFirstPerson: true,
      });
    if (!result.ok) flags.push(...result.flags.map((flag) => `${field}: ${flag}`));
    const spanish = draft?.es?.[field];
    if (!clean(spanish)) {
      flags.push(`${field}: Spanish translation is empty`);
      continue;
    }
    // The public artifact cannot carry source prose. Apply its evidence-free
    // actor/meaning check here too, before spending on the independent audit.
    const fidelityFlags = new Set([
      ...bilingualFidelityFlags({ english: draft[field], spanish, evidence: inputs }),
      ...bilingualFidelityFlags({ english: draft[field], spanish }),
    ]);
    for (const flag of fidelityFlags) {
      flags.push(`${field}: ${flag}`);
    }
    const spanishEvidence = lintReportText({
      text: spanish, inputs, maxWords: field === 'headline' ? 24 : 65,
      maxSentences: field === 'headline' ? 1 : 3,
    });
    if (!spanishEvidence.ok) flags.push(...spanishEvidence.flags.map((flag) => `${field}: Spanish ${flag}`));
  }
  if (clean(draft.headline) && clean(draft.dek) && !reportContextDistinct({ headline: draft.headline, context: draft.dek })) {
    flags.push('dek: repeats the headline without adding context');
  }
  const hasIndependentEvidence = row.evidence.some((item) => item.id !== 'article');
  if (hasIndependentEvidence && !arr(draft.backgroundRefs).some((ref) => ref !== 'article')) {
    flags.push('background: needs an independent source when one is available');
  }
  return [...new Set(flags)];
}

function publicEvidence(row) {
  return row.evidence.map(({ id, kind, source, url }) => ({ id, kind, source, url }));
}
function makeStory(row, draft, editorialDate, weekend) {
  const translation = draft.es;
  for (const field of ['headline', 'dek', 'background', 'view', 'watch']) {
    if (!clean(translation?.[field])) throw new Error(`${row.item.id}: Spanish ${field} is empty`);
    const narrativeErrors = [
      ...validateNarrativeText(draft[field]),
      ...validateNarrativeText(translation[field]),
    ];
    const fidelityErrors = bilingualFidelityFlags({
      english: draft[field], spanish: translation[field], evidence: citedInputs(row, draft[`${field}Refs`]),
    });
    const errors = [...narrativeErrors, ...fidelityErrors];
    if (errors.length) throw new Error(`${row.item.id}: ${field} bilingual gate: ${[...new Set(errors)].join('; ')}`);
  }
  const date = row.item._editorialDate;
  return {
    id: storyId(row.item), date,
    lane: weekend ? ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay()) ? 'weekend' : 'week-recap')
      : (date === editorialDate ? 'today' : 'key-development'),
    section: row.item._section,
    source: plainSourceName(row.item.sourceName || row.item.source),
    url: row.item.url,
    publishedAt: row.item.published_at,
    evidence: publicEvidence(row),
    evidenceRefs: {
      headline: draft.headlineRefs, dek: draft.dekRefs, background: draft.backgroundRefs,
      view: draft.viewRefs, watch: draft.watchRefs,
    },
    en: { headline: draft.headline, dek: draft.dek, background: draft.background, view: draft.view, watch: draft.watch },
    es: { headline: translation.headline, dek: translation.dek, background: translation.background, view: translation.view, watch: translation.watch },
  };
}

function weekStory(story) {
  return {
    id: story.id,
    date: story.date,
    section: story.section,
    source: story.source,
    url: story.url,
    publishedAt: story.publishedAt,
    en: { headline: story.en.headline, dek: story.en.dek },
    es: { headline: story.es.headline, dek: story.es.dek },
  };
}

function buildWeekStories(priorEdition, stories, editorialDate) {
  const start = mondayOf(editorialDate);
  const prior = arr(priorEdition?.weekStories).filter((story) => story?.date >= start && story?.date <= editorialDate);
  const current = stories.map(weekStory);
  const seen = new Set();
  const kept = [];
  for (const story of [...current, ...prior]) {
    if (!story?.id || !story?.url || seen.has(story.id) || seen.has(story.url)) continue;
    seen.add(story.id);
    seen.add(story.url);
    kept.push(story);
  }
  return kept.sort((left, right) => String(right.publishedAt).localeCompare(String(left.publishedAt)))
    .slice(0, MAX_WEEK_STORIES);
}

function buildWeeklyBrief(stories, editorialDate) {
  const start = mondayOf(editorialDate);
  return {
    start,
    through: editorialDate,
    en: {
      overview: stories.length === 1 ? clean(stories[0]?.en?.dek) : `${stories.length} developments shaping business decisions in Mexico this week.`,
      method: `Ranked by business relevance and urgency. Coverage through ${new Date(`${editorialDate}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' })}.`,
    },
    es: {
      overview: stories.length === 1 ? clean(stories[0]?.es?.dek) : `${stories.length} acontecimientos que influyen en las decisiones empresariales en México esta semana.`,
      method: `Ordenados por relevancia empresarial y urgencia. Información al ${new Date(`${editorialDate}T12:00:00Z`).toLocaleDateString('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'long' })}.`,
    },
    items: stories.map((story) => ({
      id: story.id,
      showThread: false,
      sources: story.evidence.map(({ id, kind, source, url }) => ({ id, kind, source, url })),
      en: {
        headline: story.en.headline,
        change: story.en.dek,
        context: `${story.en.background} ${story.en.view}`.trim(),
        reason: story.en.view,
        before: '',
        now: '',
        margin: story.en.watch,
      },
      es: {
        headline: story.es.headline,
        change: story.es.dek,
        context: `${story.es.background} ${story.es.view}`.trim(),
        reason: story.es.view,
        before: '',
        now: '',
        margin: story.es.watch,
      },
    })),
    dates: [],
  };
}

async function main() {
  requirePublicationRequest();
  const now = new Date(process.env.EDITION_NOW_ISO || Date.now());
  if (!Number.isFinite(now.getTime())) throw new Error('EDITION_NOW_ISO is invalid');
  const editorialDate = clean(process.env.PUBLICATION_DATE) || editorialDay(now);
  const slot = slotFor(now);
  if (!slot) {
    console.log('edition: outside the 9am/noon Eastern publication windows, zero model calls');
    emitOutcome({ state: 'noop', editorial_date: editorialDate, slot: 'none', artifact_hash: '' });
    return;
  }
  if (!['morning', 'noon'].includes(slot)) throw new Error(`invalid publication slot: ${slot}`);
  if (process.env.EDITION_REQUIRE_REVIEW === '1' && weekendDay(editorialDate) && process.env.EDITION_WEEKEND_RECOVERY !== '1') {
    console.log(`edition: ${editorialDate}/${slot} is a pilot weekend no-op, zero model calls`);
    emitOutcome({ state: 'noop', editorial_date: editorialDate, slot, artifact_hash: '' });
    return;
  }
  const priorEdition = read(EDITION_FILE, null);
  const publishedEditions = editionHistory.loadHistory({ current: priorEdition });
  const memory = editionHistory.issueMemory(publishedEditions, { before: editorialDate });
  if (process.env.GITHUB_ACTIONS === 'true' && editorialDate !== editorialDay(new Date())) {
    throw new Error('Paid CI publication must use the current editorial day');
  }
  process.env.LLM_BUDGET_DATE = process.env.GITHUB_ACTIONS === 'true'
    ? new Date().toISOString() : `${editorialDate}T12:00:00Z`;

  let attempts = readAccountingAttempts(JSON.parse(fs.readFileSync(ATTEMPTS_FILE, 'utf8')));
  const priorSlotAttempt = slotAttempt(attempts, editorialDate, slot);
  const isRecovery = process.env.EDITION_RETRY_FAILED === '1';
  if (priorSlotAttempt && !isRecovery) {
    // A rerun must not turn an unresolved failure green without doing any work.
    // Keep the zero-call guard and require the existing bounded recovery switch.
    if (['failed', 'started'].includes(priorSlotAttempt.state)) {
      emitOutcome({ state: 'failed', editorial_date: editorialDate, slot, artifact_hash: '' });
      throw new Error(`edition: ${editorialDate}/${slot} remains ${priorSlotAttempt.state}; use explicit failed-attempt recovery after diagnosis`);
    }
    console.log(`edition: ${editorialDate}/${slot} already attempted, zero model calls`);
    emitOutcome({ state: 'noop', editorial_date: editorialDate, slot, artifact_hash: '' });
    return;
  }
  if (isRecovery && (!priorSlotAttempt || priorSlotAttempt.state !== 'failed')) {
    throw new Error(`explicit recovery requires a failed attempt: ${editorialDate}/${slot}`);
  }
  const recoveryBase = isRecovery ? { calls: Number(priorSlotAttempt.calls) || 0, costUSD: Number(priorSlotAttempt.costUSD) || 0 } : { calls: 0, costUSD: 0 };
  if (isRecovery) {
    attempts = resumeFailedAttempt(attempts, { editorialDate, slot, startedAt: now.toISOString() });
    write(ATTEMPTS_FILE, attempts);
  }

  if (isRecovery && priorSlotAttempt.heldEdition !== undefined) {
    try {
      const held = restoreHeldEdition({ attempts, dataDirectory: DATA, date: editorialDate, slot, now, minStories: MIN_VISIBLE, maxStories: MAX_VISIBLE });
      attempts = finishAttempt(attempts, editorialDate, slot, {
        state: 'published', completedAt: new Date().toISOString(), artifactHash: held.artifactHash,
        reason: 'Restored the exact audited edition for full release revalidation; zero model calls',
      });
      write(ATTEMPTS_FILE, attempts);
      emitOutcome({ state: 'published', editorial_date: editorialDate, slot, artifact_hash: held.artifactHash });
      return;
    } catch (error) {
      attempts = finishAttempt(attempts, editorialDate, slot, {
        state: 'failed', completedAt: new Date().toISOString(), reason: `Held edition recovery failed: ${clean(error.message)}`,
      });
      write(ATTEMPTS_FILE, attempts);
      emitOutcome({ state: 'failed', editorial_date: editorialDate, slot, artifact_hash: '' });
      throw error;
    }
  }

  let schedule;
  let universe;
  let signature;
  let collectionReceipt = null;
  try {
    if (process.env.EDITION_SKIP_COLLECTION !== '1') collectionReceipt = await collectNews({ now });
    schedule = read(path.join(DATA, 'events.json'), { events: [] });
    universe = await candidateUniverse(now, schedule, editorialDate, publishedEditions);
    signature = candidateSignature(universe);
  } catch (error) {
    if (!isRecovery) attempts = beginAttempt(attempts, {
      editorialDate, slot, candidateSignature: '0'.repeat(64), startedAt: now.toISOString(),
    });
    attempts = finishAttempt(attempts, editorialDate, slot, {
      state: 'failed', completedAt: new Date().toISOString(), calls: recoveryBase.calls, costUSD: recoveryBase.costUSD,
      reason: `collection failed: ${clean(error?.message).slice(0, 460)}`,
      collection: collectionReceipt || error?.collection || null,
    });
    write(ATTEMPTS_FILE, attempts);
    emitOutcome({ state: 'failed', editorial_date: editorialDate, slot, artifact_hash: '' });
    throw error;
  }

  if (slot === 'noon' && sameSignatureNoonNoop(attempts, editorialDate, signature, priorEdition?.artifactHash)) {
    attempts = beginAttempt(attempts, { editorialDate, slot, candidateSignature: signature, startedAt: now.toISOString() });
    attempts = finishAttempt(attempts, editorialDate, slot, {
      state: 'noop-same-signature', completedAt: now.toISOString(), reason: 'no new eligible reporting since morning',
      collection: collectionReceipt,
    });
    write(ATTEMPTS_FILE, attempts);
    console.log(`edition: ${editorialDate}/${slot} has the morning signature, zero model calls`);
    emitOutcome({ state: 'noop', editorial_date: editorialDate, slot, artifact_hash: '' });
    return;
  }

  if (!isRecovery) attempts = beginAttempt(attempts, { editorialDate, slot, candidateSignature: signature, startedAt: now.toISOString() });
  if (collectionReceipt) attempts = finishAttempt(attempts, editorialDate, slot, { collection: collectionReceipt });
  write(ATTEMPTS_FILE, attempts);
  let callCount = 0;
  let modelUsage = { calls: 0, costUSD: 0 };
  // Preserve the complete deterministic rejection evidence in the attempt ledger.
  // The short reason remains suitable for the commit subject and workflow summary.
  let failureDiagnostics = [];
  let quarantine = null;
  let quarantineStage = 'independent-audit';
  try {
    if (!universe.length) throw new Error('no eligible candidates');
    const { askJSON, hasLLM, models, usage, budgetStatus } = await import('./lib/anthropic.js');
    if (!hasLLM()) throw new Error('ANTHROPIC_API_KEY is missing');
    const priorDailySpend = dateSpend(attempts, editorialDate);
    const dayLimit = dailyLimit(editorialDate, MONTHLY_LIMIT);
    const call = async (request) => {
      requirePublicationRequest();
      // Bill each call in its actual UTC month, including a run crossing midnight.
      if (process.env.GITHUB_ACTIONS === 'true') process.env.LLM_BUDGET_DATE = new Date().toISOString();
      if (callCount >= MAX_MODEL_CALLS) throw new Error(`model call limit ${MAX_MODEL_CALLS} reached`);
      const inputBytes = new TextEncoder().encode(JSON.stringify({ system: request.system, user: request.user, schema: request.schema })).byteLength + 1536;
      const spent = priorDailySpend + (Number(usage().costUSD) || 0);
      const reservedAuditUSD = Number(request.reserveUSD) || 0;
      const monthlyRemaining = budgetStatus('core').pacedRemainingUSD;
      let selectedModel = request.model || models.HAIKU;
      const estimate = (model) => {
        const rates = model === models.SONNET ? { input: 3, output: 15 } : { input: 1, output: 5 };
        return (inputBytes * rates.input + (Number(request.maxTokens) || 0) * rates.output) / 1e6;
      };
      // Prefer the stronger evidence writer only when its maximum bill fits.
      // The mechanical writer remains subject to the exact same evidence/audit gates.
      if (selectedModel === models.SONNET && (spent + estimate(selectedModel) + reservedAuditUSD > dayLimit || estimate(selectedModel) + reservedAuditUSD > monthlyRemaining)) {
        selectedModel = models.HAIKU;
        console.warn('  daily budget: using bounded mechanical drafting with full evidence gates');
      }
      const projected = estimate(selectedModel);
      if (spent + projected + reservedAuditUSD > dayLimit || projected + reservedAuditUSD > monthlyRemaining) {
        if (request.optionalOnBudget) return null;
        throw new Error(`daily model budget would be exceeded (${spent.toFixed(4)} + ${projected.toFixed(4)} > ${dayLimit.toFixed(4)})`);
      }
      callCount += 1;
      const result = await askJSON({
        ...request, model: selectedModel, priority: 'core',
        maxCostUSD: Math.min(dayLimit - spent, monthlyRemaining) - reservedAuditUSD,
        onAccounting: async (receipt) => {
          const row = slotAttempt(attempts, editorialDate, slot);
          const receipts = [...(row.modelAccounting?.receipts || [])];
          const index = receipts.findIndex(item => item.id === receipt.id);
          if (index < 0) receipts.push(receipt); else receipts[index] = receipt;
          attempts = finishAttempt(attempts, editorialDate, slot, {
            calls: recoveryBase.calls + usage().calls,
            costUSD: Math.round((recoveryBase.costUSD + usage().costUSD) * 1e6) / 1e6,
            modelAccounting: { version: 1, runId: process.env.GITHUB_RUN_ID || 'local', runAttempt: process.env.GITHUB_RUN_ATTEMPT || '1', receipts },
          });
          write(ATTEMPTS_FILE, attempts);
          if (process.env.GITHUB_ACTIONS === 'true') persistModelAccounting({ cwd: ROOT });
          // A slow accounting push must not let a request expire before fetch.
          // Settlement remains allowed after expiry so verified usage is retained.
          if (receipt.state === 'reserved') requirePublicationRequest();
        },
      });
      if (!result && !request.optionalOnBudget) throw new Error(`model call ${callCount} returned no usable result`);
      return result;
    };

    // Candidate priority already combines recency, source trust, scheduled outcomes,
    // and business consequence. Keeping ranking deterministic reserves one of the
    // three bounded model calls for a repair pass when the first draft fails.
    // No replacement happens after drafting: evidence filtering locks this ranked pool.
    const rankedPool = universe.map((item, index) => ({
      index, item,
      importance: clamp(item._scheduled?.importanceFloor
        || Object.values(fallbackImportanceComponents(item)).reduce((sum, value) => sum + value, 0), 1, 10),
    })).filter(row => row.item._scheduled || (attentionSignal(row.item) >= 0 && !commentaryOnlyCandidate(row.item)))
      .sort((a, b) => Number(Boolean(b.item._scheduled)) - Number(Boolean(a.item._scheduled))
        || (!weekendDay(editorialDate) && (Number(b.item._editorialDate === editorialDate) - Number(a.item._editorialDate === editorialDate)))
        || b.importance - a.importance || a.index - b.index)
      .slice(0, MAX_RANKED);
    if (!rankedPool.length) throw new Error('ranking selected no developments');
    if (!weekendDay(editorialDate) && !rankedPool.some((row) => row.item._editorialDate === editorialDate)) {
      throw new Error('ranking selected no exact-day development');
    }

    const standing = arr(read(path.join(DATA, 'standing.json'), { facts: [] }).facts);
    const calendar = arr(schedule.events).filter((event) => event?.date >= previousDay(editorialDate));
    const evidenceRows = await Promise.all(rankedPool.map(async (row) => ({
      ...row, evidence: await evidenceFor(row.item, standing, calendar, memory),
    })));
    const withoutContext = evidenceRows.filter((row) => !evidenceReady(row));
    for (const row of withoutContext) {
      console.warn(`  skip ranked story without usable evidence: ${storyId(row.item)} | ${plainSourceName(row.item.sourceName || row.item.source)} | ${clean(row.item.title).slice(0, 120)}`);
    }
    let locked = evidenceRows.filter(evidenceReady).slice(0, MAX_VISIBLE);
    if (locked.length < MIN_VISIBLE) throw new Error(`only ${locked.length} strong sourced developments available; need at least ${MIN_VISIBLE} without padding`);
    if (!weekendDay(editorialDate) && !locked.some((row) => row.item._editorialDate === editorialDate)) {
      throw new Error(`no ranked exact-day development has enough evidence for Briefly Explained: ${withoutContext.map((row) => storyId(row.item)).join(', ').slice(0, 300)}`);
    }

    // Reserve the mandatory Haiku audit before spending on writing/repair. Evidence
    // is sent once per row, and the deterministic 600-byte JSON-field ceiling bounds
    // both languages. Extra bytes cover refs, JSON framing and the audit instruction.
    const auditReservation = rows => {
      const bytes = new TextEncoder().encode(JSON.stringify(rows.map(row => row.evidence))).byteLength;
      return (bytes + rows.length * 5 * 2 * 600 + 8192) / 1e6 + 2400 * 5 / 1e6;
    };
    const draftRequest = (rows) => ({
      system: `${DRAFT_GATE_CONTRACT}\n\n${DAILY_EDITORIAL_CONTRACT}\n\n${TRUST}\n\n${SEAM}\n\n${EARNED_LINE}\n\n${BAN}\n\n${REPORT}\n\nWrite one complete English story unit for every input and a faithful Mexican-Spanish translation of all five fields. Use only the evidence strings inside that same input. Cite every field with 1-3 exact evidence ids. Before returning, verify every headline is at most 20 English words and 24 Spanish words, every dek is at most two sentences, every analysis field is at most three sentences, no field uses a semicolon, and every number appears in its cited evidence. Headline: shortest accurate account. Dek: one additional sourced fact or comparison. Background: explain a supported connection to earlier developments when prior-article-body evidence is present, otherwise supply only the context needed to understand this change. Never imply earlier MexicoBrief coverage unless a prior source was actually retrieved. If evidence other than article is supplied, background must cite at least one such independent source; otherwise a verified article-body may support it. Our view: a narrow business implication supported by its citations, naming the affected kind of business where the evidence permits, without first person. Do not convert activity into demand, investment pledges into completed investment, or proposals into rules in force. Multiple articles may repeat one source; never imply independent confirmation from source count. Watch: the next observable decision, release, or result and what would confirm or weaken the view. Spanish must preserve every actor, action direction, number, date, caveat, procedural stage, and degree of certainty. Never narrate the prompt, labels, or evidence. Return an item even when evidence is thin; use an empty field so code rejects it.`,
      user: JSON.stringify(rows.map((row) => ({
        i: row.index,
        allowedNumericValues: unsupportedNumericTokens(row.evidence.map((item) => item.text).join(' ')),
        story: { date: row.item._editorialDate, source: row.item.sourceName || row.item.source, url: row.item.url },
        evidence: row.evidence.map(({ id, kind, source, url, text }) => ({ id, kind, source, url, text })),
        ...(isRecovery ? { previousRejection: arr(priorSlotAttempt.diagnostics).find((item) => item.storyId === storyId(row.item)) || null } : {}),
      }))),
      schema: draftSchema(rows.map((row) => row.index)), model: models.SONNET, effort: 'low', maxTokens: rows.length * 1300 + 100, reserveUSD: auditReservation(rows),
    });
    // Prefer three complete stories with the stronger writer over a five-story
    // batch that would force a cheaper writer. A larger edition is used when its
    // maximum writing bill plus the mandatory audit fits the unchanged allowance.
    const availableForEdition = Math.min(dayLimit - priorDailySpend, budgetStatus('core').pacedRemainingUSD);
    while (locked.length > MIN_VISIBLE) {
      const request = draftRequest(locked);
      const bytes = new TextEncoder().encode(JSON.stringify({system:request.system,user:request.user,schema:request.schema})).byteLength + 1536;
      const maximum = (bytes * 3 + request.maxTokens * 15) / 1e6 + request.reserveUSD;
      if (maximum <= availableForEdition) break;
      const removable = removableBudgetRow(locked, editorialDate);
      if (removable < 0) break;
      locked = locked.filter((_, index) => index !== removable);
    }
    const reservedAuditUSD = auditReservation(locked);
    const diagnosticRows = response => {
      const byIndex = new Map(keyedUnits(response?.stories).map(draft => [Number(draft.i), draft]));
      return locked.map(row => ({ index: row.index, storyId: storyId(row.item),
        draft: byIndex.get(row.index) || null, evidence: row.evidence }));
    };
    const captureGeneration = (stage, response, details = {}) => {
      try {
        if (!quarantine) quarantine = createEditionQuarantine({
          repositoryRoot: ROOT, directory: process.env.EDITION_QUARANTINE_DIRECTORY,
          metadata: { editorialDate, slot, candidateSignature: signature, generatedAt: now.toISOString(),
            workflowRunId: process.env.GITHUB_RUN_ID || null,
            workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
            workflowHeadSha: process.env.GITHUB_SHA || null,
            priorArtifactHash: priorEdition?.artifactHash || null },
        });
        quarantine.recordGeneration(stage, diagnosticRows(response), { response, ...details,
          modelAccounting: slotAttempt(attempts, editorialDate, slot).modelAccounting || null });
        emitOutcome({ quarantine_ready: 'true' });
      } catch (preservationError) {
        console.warn(`Optional edition diagnostics unavailable: ${clean(preservationError.message)}`);
      }
    };
    quarantineStage = 'initial-draft';
    let draftResponse = await call(draftRequest(locked));
    captureGeneration('initial-draft', draftResponse);
    const expectedDrafts = new Set(locked.map((row) => row.index));
    const evaluateDrafts = (response, patchErrors = {}) => {
      const draftRejects = [];
      const rejectionDiagnostics = [];
      const draftByIndex = new Map();
      for (const draft of keyedUnits(response.stories)) {
        const index = Number(draft?.i);
        if (!expectedDrafts.has(index)) { draftRejects.push(`unexpected draft index ${Number.isFinite(index) ? index : '?'}`); continue; }
        if (draftByIndex.has(index)) { draftRejects.push(`duplicate draft index ${index}`); continue; }
        draftByIndex.set(index, draft);
      }
      const deterministicPass = locked.flatMap((row) => {
        const rawDraft = draftByIndex.get(row.index);
        if (!rawDraft) {
          const reason = `${storyId(row.item)}: model omitted the required story unit`;
          draftRejects.push(reason);
          rejectionDiagnostics.push({ stage: 'deterministic', storyId: storyId(row.item), reasons: ['model omitted the required story unit'], fields: {} });
          return [];
        }
        const draft = repairOverlongAnalysis(repairUnsupportedAnalysisNumbers(row, rawDraft));
        draftByIndex.set(row.index, draft);
        const flags = [...deterministicDraftCheck(row, draft), ...(patchErrors[row.index] || [])];
        if (flags.length) {
          draftRejects.push(`${storyId(row.item)}: ${flags.join('; ')}`);
          rejectionDiagnostics.push(draftFailureReceipt(row, draft, flags));
          return [];
        }
        return [{ row, draft }];
      });
      return { deterministicPass, draftRejects, rejectionDiagnostics, draftByIndex };
    };
    let evaluated = evaluateDrafts(draftResponse);
    captureGeneration('initial-deterministic-result', draftResponse, { rejections: evaluated.rejectionDiagnostics });
    quarantineStage = 'deterministic-repair';
    if (evaluated.rejectionDiagnostics.length && callCount < MAX_MODEL_CALLS - 1) {
      const passingIndices = new Set(evaluated.deterministicPass.map(entry => entry.row.index));
      const rejectedRows = locked.filter(row => !passingIndices.has(row.index));
      console.warn('  repairing only missing or rejected story units within the existing call budget');
      const repairPlan = createFieldRepairPlan(rejectedRows.map(row => ({
        index: row.index, evidence: row.evidence, draft: evaluated.draftByIndex.get(row.index),
        rejection: evaluated.rejectionDiagnostics.find(item => item.storyId === storyId(row.item)),
      })));
      const patchResponse = await call({
        optionalOnBudget: publicationCoverage(evaluated.deterministicPass.map(entry => entry.row), locked, editorialDate),
        system: `${DRAFT_GATE_CONTRACT}\n\n${DAILY_EDITORIAL_CONTRACT}\n\n${TRUST}\n\n${REPORT}\n\nRepair only the named bilingual fields. Return repairs keyed by s<index>, containing only the requested field names, each with en, es and refs. Use only that story's evidence and exact evidence IDs. Preserved fields are context and must not be returned or changed. Keep every number, actor, action, date, procedural stage and certainty supported. If a requested next step has no source support, leave its text empty for rejection rather than inventing one.`,
        user: JSON.stringify(repairPlan.inputs), schema: repairPlan.schema,
        model: models.SONNET, effort: 'low', maxTokens: repairPlan.maxTokens, reserveUSD: reservedAuditUSD,
      });
      const merged = mergeFieldRepairs(repairPlan, patchResponse);
      draftResponse = { stories: {
        ...Object.fromEntries(evaluated.deterministicPass.map(entry => [`s${entry.row.index}`, entry.draft])),
        ...merged.stories,
      } };
      captureGeneration('field-repair-response', draftResponse, { patchResponse, patchErrors: merged.errorsByIndex });
      evaluated = evaluateDrafts(draftResponse, merged.errorsByIndex);
    }
    captureGeneration('final-deterministic-result', draftResponse, { rejections: evaluated.rejectionDiagnostics });
    const { deterministicPass, draftRejects, rejectionDiagnostics } = evaluated;
    if (!deterministicPass.length) {
      failureDiagnostics = rejectionDiagnostics;
      throw new Error(`all story drafts failed the deterministic evidence gate: ${draftRejects.join(' | ').slice(0, 330)}`);
    }

    if (!publicationCoverage(deterministicPass.map(entry => entry.row), locked, editorialDate)) {
      failureDiagnostics = rejectionDiagnostics;
      throw new Error(`drafts cannot meet the ${MIN_VISIBLE}–${MAX_VISIBLE} story, exact-day and scheduled-outcome requirements; refusing an unusable paid audit`);
    }

    const auditInputs = deterministicPass.map(({ row, draft }) => ({
      i: row.index,
      evidence: row.evidence.map(({ id, text }) => ({ id, text })),
      fields: Object.fromEntries(['headline', 'dek', 'background', 'view', 'watch'].map((field) => [field, {
        english: draft[field], spanish: draft.es[field],
        evidenceRefs: draft[`${field}Refs`],
      }])),
    }));
    quarantineStage = 'independent-audit';
    const auditResponse = await call({
      system: `You are the final independent evidence and bilingual editor. Review each English field only against the records identified by its evidenceRefs in that input’s evidence list. Independently compare its Spanish translation with both the English field and the same cited evidence. Reject unsupported actors, numbers, comparisons, causal claims, procedural stages, predictions, non sequiturs, mistranslations, reversed actions, changed subjects, or changed degrees of certainty in either language. Do not reject a clearly labeled narrow inference merely for being an inference. Do not rewrite either language. Return a reviews object with one required s<index> verdict for every input index, never an array.`,
      user: JSON.stringify(auditInputs),
      schema: auditSchema(deterministicPass.map(entry => entry.row.index)), maxTokens: 2400,
    });
    try {
      const auditedDrafts = deterministicPass.map(({ row, draft }) => ({
        index: row.index, storyId: storyId(row.item), draft, evidence: row.evidence,
      }));
      if (quarantine) quarantine.recordAudit({ inputs: auditInputs, response: auditResponse }, auditedDrafts);
      else quarantine = createEditionQuarantine({
        repositoryRoot: ROOT, directory: process.env.EDITION_QUARANTINE_DIRECTORY,
        metadata: { editorialDate, slot, candidateSignature: signature, generatedAt: now.toISOString(),
          workflowRunId: process.env.GITHUB_RUN_ID || null,
          workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
          workflowHeadSha: process.env.GITHUB_SHA || null,
          priorArtifactHash: priorEdition?.artifactHash || null },
        drafts: auditedDrafts, audit: { inputs: auditInputs, response: auditResponse },
      });
      emitOutcome({ quarantine_ready: 'true' });
    } catch (preservationError) {
      console.warn(`Optional edition diagnostics unavailable: ${clean(preservationError.message)}`);
    }
    quarantineStage = 'audited-draft-assembly';
    const reviews = new Map(keyedUnits(auditResponse.reviews).map((review) => [Number(review.i), review]));
    const passing = [];
    for (const entry of deterministicPass) {
      const review = reviews.get(entry.row.index);
      if (!review?.ok) {
        const reasons = arr(review?.problems).map(clean).filter(Boolean);
        failureDiagnostics.push(draftFailureReceipt(entry.row, entry.draft,
          reasons.length ? reasons : ['missing review'], 'independent-audit'));
        console.warn(`  reject audit ${storyId(entry.row.item)}: ${reasons.join('; ') || 'missing review'}`);
        continue;
      }
      passing.push(makeStory(entry.row, entry.draft, editorialDate, weekendDay(editorialDate)));
      if (passing.length === MAX_VISIBLE) break;
    }
    const selectedScheduled = locked.filter((row) => row.item._scheduled).map((row) => storyId(row.item));
    const passingIds = new Set(passing.map((story) => story.id));
    if (selectedScheduled.some((id) => !passingIds.has(id))) throw new Error('a required scheduled outcome failed the edition gate');
    if (!passing.length) throw new Error('all selected stories failed the independent evidence audit');
    if (passing.length < MIN_VISIBLE) throw new Error(`only ${passing.length} stories passed every editorial gate; need at least ${MIN_VISIBLE} without padding`);
    if (!weekendDay(editorialDate) && !passing.some((story) => story.date === editorialDate)) {
      throw new Error('no exact-day story survived the edition gate');
    }

    const target = reviewGate.publicationTarget({
      dataDirectory: DATA, editorialDate, slot, requireReview: process.env.EDITION_REQUIRE_REVIEW === '1',
    });
    const candidate = withArtifactHash({
      schemaVersion: 1,
      editorialDate,
      generatedAt: now.toISOString(),
      slot,
      editionType: weekendDay(editorialDate) ? 'weekend-recap' : 'daily',
      candidateSignature: signature,
      ...(target.publicationStatus ? { publicationStatus: target.publicationStatus } : {}),
      summary: { en: passing.map((story) => story.en.dek).join(' '), es: passing.map((story) => story.es.dek).join(' ') },
      stories: passing,
      weekStories: buildWeekStories(priorEdition, passing, editorialDate),
      weeklyBrief: buildWeeklyBrief(passing, editorialDate),
    });
    quarantineStage = 'final-artifact-validation';
    if (quarantine) {
      try { quarantine.recordCandidate(candidate); }
      catch (preservationError) {
        console.warn(`Could not save optional edition candidate diagnostics: ${clean(preservationError.message)}`);
      }
    }
    const edition = atomicWriteEdition(target.file, candidate);
    quarantineStage = 'attempt-finalization';
    modelUsage = usage();
    attempts = finishAttempt(attempts, editorialDate, slot, {
      state: target.state, completedAt: new Date().toISOString(), calls: recoveryBase.calls + modelUsage.calls,
      costUSD: Math.round((recoveryBase.costUSD + (Number(modelUsage.costUSD) || 0)) * 1e6) / 1e6,
      artifactHash: edition.artifactHash, reason: '',
    });
    write(ATTEMPTS_FILE, attempts);
    console.log(`edition: ${target.state} ${editorialDate}/${slot} · ${passing.length} stories · ${edition.artifactHash}`);
    emitOutcome({ state: target.state, editorial_date: editorialDate, slot, artifact_hash: edition.artifactHash });
  } catch (error) {
    if (quarantine) {
      try { quarantine.recordFailure(error, quarantineStage); }
      catch (preservationError) {
        console.error(`Could not append quarantine failure details: ${clean(preservationError.message)}`);
      }
    }
    try {
      const anthropic = await import('./lib/anthropic.js');
      modelUsage = anthropic.usage();
    } catch { /* failed before the model module loaded */ }
    attempts = finishAttempt(attempts, editorialDate, slot, {
      state: 'failed', completedAt: new Date().toISOString(), calls: recoveryBase.calls + modelUsage.calls,
      costUSD: Math.round((recoveryBase.costUSD + (Number(modelUsage.costUSD) || 0)) * 1e6) / 1e6,
      reason: clean(error?.message).slice(0, 500),
      diagnostics: failureDiagnostics.slice(0, 5),
    });
    write(ATTEMPTS_FILE, attempts);
    emitOutcome({ state: 'failed', editorial_date: editorialDate, slot, artifact_hash: '' });
    throw error;
  }
}

export { main, candidateUniverse, evidenceFor, deterministicDraftCheck, makeStory, buildWeekStories, buildWeeklyBrief, draftSchema, auditSchema, keyedUnits, repairOverlongAnalysis, sectionOf, publicationCoverage, removableBudgetRow };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(`build-edition failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
