'use strict';

const clean = (value) => String(value || '').trim();

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
  // A model-free pass may safely certify a genuinely empty feed, or publish facts it
  // could process. It may not turn unreadable fresh reporting into an editorial claim
  // that nothing happened. That exact false success produced the empty Aug. 24 Brief.
  if (clean(receipt.mode) === 'deterministic-fallback'
      && Number(receipt.freshCandidateCount) > 0
      && Number(receipt.keptCount) === 0) {
    return { ok: false, legacy: false, reason: 'fresh reporting exists but could not be resolved without the model' };
  }
  return { ok: true, legacy: false, reason: '' };
}

module.exports = { curationReadiness };
