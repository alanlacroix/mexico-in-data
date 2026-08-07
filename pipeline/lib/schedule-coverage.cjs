'use strict';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const rows = (value) => Array.isArray(value?.events) ? value.events : Array.isArray(value) ? value : [];

function validateScheduleCoverage(document, editorialDate) {
  const errors = [];
  if (!ISO_DAY.test(String(editorialDate || ''))) return ['editorial date is invalid'];
  const policy = document?.meta?.coveragePolicy;
  if (!policy || typeof policy !== 'object') return ['coveragePolicy is missing'];
  const minimumForwardDays = Number(policy.minimumForwardDays);
  const minimumFutureOccurrences = Number(policy.minimumFutureOccurrences);
  if (!Number.isInteger(minimumForwardDays) || minimumForwardDays < 1) errors.push('minimumForwardDays must be a positive integer');
  if (!Number.isInteger(minimumFutureOccurrences) || minimumFutureOccurrences < 1) errors.push('minimumFutureOccurrences must be a positive integer');
  if (!Array.isArray(policy.streams) || !policy.streams.length) return [...errors, 'coveragePolicy streams are missing'];

  const current = Date.parse(`${editorialDate}T12:00:00Z`);
  const horizon = current + Math.max(0, minimumForwardDays || 0) * 86_400_000;
  for (const stream of policy.streams) {
    const key = String(stream?.key || '').trim() || 'unnamed';
    const prefix = String(stream?.idPrefix || '').trim();
    if (!prefix) { errors.push(`${key}: idPrefix is missing`); continue; }
    if (!/^https?:\/\//i.test(String(stream.sourceUrl || ''))) errors.push(`${key}: official source URL is missing`);
    const future = rows(document).filter((event) => event?.outcomeRequired === true
      && String(event.id || '').startsWith(prefix)
      && ISO_DAY.test(String(event.date || ''))
      && event.date > editorialDate).sort((a, b) => a.date.localeCompare(b.date));
    if (future.length < minimumFutureOccurrences) {
      errors.push(`${key}: only ${future.length} future obligations remain; need ${minimumFutureOccurrences}`);
    }
    const last = future.at(-1);
    if (!last || Date.parse(`${last.date}T12:00:00Z`) < horizon) {
      errors.push(`${key}: calendar ends before the ${minimumForwardDays}-day forward horizon`);
    }
  }
  return errors;
}

module.exports = { validateScheduleCoverage };
