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
  return { ok: true, legacy: false, reason: '' };
}

module.exports = { curationReadiness };
