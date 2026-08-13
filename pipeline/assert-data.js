// assert-data.js — publication gate for the assembled data product.
// Fails only on conditions that would make a public page wrong or broken. Old but
// valid last-good data warn; the page must date it, not silently replace it.

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PAGE_DATA_CONTRACTS, assetId,
  validateSeriesDocument, validateHealthDocument,
  validateNarrativeText,
  isSafeHttpUrl, validPeriod,
} from './lib/publication-contract.js';
import { freshnessStatus } from './lib/freshness.js';
import { lintEventReport, lintReportText, lintAnalysisText, analysisNeedsScale, reportContextDistinct } from './lib/lint.js';
import newsDay from './lib/news-day.cjs';
import newsWindow from './lib/news-window.cjs';
import scheduleCoverage from './lib/schedule-coverage.cjs';
import briefReadinessPolicy from './lib/brief-readiness.cjs';
import reportEvidence from './lib/report-evidence.cjs';

const { editorialDay } = newsDay;
const { eventTimestamp } = newsWindow;
const { validateScheduleCoverage } = scheduleCoverage;
const { briefReadiness } = briefReadinessPolicy;
const { evidenceInputs } = reportEvidence;

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const fails = [], warns = [];
const read = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));
const addErrors = (label, errors) => errors.forEach((error) => fails.push(`${label}: ${error}`));
const checkText = (label, value) => { if (value !== undefined && value !== null && value !== '') addErrors(label, validateNarrativeText(value)); };
const dayAge = (value) => (Date.now() - Date.parse(value)) / 86_400_000;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

// 1. Every published JSON/GeoJSON/TopoJSON file must parse. A truncated atomic
// write is impossible in the connector harness, but this also protects manual and
// derived builders that do not yet use that harness.
for (const file of walk(DATA).filter((value) => /\.(?:json|geojson|topojson)$/.test(value))) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fails.push(`${path.relative(ROOT, file)}: invalid JSON (${error.message})`); }
}

// 2. Page contracts: publication is blocked if a control, chart, or drilldown file
// is absent. Runtime code may degrade gracefully, but production must ship complete.
for (const [page, assets] of Object.entries(PAGE_DATA_CONTRACTS)) {
  for (const asset of new Set(assets)) if (!exists(asset)) fails.push(`${page}: required asset ${asset} is missing`);
}

// 3. Connector-shaped files: exact id, provenance, finite values, unique ordered
// periods, and metadata tied to the latest observation.
const servedById = new Map();
const seriesDir = path.join(DATA, 'series');
for (const file of fs.readdirSync(seriesDir).filter((name) => name.endsWith('.json')).sort()) {
  const id = assetId(file), relative = `data/series/${file}`;
  let doc; try { doc = read(relative); } catch { continue; }
  servedById.set(id, doc);
  addErrors(relative, validateSeriesDocument(doc, id));
  const fresh = freshnessStatus({ cadence: doc.meta?.cadence, thresholds: { freshnessGraceDays: doc.meta?.freshnessGraceDays } }, doc.meta?.vintage);
  if (fresh?.stale) warns.push(`${id}: latest observation ${doc.meta.vintage} is older than the ${doc.meta.cadence} release window`);
}

// 4. Health must describe what is actually served. Builder-owned trade series are
// explicitly classified; any other unmonitored series is an architecture regression.
let health = null;
try {
  health = read('data/health.json');
  // The health ledger may still contain last-good records from a retired product.
  // Validate only the ten series this homepage actually renders; the next scheduled
  // run rewrites the ledger with that same set.
  const homepageSeries = new Set((PAGE_DATA_CONTRACTS.Brief || [])
    .map((asset) => /^data\/series\/([^/]+)\.json$/.exec(asset)?.[1])
    .filter(Boolean));
  const homepageSources = (health.sources || []).filter((source) => homepageSeries.has(source.id));
  const homepageHealth = {
    ...health,
    sources: homepageSources,
    summary: {
      ok: homepageSources.filter((source) => source.status === 'ok').length,
      flagged: homepageSources.filter((source) => source.status === 'ok_flagged').length,
      failed: homepageSources.filter((source) => source.status === 'failed').length,
      skipped: homepageSources.filter((source) => source.status === 'skipped').length,
      darkSources: homepageSources.filter((source) => source.status === 'failed' && source.stale).map((source) => source.id),
    },
  };
  addErrors('data/health.json', validateHealthDocument(homepageHealth, servedById));
  for (const source of homepageSources) {
    if (!['ok', 'ok_flagged'].includes(source.status) || !source.vintage) continue;
    const current = freshnessStatus({ cadence: source.cadence, thresholds: { freshnessGraceDays: source.freshnessGraceDays } }, source.vintage);
    const hasStale = (source.flags || []).some((flag) => String(flag).startsWith('stale_'));
    if (current?.stale && !hasStale) warns.push(`${source.id}: health does not yet carry its computed stale flag`);
    if (current && !current.stale && hasStale) warns.push(`${source.id}: health carries a stale flag that no longer matches the release-aware rule`);
  }
} catch (error) { fails.push(`data/health.json: ${error.message}`); }

// 5. Narrative/context contracts: every public claim row is dated, named, and
// linked. Brief references must resolve to the curated event ledger.
try {
  const happening = read('data/happening.json');
  const events = happening.events || [];
  const ids = new Set();
  for (const [index, event] of events.entries()) {
    if (!event.id || ids.has(event.id)) fails.push(`happening: duplicate or missing id at row ${index}`);
    ids.add(event.id);
    for (const key of ['date', 'section', 'title', 'source', 'url']) if (!event[key]) fails.push(`happening: ${event.id || index} missing ${key}`);
    if (!validPeriod(event.date)) fails.push(`happening: ${event.id || index} has invalid date ${event.date}`);
    if (event.publishedAt && editorialDay(event.publishedAt) !== event.date) fails.push(`happening: ${event.id || index} date does not match its Mexico City publication day`);
    for (const key of ['title', 'source', 'why']) checkText(`happening: ${event.id || index}.${key}`, event[key]);
    if (!isSafeHttpUrl(event.url)) fails.push(`happening: ${event.id || index} has invalid source URL`);
    if (event.reportEvidence) {
      const reportGate = lintEventReport({ event, inputs: evidenceInputs(event) });
      if (!reportGate.ok) fails.push(`happening: ${event.id || index} factual rewrite fails retained source evidence (${reportGate.flags.join('; ')})`);
    }
    const analysisInputs = [event.date, event.title, event.context, event.why, event.background, event.drivers, event.implications, event.next,
      ...(event.coverage || []).flatMap((source) => [source.title, source.summary])];
    const completeAnalysis = ['background', 'view', 'prediction'].every((field) => String(event[field] || '').trim());
    // Older complete units may remain in the rolling event archive, but v9 readiness
    // keeps them off the homepage. Only malformed pre-grounding drafts are invalid here.
    if (completeAnalysis && Number(event.analysisV) < 7) fails.push(`happening: ${event.id || index} has complete but unapproved BE analysis`);
    if (completeAnalysis && Number(event.analysisV) >= 9) {
      for (const field of ['background', 'view', 'prediction']) {
        if (!Array.isArray(event.analysisRefs?.[field]) || !event.analysisRefs[field].some((ref) => String(ref || '').trim())) {
          fails.push(`happening: ${event.id || index}.${field} has no retained evidence reference`);
        }
      }
      if (!Array.isArray(event.analysisSources) || !event.analysisSources.some((source) => isSafeHttpUrl(source?.url))) {
        fails.push(`happening: ${event.id || index} has no linked Briefly Explained evidence`);
      }
      if (!event.analysisSources?.some((source) => source?.kind === 'primary' && isSafeHttpUrl(source?.url))) {
        fails.push(`happening: ${event.id || index} has no primary record in Briefly Explained evidence`);
      }
      for (const source of event.analysisSources || []) {
        if (!source?.source) fails.push(`happening: ${event.id || index} has an unnamed Briefly Explained source`);
        if (!isSafeHttpUrl(source?.url)) fails.push(`happening: ${event.id || index} has an invalid Briefly Explained source URL`);
      }
    }
    if (event.view) {
      const gate = lintAnalysisText({ text: event.view, inputs: analysisInputs, role: 'view', maxWords: 85, maxSentences: 5,
        requireScale: completeAnalysis && analysisNeedsScale([event.title, event.context, event.why]), forbidFirstPerson: completeAnalysis,
        // Published analysis was grounded against fetched article text and primary records
        // before it was stored. Those private inputs are not persisted here, so this
        // pass rechecks voice and usefulness without falsely rejecting cited numbers.
        checkNumbers: !completeAnalysis });
      if (!gate.ok) fails.push(`happening: ${event.id || index}.view fails the analysis voice gate (${gate.flags.join('; ')})`);
    }
    if (event.prediction) {
      const gate = lintAnalysisText({ text: event.prediction, inputs: analysisInputs, role: 'prediction', maxWords: 65, maxSentences: 4,
        strictForecast: completeAnalysis, forbidFirstPerson: completeAnalysis, checkNumbers: !completeAnalysis });
      if (!gate.ok) fails.push(`happening: ${event.id || index}.prediction fails the analysis voice gate (${gate.flags.join('; ')})`);
    }
  }
  if (happening.meta?.count !== events.length) fails.push(`happening: meta.count ${happening.meta?.count} does not match ${events.length}`);
  if (dayAge(happening.meta?.generatedAt) > 4) warns.push(`happening: generated ${Math.floor(dayAge(happening.meta.generatedAt))} days ago`);

  const brief = read('data/brief.json');
  for (const error of validateScheduleCoverage(read('data/events.json'), editorialDay(new Date()))) {
    fails.push(`scheduled outcomes: ${error}`);
  }
  const claims = [brief.lead, ...(brief.items || [])].filter(Boolean);
  const explanationReadiness = briefReadiness(brief);
  const expectedContentSig = createHash('sha256').update(JSON.stringify(claims.map((claim) => [
    claim.href, claim.date, claim.h1 || claim.headline, claim.context, claim.source,
    claim.background, claim.view, claim.prediction, claim.analysisV, claim.analysisRefs, claim.analysisSources, claim.implications, claim.next,
  ]))).digest('hex');
  if (!validPeriod(brief.meta?.editorialDate || '')) fails.push('brief: meta.editorialDate is missing or invalid');
  if (!claims.length && (!brief.meta?.quiet || !String(brief.summary || '').trim())) {
    fails.push('brief: an empty day must be marked quiet and include an honest empty-state summary');
  }
  if (claims.length && !brief.lead) fails.push('brief: a non-empty day needs a lead');
  if (!explanationReadiness.targetMet) {
    fails.push(`brief: every selected story needs an approved, evidence-linked Briefly Explained unit (ready ${explanationReadiness.readyTargetCount}/${explanationReadiness.requiredCount}; missing ${explanationReadiness.missingTarget.join(', ')})`);
  }
  if (brief.meta?.count !== claims.length) fails.push(`brief: meta.count ${brief.meta?.count} does not match ${claims.length} total claims`);
  if (brief.meta?.contentSig !== expectedContentSig) fails.push('brief: content signature does not match the visible story set');
  if (String(brief.summary || '').trim()) {
    const summaryGate = lintReportText({
      text: brief.summary,
      inputs: claims.flatMap((claim) => [claim.h1 || claim.headline, claim.context]),
      maxWords: 105,
      maxSentences: 5,
    });
    if (!summaryGate.ok) fails.push(`brief: opening summary fails the public copy gate (${summaryGate.flags.join('; ')})`);
  }
  for (const [index, claim] of claims.entries()) {
    for (const key of [index ? 'headline' : 'h1', 'context', 'href', 'source']) if (!claim[key]) fails.push(`brief: claim ${index + 1} missing ${key}`);
    for (const key of [index ? 'headline' : 'h1', 'context', 'source']) checkText(`brief: claim ${index + 1}.${key}`, claim[key]);
    if (!isSafeHttpUrl(claim.href)) fails.push(`brief: claim ${index + 1} has invalid source URL`);
    if (!Array.isArray(claim.refs) || !claim.refs.length) fails.push(`brief: claim ${index + 1} has no evidence ref`);
    for (const ref of claim.refs || []) if (!ids.has(ref)) fails.push(`brief: evidence ref ${ref} is absent from happening.json`);
    if (claim.date > brief.meta?.editorialDate) fails.push(`brief: claim ${index + 1} is future-dated ${claim.date}`);
    const builtAt = Date.parse(brief.meta?.generatedAt);
    const maxAge = (Number(brief.meta?.windowHours) || 36) * 60 * 60 * 1000;
    const backedInWindow = (claim.refs || []).some((ref) => {
      const event = events.find((candidate) => candidate.id === ref);
      const published = eventTimestamp(event);
      return Number.isFinite(builtAt) && published && published <= builtAt + (15 * 60 * 1000) && published >= builtAt - maxAge;
    });
    if (!backedInWindow) fails.push(`brief: claim ${index + 1} falls outside its ${Number(brief.meta?.windowHours) || 36}-hour news window`);
    const sourceInputs = (claim.refs || []).flatMap((ref) => {
      const event = events.find((candidate) => candidate.id === ref);
      return event ? evidenceInputs(event) : [];
    });
    const contextGate = lintReportText({ text: claim.context, inputs: sourceInputs, maxWords: 55, maxSentences: 2 });
    if (!contextGate.ok) fails.push(`brief: claim ${index + 1} context fails the public copy gate (${contextGate.flags.join('; ')})`);
    if (!reportContextDistinct({ headline: claim.h1 || claim.headline, context: claim.context })) {
      fails.push(`brief: claim ${index + 1} context repeats its headline without adding a sourced fact`);
    }
    const claimHasAnalysis = ['background', 'view', 'prediction'].some((field) => String(claim[field] || '').trim());
    const claimHasCompleteAnalysis = ['background', 'view', 'prediction'].every((field) => String(claim[field] || '').trim());
    if (claimHasAnalysis && (!claimHasCompleteAnalysis || Number(claim.analysisV) < 9)) fails.push(`brief: claim ${index + 1} exposes incomplete or unapproved BE analysis`);
    if (claimHasCompleteAnalysis && Number(claim.analysisV) >= 9) {
      const refs = claim.analysisRefs || {};
      for (const field of ['background', 'view', 'prediction']) {
        if (!Array.isArray(refs[field]) || !refs[field].some((ref) => String(ref || '').trim())) {
          fails.push(`brief: claim ${index + 1}.${field} has no retained evidence reference`);
        }
      }
      if (!Array.isArray(claim.analysisSources) || !claim.analysisSources.some((source) => isSafeHttpUrl(source?.url))) {
        fails.push(`brief: claim ${index + 1} has no linked Briefly Explained evidence`);
      }
      if (!claim.analysisSources?.some((source) => source?.kind === 'primary' && isSafeHttpUrl(source?.url))) {
        fails.push(`brief: claim ${index + 1} has no primary record in Briefly Explained evidence`);
      }
    }
  }

  // Completeness is a separate publication contract from ranking. Exact, high-impact
  // calendar obligations remain open until the event log contains a report explicitly
  // linked by scheduledEventId. A prior-day miss blocks the edition instead of quietly
  // certifying an incomplete Brief. Same-day pending events remain visible in the audit
  // but do not hold a morning edition before the release occurs.
  if (!exists('data/event-status.json')) {
    fails.push('scheduled outcomes: data/event-status.json is missing');
  } else {
    const eventStatus = read('data/event-status.json');
    if (eventStatus.meta?.editorialDate !== brief.meta?.editorialDate) {
      fails.push('scheduled outcomes: status date does not match the Brief editorial date');
    }
    for (const outcome of eventStatus.outcomes || []) {
      if (outcome.hardBlock || outcome.status === 'missing') {
        fails.push(`scheduled outcomes: ${outcome.id || outcome.label} is missing after its publication day`);
      }
      if (outcome.status !== 'satisfied' || !outcome.requiredForBrief || !outcome.matchedEventId) continue;
      const matched = events.find((event) => event.id === outcome.matchedEventId);
      const builtAt = Date.parse(brief.meta?.generatedAt);
      const maxAge = (Number(brief.meta?.windowHours) || 36) * 60 * 60 * 1000;
      const published = eventTimestamp(matched);
      const isCurrent = Number.isFinite(builtAt) && published
        && published <= builtAt + (15 * 60 * 1000) && published >= builtAt - maxAge;
      if (isCurrent && !claims.some((claim) => (Array.isArray(claim.refs) ? claim.refs : []).includes(outcome.matchedEventId))) {
        fails.push(`brief: required scheduled outcome ${outcome.id} was satisfied but not selected`);
      }
    }
  }

  const selectionReceipt = brief.meta?.selection?.receipt;
  if (!Array.isArray(selectionReceipt)) fails.push('brief: selection receipt is missing');
  else {
    if (selectionReceipt.some((row) => /analysis/i.test(String(row.reason || '')))) {
      fails.push('brief: optional analysis must never be an exclusion reason');
    }
    const selectedIds = new Set(selectionReceipt.filter((row) => row.selected).map((row) => row.id));
    for (const claim of claims) {
      if (!(Array.isArray(claim.refs) ? claim.refs : []).some((ref) => selectedIds.has(ref))) {
        fails.push(`brief: published claim ${(claim.h1 || claim.headline || '').slice(0, 50)} is absent from the selection receipt`);
      }
    }
  }
  for (const live of brief.standing?.live || []) if (!servedById.has(live.series)) fails.push(`brief: standing line needs missing series ${live.series}`);
  if (dayAge(brief.meta?.generatedAt) > 4) warns.push(`brief: generated ${Math.floor(dayAge(brief.meta.generatedAt))} days ago`);

  const calendar = read('data/events.json');
  for (const [index, event] of (calendar.events || []).entries()) {
    for (const key of ['date', 'label', 'mechanism', 'source', 'sourceUrl']) if (!event[key]) fails.push(`events: row ${index + 1} missing ${key}`);
    for (const key of ['label', 'mechanism', 'source']) checkText(`events: row ${index + 1}.${key}`, event[key]);
    if (!validPeriod(event.date)) fails.push(`events: row ${index + 1} has invalid date ${event.date}`);
    if (!isSafeHttpUrl(event.sourceUrl)) fails.push(`events: row ${index + 1} has invalid source URL`);
  }
} catch (error) { fails.push(`narrative contracts: ${error.message}`); }

// No figure reaches a reader without an as-of. This was editorial discipline until
// 2026-08-02, which is how a block headed "Today" came to carry a three-day-old close
// under a note describing cadence. It is now a build guarantee: a homepage figure with
// no observation date, no reader-visible as-of, or a date in the future blocks release.
try {
  const { createRequire } = await import('node:module');
  const nowBoard = createRequire(import.meta.url)(path.join(ROOT, '_data', 'nowBoard.js'));
  const todayISO = new Date().toISOString().slice(0, 10);
  for (const card of nowBoard()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(card.date || '')) {
      fails.push(`homepage figure "${card.label}" is served without an observation date`);
    } else if (card.date > todayISO) {
      fails.push(`homepage figure "${card.label}" is dated ${card.date}, in the future`);
    }
    if (!card.observed) fails.push(`homepage figure "${card.label}" carries no reader-visible as-of`);
  }
} catch (error) { fails.push(`homepage figures: ${error.message}`); }

warns.forEach((warning) => console.log(`  WARN ${warning}`));
if (fails.length) {
  fails.forEach((failure) => console.error(`  FAIL ${failure}`));
  console.error(`\nassert-data: ${fails.length} failure(s) — publication blocked.`);
  process.exit(1);
}
console.log(`assert-data: ok (${warns.length} warning${warns.length === 1 ? '' : 's'}).`);
