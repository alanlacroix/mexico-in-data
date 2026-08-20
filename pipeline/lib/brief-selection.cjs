'use strict';

// Daily Brief selection is deliberately separate from story analysis.
// A factual, publishable event competes on editorial importance even when its
// Briefly Explained unit is missing, incomplete, or still awaiting approval.

const DEFAULT_MIN_IMPORTANCE = 5;
const DEFAULT_SOFT_FLOOR = 3;
const DEFAULT_CAP = 5;
const DEFAULT_CARRYOVER_MIN_IMPORTANCE = 6;
const WEEKEND_RECAP_MIN_IMPORTANCE = 6;
// v9 adds separately retained context beyond the original article plus an independent claim audit.
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
    && event.analysisSources.some((source) => source && source.kind !== 'article'
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

function previousDay(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(iso))) return '';
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function addDays(iso, amount) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(iso))) return '';
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekDates(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(iso))) {
    return { weekend: false, weekStartDate: '', weekendStartDate: '' };
  }
  const date = new Date(`${iso}T12:00:00Z`);
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const weekStartDate = addDays(iso, -daysSinceMonday);
  return {
    weekend: day === 0 || day === 6,
    weekStartDate,
    weekendStartDate: addDays(weekStartDate, 5),
  };
}

function rankedLaneRows(selection, lane, selected) {
  const globalRank = new Map(selected.map((event, index) => [receiptId(event, index), index + 1]));
  return selection.receipt.map((row) => ({
    ...row,
    lane,
    laneRank: row.rank,
    rank: row.selected ? globalRank.get(row.id) || row.rank : null,
  }));
}

/**
 * The weekend edition is a catch-up product, not an empty daily feed.
 *
 * Developments dated Saturday or Sunday get first access to the same five-story
 * cap used on weekdays. Remaining slots go to importance-6+ developments dated
 * Monday through Friday. Every candidate retains its real event date and the two
 * lanes make the presentation explicit: new this weekend, then what mattered.
 */
function selectWeekendBrief(candidates, options = {}) {
  const events = Array.isArray(candidates) ? candidates : [];
  const editorialDate = clean(options.editorialDate);
  const dates = weekDates(editorialDate);
  const cap = Math.max(0, Math.floor(finiteNumber(options.cap, DEFAULT_CAP)));
  const dateOf = typeof options.dateOf === 'function'
    ? options.dateOf : (event) => clean(event && event.date);
  const shared = { ...options };
  delete shared.editorialDate;
  delete shared.dateOf;
  delete shared.carryoverMinImportance;
  delete shared.weekendRecapMinImportance;

  const inWindow = (event) => {
    const date = dateOf(event);
    return date >= dates.weekStartDate && date <= editorialDate;
  };
  const newThisWeekend = selectDailyBrief(events.filter((event) => {
    const date = dateOf(event);
    return inWindow(event) && date >= dates.weekendStartDate;
  }), {
    ...shared,
    cap,
    softFloor: Math.min(cap, Math.max(0, Math.floor(finiteNumber(options.softFloor, DEFAULT_SOFT_FLOOR)))),
  });
  const remaining = Math.max(0, cap - newThisWeekend.selected.length);
  const weekRecap = selectDailyBrief(events.filter((event) => {
    const date = dateOf(event);
    return inWindow(event) && date < dates.weekendStartDate;
  }), {
    ...shared,
    minImportance: finiteNumber(options.weekendRecapMinImportance, WEEKEND_RECAP_MIN_IMPORTANCE),
    softFloor: 0,
    cap: remaining,
  });

  const selected = [...newThisWeekend.selected, ...weekRecap.selected];
  const receipt = [
    ...rankedLaneRows(newThisWeekend, 'weekend', selected),
    ...rankedLaneRows(weekRecap, 'week-recap', selected),
  ];
  return {
    selected,
    receipt,
    policy: 'weekend-recap-v1',
    editorialDate,
    weekStartDate: dates.weekStartDate,
    weekendStartDate: dates.weekendStartDate,
    counts: {
      weekend: newThisWeekend.selected.length,
      weekRecap: weekRecap.selected.length,
      total: selected.length,
    },
  };
}

/**
 * Build one five-story edition without blurring the dateline.
 *
 * Exact-day developments get first access to the edition. Only consequential
 * stories from the immediately preceding day may fill unused slots. Keeping the
 * two lanes in one locked selection means Briefly Explained still targets every
 * visible story while the homepage can label each lane honestly.
 */
function selectEditionBrief(candidates, options = {}) {
  const events = Array.isArray(candidates) ? candidates : [];
  const editorialDate = clean(options.editorialDate);
  if (weekDates(editorialDate).weekend) return selectWeekendBrief(events, options);
  const carryoverDate = previousDay(editorialDate);
  const cap = Math.max(0, Math.floor(finiteNumber(options.cap, DEFAULT_CAP)));
  const dateOf = typeof options.dateOf === 'function'
    ? options.dateOf : (event) => clean(event && event.date);
  const shared = { ...options };
  delete shared.editorialDate;
  delete shared.dateOf;
  delete shared.carryoverMinImportance;

  const today = selectDailyBrief(events.filter((event) => dateOf(event) === editorialDate), {
    ...shared,
    cap,
    softFloor: Math.min(cap, Math.max(0, Math.floor(finiteNumber(options.softFloor, DEFAULT_SOFT_FLOOR)))),
  });
  // Prior-day context may extend a real current edition, but it may never become the
  // edition by itself. If nothing from today clears the bar, publish an honest quiet
  // state instead of building a new dateline out of yesterday's stories.
  const remaining = today.selected.length ? Math.max(0, cap - today.selected.length) : 0;
  const carryover = selectDailyBrief(events.filter((event) => dateOf(event) === carryoverDate), {
    ...shared,
    minImportance: finiteNumber(options.carryoverMinImportance, DEFAULT_CARRYOVER_MIN_IMPORTANCE),
    softFloor: 0,
    cap: remaining,
  });

  const selected = [...today.selected, ...carryover.selected];
  const globalRank = new Map(selected.map((event, index) => [receiptId(event, index), index + 1]));
  const receipt = [
    ...today.receipt.map((row) => ({
      ...row,
      lane: 'today',
      laneRank: row.rank,
      rank: row.selected ? globalRank.get(row.id) : null,
    })),
    ...carryover.receipt.map((row) => ({
      ...row,
      lane: 'key-development',
      laneRank: row.rank,
      rank: row.selected ? globalRank.get(row.id) : null,
    })),
  ];

  return {
    selected,
    receipt,
    policy: 'exact-day-plus-carryover-v1',
    editorialDate,
    carryoverDate,
    counts: {
      today: today.selected.length,
      keyDevelopments: carryover.selected.length,
      total: selected.length,
    },
  };
}

module.exports = {
  ANALYSIS_VERSION,
  analysisState,
  optionalAnalysis,
  selectDailyBrief,
  selectEditionBrief,
  selectWeekendBrief,
  weekDates,
};
