// The Mexico Brief's only edition writer.
//
// The whole candidate is built and checked in memory. data/edition.json is replaced
// once, after English, Spanish, evidence, dates and story order all pass. Any failure
// exits non-zero and leaves the previous public edition byte-for-byte unchanged.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectNews } from './collect-news.js';
import { fetchArticle } from './lib/fetch-article.js';
import { eventCandidateEligible, mexicoRelevant } from './lib/news-trust.js';
import { lintAnalysisText, lintReportText, reportContextDistinct } from './lib/lint.js';
import newsDay from './lib/news-day.cjs';
import newsThreads from './lib/news-threads.cjs';
import scheduledCandidate from './lib/scheduled-candidate.cjs';
import candidatePriority from './lib/candidate-priority.cjs';
import analysisEvidence from './lib/analysis-evidence.cjs';
import publicEdition from './lib/public-edition.cjs';
import attemptContract from './lib/edition-attempts.cjs';
import { plainSourceName } from './lib/plain-language.cjs';
import { REPORT, TRUST, SEAM, EARNED_LINE, BAN, ANALYSIS_SHAPE } from './lib/voice.js';
import { validateNarrativeText } from './lib/publication-contract.js';
import { articleUrlAllowed, sourceHosts } from './lib/url-safety.js';
import bilingualFidelity from './lib/bilingual-fidelity.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const EDITION_FILE = path.join(DATA, 'edition.json');
const ATTEMPTS_FILE = path.join(DATA, 'edition-attempts.json');
const MAX_CANDIDATES = 24;
const MAX_RANKED = 5;
const MAX_VISIBLE = 3;
const MAX_WEEK_STORIES = 21;
const MONTHLY_LIMIT = 6;
const ANALYSIS_POLICY = 'atomic-bilingual-edition-v1';
const NEWS_SOURCES = read(path.join(__dirname, 'news-sources.json'), { sources: [] }).sources || [];
const SOURCE_BY_NAME = new Map(NEWS_SOURCES.map((source) => [source.name, source]));

const { editorialDay } = newsDay;
const { groupEvents, mergeCoverage } = newsThreads;
const { dueScheduledRows, linkScheduledCandidate, missingScheduledRows, seedScheduledCandidate } = scheduledCandidate;
const { prioritizeCandidates } = candidatePriority;
const { calendarScore, standingScore } = analysisEvidence;
const { atomicWriteEdition, mondayOf, previousDay, weekendDay } = publicEdition;
const { bilingualFidelityFlags } = bilingualFidelity;
const {
  MAX_MODEL_CALLS,
  beginAttempt,
  candidateSignature,
  dailyLimit,
  dateSpend,
  finishAttempt,
  readAttempts,
  sameSignatureNoonNoop,
  slotAttempt,
} = attemptContract;

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
const clean = (value) => String(value || '').trim();
const arr = (value) => (Array.isArray(value) ? value : []);
const clamp = (value, low, high) => Math.max(low, Math.min(high, Math.round(Number(value) || low)));
const sectionOf = (item) => {
  const text = `${item.title || ''} ${item.dek || ''} ${item.beat || ''}`;
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
  const registered = SOURCE_BY_NAME.get(item.sourceName);
  return Boolean(registered)
    && (item.tier === 1 || item.tier === 2 || item.tier === 'specialist')
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
const eastParts = (date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
}).formatToParts(date).map((part) => [part.type, part.value]));
const slotFor = (date) => {
  const explicit = clean(process.env.PUBLICATION_SLOT);
  if (explicit) return explicit;
  const hour = Number(eastParts(date).hour);
  if (hour === 9 || hour === 10) return 'morning';
  if (hour === 12 || hour === 13) return 'noon';
  return '';
};
function emitOutcome(values) {
  const body = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n');
  process.stdout.write(`${body}\n`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${body}\n`);
}
const titleKey = (value) => clean(value).toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, ' ').replace(/\s+/g, ' ');
const storyId = (item) => clean(item._scheduled?.id) || `n-${crypto.createHash('sha1').update(clean(item.url) || clean(item.title)).digest('hex').slice(0, 12)}`;

async function candidateUniverse(now, schedule, editorialDate) {
  const weekStart = mondayOf(editorialDate);
  const allowedStart = weekendDay(editorialDate) ? weekStart : previousDay(editorialDate);
  const files = new Set([
    isoWeek(now),
    isoWeek(new Date(now.getTime() - 7 * 864e5)),
  ]);
  const all = [...files].flatMap((week) => read(path.join(DATA, 'news', `${week}.json`), []));
  const byUrl = new Map();
  for (const item of all) {
    const date = editorialDay(item?.published_at);
    if (!item?.url || !item?.title || !sourceAllowed(item) || date < allowedStart || date > editorialDate) continue;
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
function draftSchema() {
  const refs = { type: 'array', items: { type: 'string' } };
  const translation = {
    type: 'object', additionalProperties: false,
    required: ['headline', 'dek', 'background', 'view', 'watch'],
    properties: Object.fromEntries(['headline', 'dek', 'background', 'view', 'watch']
      .map((field) => [field, { type: 'string' }])),
  };
  const item = {
    type: 'object', additionalProperties: false,
    required: ['i', 'headline', 'headlineRefs', 'dek', 'dekRefs', 'background', 'backgroundRefs', 'view', 'viewRefs', 'watch', 'watchRefs', 'es'],
    properties: {
      i: { type: 'integer' },
      headline: { type: 'string' }, headlineRefs: refs,
      dek: { type: 'string' }, dekRefs: refs,
      background: { type: 'string' }, backgroundRefs: refs,
      view: { type: 'string' }, viewRefs: refs,
      watch: { type: 'string' }, watchRefs: refs,
      es: translation,
    },
  };
  return { type: 'object', additionalProperties: false, required: ['stories'], properties: { stories: { type: 'array', items: item } } };
}
function auditSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['reviews'], properties: {
      reviews: { type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['i', 'ok', 'problems'], properties: {
          i: { type: 'integer' }, ok: { type: 'boolean' },
          problems: { type: 'array', items: { type: 'string' } },
        },
      } },
    },
  };
}

function evidenceRecord({ id, kind, source, url, text }) {
  return { id: clean(id), kind: clean(kind), source: plainSourceName(source), url: clean(url), text: clean(text).slice(0, 2200) };
}

async function evidenceFor(item, standing, calendar) {
  const registered = SOURCE_BY_NAME.get(item.sourceName);
  const article = await fetchArticle(item.url, {
    allowedHosts: registered ? sourceHosts(registered) : [new URL(item.url).hostname],
  }).catch(() => ({ ok: false, text: '' }));
  const evidence = [evidenceRecord({
    id: 'article', kind: 'article', source: item.sourceName || item.source, url: item.url,
    text: [item.title, item.dek, article.text].filter(Boolean).join('\n'),
  })];
  const seen = new Set([item.url]);
  const push = (record) => {
    if (!record?.url || seen.has(record.url) || !/^https:\/\//i.test(record.url)) return;
    const shaped = evidenceRecord(record);
    if (!shaped.text || !shaped.source) return;
    seen.add(record.url);
    evidence.push(shaped);
  };

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
    for (const flag of bilingualFidelityFlags({ english: draft[field], spanish, evidence: inputs })) {
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
  if (!arr(draft.backgroundRefs).some((ref) => ref !== 'article')) flags.push('background: needs an independent source');
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

async function main() {
  const now = new Date(process.env.EDITION_NOW_ISO || Date.now());
  if (!Number.isFinite(now.getTime())) throw new Error('EDITION_NOW_ISO is invalid');
  const editorialDate = clean(process.env.PUBLICATION_DATE) || editorialDay(now);
  const priorEdition = read(EDITION_FILE, null);
  const slot = slotFor(now);
  if (!slot) {
    console.log('edition: outside the 9am/noon Eastern publication windows, zero model calls');
    emitOutcome({ state: 'noop', editorial_date: editorialDate, slot: 'none', artifact_hash: '' });
    return;
  }
  if (!['morning', 'noon'].includes(slot)) throw new Error(`invalid publication slot: ${slot}`);
  process.env.LLM_BUDGET_DATE = `${editorialDate}T12:00:00Z`;

  let attempts = readAttempts(read(ATTEMPTS_FILE, {}));
  if (slotAttempt(attempts, editorialDate, slot)) {
    console.log(`edition: ${editorialDate}/${slot} already attempted, zero model calls`);
    emitOutcome({ state: 'noop', editorial_date: editorialDate, slot, artifact_hash: '' });
    return;
  }

  let schedule;
  let universe;
  let signature;
  try {
    if (process.env.EDITION_SKIP_COLLECTION !== '1') await collectNews({ now });
    schedule = read(path.join(DATA, 'events.json'), { events: [] });
    universe = await candidateUniverse(now, schedule, editorialDate);
    signature = candidateSignature(universe);
  } catch (error) {
    attempts = beginAttempt(attempts, {
      editorialDate, slot, candidateSignature: '0'.repeat(64), startedAt: now.toISOString(),
    });
    attempts = finishAttempt(attempts, editorialDate, slot, {
      state: 'failed', completedAt: new Date().toISOString(), calls: 0, costUSD: 0,
      reason: `collection failed: ${clean(error?.message).slice(0, 460)}`,
    });
    write(ATTEMPTS_FILE, attempts);
    emitOutcome({ state: 'failed', editorial_date: editorialDate, slot, artifact_hash: '' });
    throw error;
  }

  if (slot === 'noon' && sameSignatureNoonNoop(attempts, editorialDate, signature, priorEdition?.artifactHash)) {
    attempts = beginAttempt(attempts, { editorialDate, slot, candidateSignature: signature, startedAt: now.toISOString() });
    attempts = finishAttempt(attempts, editorialDate, slot, {
      state: 'noop-same-signature', completedAt: now.toISOString(), reason: 'no new eligible reporting since morning',
    });
    write(ATTEMPTS_FILE, attempts);
    console.log(`edition: ${editorialDate}/${slot} has the morning signature, zero model calls`);
    emitOutcome({ state: 'noop', editorial_date: editorialDate, slot, artifact_hash: '' });
    return;
  }

  attempts = beginAttempt(attempts, { editorialDate, slot, candidateSignature: signature, startedAt: now.toISOString() });
  write(ATTEMPTS_FILE, attempts);
  let callCount = 0;
  let modelUsage = { calls: 0, costUSD: 0 };
  try {
    if (!universe.length) throw new Error('no eligible candidates');
    const { askJSON, hasLLM, models, usage } = await import('./lib/anthropic.js');
    if (!hasLLM()) throw new Error('ANTHROPIC_API_KEY is missing');
    const priorDailySpend = dateSpend(attempts, editorialDate);
    const dayLimit = dailyLimit(editorialDate, MONTHLY_LIMIT);
    const call = async (request) => {
      if (callCount >= MAX_MODEL_CALLS) throw new Error(`model call limit ${MAX_MODEL_CALLS} reached`);
      const inputBytes = new TextEncoder().encode(`${request.system}\n${request.user}`).byteLength + 1024;
      const projected = inputBytes / 1e6 + (Number(request.maxTokens) || 0) * 5 / 1e6;
      const spent = priorDailySpend + (Number(usage().costUSD) || 0);
      if (spent + projected > dayLimit) throw new Error(`daily model budget would be exceeded (${spent.toFixed(4)} + ${projected.toFixed(4)} > ${dayLimit.toFixed(4)})`);
      callCount += 1;
      const result = await askJSON({ ...request, model: models.HAIKU, priority: 'core' });
      if (!result) throw new Error(`model call ${callCount} returned no usable result`);
      return result;
    };

    const rankedResponse = await call({
      system: `${TRUST}\n\n${REPORT}\n\nYou are selecting the Mexico Brief, a morning news product for a business reader. Rank actual changes in government policy, regulation, courts, security, trade, macro data, or company investment. Exclude opinion, advice, profiles, previews, routine market moves, announcements without a concrete Mexico consequence, and duplicate angles. A scheduled official outcome outranks ordinary reporting and must be selected. Return no prose, only the indices and 1-10 importance scores of at most five distinct developments.`,
      user: JSON.stringify(universe.map((item, i) => ({
        i, date: item._editorialDate, title: item.title, dek: item.dek,
        source: item.sourceName || item.source, section: item._section,
        scheduled: item._scheduled ? { label: item._scheduled.label, importanceFloor: item._scheduled.importanceFloor } : null,
      }))),
      schema: rankSchema(), maxTokens: 850,
    });
    const ranked = [];
    const seen = new Set();
    for (const row of arr(rankedResponse.ranked)) {
      const index = Number(row?.i);
      if (!Number.isInteger(index) || index < 0 || index >= universe.length || seen.has(index)) continue;
      seen.add(index);
      ranked.push({ index, importance: clamp(row.importance, 1, 10), item: universe[index] });
    }
    for (let index = 0; index < universe.length; index += 1) {
      const item = universe[index];
      if (!item._scheduled || seen.has(index)) continue;
      ranked.unshift({ index, importance: clamp(item._scheduled.importanceFloor || 8, 1, 10), item });
      seen.add(index);
    }
    ranked.sort((a, b) => Number(Boolean(b.item._scheduled)) - Number(Boolean(a.item._scheduled))
      || b.importance - a.importance
      || String(b.item.published_at).localeCompare(String(a.item.published_at)));
    // The model may return five ranked ids so the receipt is auditable, but only the
    // top three form the locked edition pool. A rejected card is omitted; a lower
    // story is never promoted merely because it was easier for the model to explain.
    const locked = ranked.filter((row) => row.item._scheduled || row.importance >= 6)
      .slice(0, MAX_RANKED).slice(0, MAX_VISIBLE);
    if (!locked.length) throw new Error('ranking selected no developments');
    if (!weekendDay(editorialDate) && !locked.some((row) => row.item._editorialDate === editorialDate)) {
      throw new Error('ranking selected no exact-day development');
    }

    const standing = arr(read(path.join(DATA, 'standing.json'), { facts: [] }).facts);
    const calendar = arr(schedule.events).filter((event) => event?.date >= previousDay(editorialDate));
    const evidenceRows = await Promise.all(locked.map(async (row) => ({
      ...row, evidence: await evidenceFor(row.item, standing, calendar),
    })));
    const researchable = evidenceRows.filter((row) => row.evidence.length >= 2);
    if (!researchable.length) throw new Error('no selected development has independent context');

    const draftResponse = await call({
      system: `${TRUST}\n\n${SEAM}\n\n${EARNED_LINE}\n\n${BAN}\n\n${REPORT}\n\n${ANALYSIS_SHAPE}\n\nWrite one complete English story unit for every input and a faithful Mexican-Spanish translation of all five fields. Use only the evidence strings inside that same input. Cite every field with 1-3 exact evidence ids. Headline: shortest accurate account. Dek: one additional sourced fact or comparison. Background: context a newcomer needs and must cite at least one source other than article. Our view: a narrow inference supported by its citations, without first person. Watch: the next observable decision, release, or result and what would confirm or weaken the view. Spanish must preserve every actor, action direction, number, date, caveat, procedural stage, and degree of certainty. Never narrate the prompt, labels, or evidence. Return an item even when evidence is thin; use an empty field so code rejects it.`,
      user: JSON.stringify(researchable.map((row) => ({
        i: row.index,
        story: { date: row.item._editorialDate, source: row.item.sourceName || row.item.source, url: row.item.url },
        evidence: row.evidence.map(({ id, kind, source, url, text }) => ({ id, kind, source, url, text })),
      }))),
      schema: draftSchema(), maxTokens: 6500,
    });
    const draftByIndex = new Map(arr(draftResponse.stories).map((draft) => [Number(draft.i), draft]));
    const deterministicPass = researchable.flatMap((row) => {
      const draft = draftByIndex.get(row.index);
      if (!draft) return [];
      const flags = deterministicDraftCheck(row, draft);
      if (flags.length) {
        console.warn(`  reject draft ${storyId(row.item)}: ${flags.join('; ')}`);
        return [];
      }
      return [{ row, draft }];
    });
    if (!deterministicPass.length) throw new Error('all story drafts failed the deterministic evidence gate');

    const auditResponse = await call({
      system: `You are the final independent evidence and bilingual editor. Review each English field only against the exact evidence cited for that field. Independently compare its Spanish translation with both the English field and the same cited evidence. Reject unsupported actors, numbers, comparisons, causal claims, procedural stages, predictions, non sequiturs, mistranslations, reversed actions, changed subjects, or changed degrees of certainty in either language. Do not reject a clearly labeled narrow inference merely for being an inference. Do not rewrite either language. Return one verdict for every input index.`,
      user: JSON.stringify(deterministicPass.map(({ row, draft }) => ({
        i: row.index,
        fields: Object.fromEntries(['headline', 'dek', 'background', 'view', 'watch'].map((field) => [field, {
          english: draft[field], spanish: draft.es[field],
          evidence: citedInputs(row, draft[`${field}Refs`]).map((text, position) => ({ id: draft[`${field}Refs`][position], text })),
        }])),
      }))),
      schema: auditSchema(), maxTokens: 1800,
    });
    const reviews = new Map(arr(auditResponse.reviews).map((review) => [Number(review.i), review]));
    const passing = [];
    for (const entry of deterministicPass) {
      const review = reviews.get(entry.row.index);
      if (!review?.ok) {
        console.warn(`  reject audit ${storyId(entry.row.item)}: ${arr(review?.problems).join('; ') || 'missing review'}`);
        continue;
      }
      passing.push(makeStory(entry.row, entry.draft, editorialDate, weekendDay(editorialDate)));
      if (passing.length === MAX_VISIBLE) break;
    }
    const selectedScheduled = locked.filter((row) => row.item._scheduled).map((row) => storyId(row.item));
    const passingIds = new Set(passing.map((story) => story.id));
    if (selectedScheduled.some((id) => !passingIds.has(id))) throw new Error('a required scheduled outcome failed the edition gate');
    if (!passing.length) throw new Error('all selected stories failed the independent evidence audit');
    if (!weekendDay(editorialDate) && !passing.some((story) => story.date === editorialDate)) {
      throw new Error('no exact-day story survived the edition gate');
    }

    const edition = atomicWriteEdition(EDITION_FILE, {
      schemaVersion: 1,
      editorialDate,
      generatedAt: now.toISOString(),
      slot,
      editionType: weekendDay(editorialDate) ? 'weekend-recap' : 'daily',
      candidateSignature: signature,
      summary: { en: passing.map((story) => story.en.dek).join(' '), es: passing.map((story) => story.es.dek).join(' ') },
      stories: passing,
      weekStories: buildWeekStories(priorEdition, passing, editorialDate),
    });
    modelUsage = usage();
    attempts = finishAttempt(attempts, editorialDate, slot, {
      state: 'published', completedAt: new Date().toISOString(), calls: modelUsage.calls,
      costUSD: Math.round((Number(modelUsage.costUSD) || 0) * 1e6) / 1e6,
      artifactHash: edition.artifactHash, reason: '',
    });
    write(ATTEMPTS_FILE, attempts);
    console.log(`edition: published ${editorialDate}/${slot} · ${passing.length} stories · ${edition.artifactHash}`);
    emitOutcome({ state: 'published', editorial_date: editorialDate, slot, artifact_hash: edition.artifactHash });
  } catch (error) {
    try {
      const anthropic = await import('./lib/anthropic.js');
      modelUsage = anthropic.usage();
    } catch { /* failed before the model module loaded */ }
    attempts = finishAttempt(attempts, editorialDate, slot, {
      state: 'failed', completedAt: new Date().toISOString(), calls: modelUsage.calls || callCount,
      costUSD: Math.round((Number(modelUsage.costUSD) || 0) * 1e6) / 1e6,
      reason: clean(error?.message).slice(0, 500),
    });
    write(ATTEMPTS_FILE, attempts);
    emitOutcome({ state: 'failed', editorial_date: editorialDate, slot, artifact_hash: '' });
    throw error;
  }
}

main().catch((error) => {
  console.error(`build-edition failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
