'use strict';

// Daily Brief selection is deliberately separate from story analysis.
// A factual, publishable event competes on editorial importance even when its
// Briefly Explained unit is missing, incomplete, or still awaiting approval.

const DEFAULT_MIN_IMPORTANCE = 5;
const DEFAULT_SOFT_FLOOR = 3;
const DEFAULT_CAP = 5;
// v9 adds a separately discovered primary record plus an independent claim audit.
// Older prose is never mistaken for the current product when an event returns.
const ANALYSIS_VERSION = 9;
const ANALYSIS_FIELDS = ['background', 'view', 'prediction'];

const clean = (value) => String(value == null ? '' : value).trim();
const finiteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const uniqueStrings = (values) => [...new Set((Array.isArray(values) ? values : [])
  .map(clean).filter(Boolean))].sort(compareText);

function analysisState(event) {
  const version = finiteNumber(event && event.analysisV);
  const present = ANALYSIS_FIELDS.filter((field) => clean(event && event[field]));
  const textComplete = present.length === ANALYSIS_FIELDS.length;
  const refsComplete = ANALYSIS_FIELDS.every((field) => Array.isArray(event && event.analysisRefs && event.analysisRefs[field])
    && event.analysisRefs[field].some(clean));
  const sourcesComplete = Array.isArray(event && event.analysisSources)
    && event.analysisSources.some((source) => source && source.kind === 'primary'
      && /^https:\/\//i.test(clean(source.url)));
  const complete = textComplete && refsComplete && sourcesComplete && version >= ANALYSIS_VERSION;
  let state = 'missing';
  if (complete) state = 'ready';
  else if (textComplete && version < ANALYSIS_VERSION) state = 'unapproved';
  else if (present.length || version > 0) state = 'incomplete';
  return { state, version, complete };
}

// Rendering should be atomic: expose the whole approved analysis unit or no
// analysis control at all. The selected factual story itself is never removed.
function optionalAnalysis(event) {
  const analysis = analysisState(event);
  if (!analysis.complete) return null;
  return {
    background: clean(event.background),
    view: clean(event.view),
    prediction: clean(event.prediction),
    analysisV: analysis.version,
    analysisRefs: event.analysisRefs && typeof event.analysisRefs === 'object' ? { ...event.analysisRefs } : {},
    analysisSources: Array.isArray(event.analysisSources) ? event.analysisSources.map((source) => ({ ...source })) : [],
  };
}

function defaultCandidateGate(event) {
  if (!event || typeof event !== 'object') return { ok: false, reason: 'invalid-candidate' };
  if (!clean(event.url)) return { ok: false, reason: 'missing-url' };
  if (!clean(event.source)) return { ok: false, reason: 'missing-source' };
  return { ok: true };
}

function normalizeGate(result) {
  if (result === true || result == null) return { ok: true, reason: '' };
  if (result === false) return { ok: false, reason: 'failed-publication-gate' };
  if (typeof result === 'string') return { ok: false, reason: clean(result) || 'failed-publication-gate' };
  if (typeof result !== 'object') return { ok: false, reason: 'failed-publication-gate' };
  if (result.ok) return { ok: true, reason: '' };
  const reason = clean(result.reason)
    || (Array.isArray(result.flags) && clean(result.flags[0]))
    || 'failed-publication-gate';
  return { ok: false, reason };
}

function eventTime(event) {
  const explicit = finiteNumber(event && event._t, NaN);
  if (Number.isFinite(explicit)) return explicit;
  const parsed = Date.parse(event && (event.publishedAt || event.published_at || event.date));
  return Number.isFinite(parsed) ? parsed : 0;
}

function defaultInterestTags(event) {
  return event && (event.interestTags || event._tags) || [];
}

function defaultScheduledMatch(event) {
  return !!(event && (event.scheduledMatch || event._scheduledMatch || event.expectedEventMatch));
}

function receiptId(event, index) {
  return clean(event && (event.id || event.url || event.title || event.headline)) || `candidate-${index + 1}`;
}

function rawImportance(event) {
  const provenance = event && event.importanceProvenance;
  const calculated = Number(provenance && provenance.calculatedTotal);
  if (Number.isFinite(calculated)) return calculated;
  const reported = Number(provenance && provenance.reportedTotal);
  if (Number.isFinite(reported)) return reported;
  return finiteNumber(event && event.importance);
}

/**
 * Deterministically select the Daily Brief's factual stories.
 *
 * Importance is the first and absolute sort key. Interest, scheduled-event
 * reconciliation, source/topic breadth, and freshness may reorder candidates
 * only inside an identical effective-importance band.
 */
function selectDailyBrief(candidates, options = {}) {
  const events = Array.isArray(candidates) ? candidates : [];
  const minImportance = finiteNumber(options.minImportance, DEFAULT_MIN_IMPORTANCE);
  const softFloor = Math.max(0, Math.floor(finiteNumber(options.softFloor, DEFAULT_SOFT_FLOOR)));
  const cap = Math.max(softFloor, Math.floor(finiteNumber(options.cap, DEFAULT_CAP)));
  const effectiveImportance = typeof options.effectiveImportance === 'function'
    ? options.effectiveImportance : (event) => event && event.importance;
  const interestTags = typeof options.interestTags === 'function'
    ? options.interestTags : defaultInterestTags;
  const scheduledMatch = typeof options.scheduledMatch === 'function'
    ? options.scheduledMatch : defaultScheduledMatch;
  const candidateGate = typeof options.candidateGate === 'function'
    ? options.candidateGate : defaultCandidateGate;

  const records = events.map((event, inputIndex) => {
    const importance = finiteNumber(effectiveImportance(event));
    const gate = normalizeGate(candidateGate(event));
    const tags = uniqueStrings(interestTags(event));
    const scheduled = !!scheduledMatch(event);
    const analysis = analysisState(event);
    let eligible = gate.ok;
    let reason = gate.ok ? '' : `ineligible:${gate.reason}`;
    if (eligible && importance < minImportance) {
      eligible = false;
      reason = 'ineligible:below-importance-floor';
    }
    return {
      event,
      inputIndex,
      id: receiptId(event, inputIndex),
      importance,
      rawImportance: rawImportance(event),
      importanceProvenance: event && event.importanceProvenance || null,
      tags,
      scheduledMatch: scheduled,
      analysis,
      source: clean(event && event.source),
      section: clean(event && event.section),
      time: eventTime(event),
      eligible,
      rank: null,
      selected: false,
      reason,
    };
  });

  // Rank one candidate at a time so breadth can reflect the candidates already
  // ahead of it. The next record always comes from the highest remaining
  // importance band, making lower-band replacement impossible by construction.
  const remaining = records.filter((record) => record.eligible);
  const ranked = [];
  const usedSources = new Set();
  const usedSections = new Set();
  while (remaining.length) {
    const highestImportance = Math.max(...remaining.map((record) => record.importance));
    const band = remaining.filter((record) => record.importance === highestImportance);
    band.sort((left, right) => {
      const leftSourceBreadth = left.source && !usedSources.has(left.source) ? 1 : 0;
      const rightSourceBreadth = right.source && !usedSources.has(right.source) ? 1 : 0;
      const leftSectionBreadth = left.section && !usedSections.has(left.section) ? 1 : 0;
      const rightSectionBreadth = right.section && !usedSections.has(right.section) ? 1 : 0;
      return Number(right.scheduledMatch) - Number(left.scheduledMatch)
        || right.tags.length - left.tags.length
        || rightSourceBreadth - leftSourceBreadth
        || rightSectionBreadth - leftSectionBreadth
        || right.time - left.time
        || compareText(left.id, right.id)
        || left.inputIndex - right.inputIndex;
    });
    const next = band[0];
    remaining.splice(remaining.indexOf(next), 1);
    next.rank = ranked.length + 1;
    ranked.push(next);
    if (next.source) usedSources.add(next.source);
    if (next.section) usedSections.add(next.section);
  }

  const selectedRecords = [];
  for (const record of ranked) {
    if (selectedRecords.length < softFloor) {
      record.selected = true;
      record.reason = 'selected:core';
      selectedRecords.push(record);
      continue;
    }
    if (selectedRecords.length >= cap) {
      record.reason = 'not-selected:cap-reached';
      continue;
    }
    const earnedByImportance = record.importance >= 6;
    const earnedByInterest = record.tags.length > 0;
    if (!earnedByImportance && !earnedByInterest && !record.scheduledMatch) {
      record.reason = 'not-selected:extension-not-earned';
      continue;
    }
    record.selected = true;
    record.reason = earnedByImportance
      ? 'selected:extension:importance'
      : record.scheduledMatch
        ? 'selected:extension:scheduled'
        : 'selected:extension:interest';
    selectedRecords.push(record);
  }

  const receipt = records.map((record) => ({
    id: record.id,
    rank: record.rank,
    selected: record.selected,
    reason: record.reason,
    effectiveImportance: record.importance,
    rawImportance: record.rawImportance,
    importanceProvenance: record.importanceProvenance,
    tags: [...record.tags],
    scheduledMatch: record.scheduledMatch,
    analysisState: record.analysis.state,
    analysisVersion: record.analysis.version,
    analysis: { ...record.analysis },
  }));

  return {
    selected: selectedRecords.map((record) => record.event),
    receipt,
  };
}

module.exports = {
  ANALYSIS_VERSION,
  analysisState,
  optionalAnalysis,
  selectDailyBrief,
};
