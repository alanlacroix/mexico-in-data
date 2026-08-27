'use strict';

const clean = (value) => String(value || '').trim();

function editionWindowAssessment(receipt) {
  return /^edition-window-assessment-v(?:2|3)$/.test(clean(receipt?.policy));
}

function curationReadiness(receipt, editorialDate, options = {}) {
  const date = clean(editorialDate);
  if (!receipt || typeof receipt !== 'object') {
    return options.allowMissing ? { ok: true, legacy: true, reason: '' }
      : { ok: false, legacy: false, reason: 'missing complete receipt' };
  }
  if (clean(receipt.editorialDate) !== date) {
    return { ok: false, legacy: false, reason: `receipt is for ${clean(receipt.editorialDate) || 'no date'}` };
  }
  if (receipt.complete !== true) {
    return { ok: false, legacy: false, reason: clean(receipt.reason) || 'fresh candidates were not fully assessed' };
  }
  // Decision coverage is not publication readiness. On Aug. 27 every model row had
  // a decision, but the only selected current-day facts failed the copy gate. Calling
  // that complete turned a processing failure into “No major developments.”
  if (editionWindowAssessment(receipt)) {
    if (Number(receipt.selectedCount) !== Number(receipt.keptCount) + Number(receipt.rejectedCount)) {
      return { ok: false, legacy: false, reason: 'selected-report accounting does not reconcile' };
    }
    if (Number(receipt.freshSelectedCount) !== Number(receipt.freshKeptCount) + Number(receipt.freshRejectedCount)) {
      return { ok: false, legacy: false, reason: 'current-day selected-report accounting does not reconcile' };
    }
    // An exhaustive current-day ledger is required before claiming a quiet day. It is
    // not required to publish factual stories that did clear the bounded review. The
    // final Brief gate below owns the stricter empty-edition invariant.
    if (Number(receipt.unassessedFreshCandidateCount) > 0
        && Number(receipt.freshKeptCount) === 0) {
      return { ok: false, legacy: false, reason: `${Number(receipt.unassessedFreshCandidateCount)} current-day candidate(s) did not enter the bounded assessment` };
    }
    if (Number(receipt.freshRejectedCount) > 0) {
      return { ok: false, legacy: false, reason: `${Number(receipt.freshRejectedCount)} selected current-day report(s) did not clear the final copy gate` };
    }
    if (clean(receipt.mode) === 'deterministic-fallback'
        && Number(receipt.freshCandidateCount) > 0
        && Number(receipt.freshKeptCount) === 0) {
      return { ok: false, legacy: false, reason: 'fresh reporting exists but could not be resolved without the model' };
    }
    if (receipt.currentDayResolved !== true && Number(receipt.freshKeptCount) === 0) {
      return { ok: false, legacy: false, reason: clean(receipt.reason) || 'the current-day candidate ledger is unresolved' };
    }
  }
  // A model-free pass may safely certify a genuinely empty feed, or publish facts it
  // could process. It may not turn unreadable fresh reporting into an editorial claim
  // that nothing happened. That exact false success produced the empty Aug. 24 Brief.
  if (clean(receipt.mode) === 'deterministic-fallback'
      && Number(receipt.freshCandidateCount) > 0
      && Number(editionWindowAssessment(receipt)
        ? receipt.freshKeptCount : receipt.keptCount) === 0) {
    return { ok: false, legacy: false, reason: 'fresh reporting exists but could not be resolved without the model' };
  }
  return { ok: true, legacy: false, reason: '' };
}

module.exports = { curationReadiness, editionWindowAssessment };
