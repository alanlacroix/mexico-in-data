'use strict';

const crypto = require('node:crypto');

const SCHEMA_VERSION = 1;
const MAX_MODEL_CALLS = 3;
const MONTHLY_LIMIT_USD = 6;

const clean = (value) => String(value || '').trim();
const slotRank = (slot) => ({ morning: 1, noon: 2 }[slot] || 0);
const canonical = (value) => JSON.stringify(value, Object.keys(value || {}).sort());

function candidateSignature(candidates) {
  const rows = (Array.isArray(candidates) ? candidates : []).map((item) => ({
    id: clean(item.id),
    date: clean(item.date || item._editorialDate),
    publishedAt: clean(item.publishedAt || item.published_at),
    title: clean(item.title),
    dek: clean(item.dek),
    url: clean(item.url),
    scheduledId: clean(item._scheduled?.id || item.scheduledId),
  }));
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function readAttempts(value) {
  const attempts = Array.isArray(value?.attempts) ? value.attempts.filter(Boolean) : [];
  return { schemaVersion: SCHEMA_VERSION, attempts };
}

function slotAttempt(attempts, date, slot) {
  return readAttempts(attempts).attempts.find((row) => row.editorialDate === date && row.slot === slot);
}

function sameSignatureNoonNoop(attempts, date, signature, currentArtifactHash = '') {
  const morning = slotAttempt(attempts, date, 'morning');
  return Boolean(
    morning
    && morning.state === 'published'
    && /^[a-f0-9]{64}$/.test(clean(morning.artifactHash))
    && morning.artifactHash === clean(currentArtifactHash)
    && morning.candidateSignature === signature,
  );
}

function daysInMonth(date) {
  const [year, month] = clean(date).split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dailyLimit(date, monthlyLimit = MONTHLY_LIMIT_USD) {
  return Math.round((monthlyLimit / daysInMonth(date)) * 1e6) / 1e6;
}

function dateSpend(attempts, date) {
  return Math.round(readAttempts(attempts).attempts
    .filter((row) => row.editorialDate === date)
    .reduce((sum, row) => sum + (Number(row.costUSD) || 0), 0) * 1e6) / 1e6;
}

function beginAttempt(attempts, { editorialDate, slot, candidateSignature: signature, startedAt }) {
  const out = readAttempts(attempts);
  if (slotAttempt(out, editorialDate, slot)) throw new Error(`slot already attempted: ${editorialDate}/${slot}`);
  out.attempts.push({
    editorialDate,
    slot,
    candidateSignature: signature,
    state: 'started',
    startedAt,
    completedAt: '',
    calls: 0,
    costUSD: 0,
    artifactHash: '',
    reason: '',
  });
  out.attempts = out.attempts
    .filter((row) => row.editorialDate >= new Date(Date.parse(`${editorialDate}T12:00:00Z`) - 45 * 864e5).toISOString().slice(0, 10))
    .sort((a, b) => a.editorialDate.localeCompare(b.editorialDate) || slotRank(a.slot) - slotRank(b.slot));
  return out;
}

function finishAttempt(attempts, date, slot, patch) {
  const out = readAttempts(attempts);
  const row = out.attempts.find((item) => item.editorialDate === date && item.slot === slot);
  if (!row) throw new Error(`attempt not found: ${date}/${slot}`);
  Object.assign(row, patch);
  return out;
}

module.exports = {
  MAX_MODEL_CALLS,
  MONTHLY_LIMIT_USD,
  beginAttempt,
  candidateSignature,
  dateSpend,
  dailyLimit,
  finishAttempt,
  readAttempts,
  sameSignatureNoonNoop,
  slotAttempt,
};
