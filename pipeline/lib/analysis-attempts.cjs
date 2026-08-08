'use strict';

const text = (value) => String(value || '').trim();

function mergeApprovedAttempt(previous = {}, proposed = {}, fields = []) {
  const merged = {};
  for (const field of fields) {
    const value = text(proposed[field]) || text(previous[field]);
    if (value) merged[field] = value;
  }
  return merged;
}

module.exports = { mergeApprovedAttempt };
