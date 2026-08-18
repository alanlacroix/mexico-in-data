'use strict';

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const words = (value) => clean(value).split(/\s+/).filter(Boolean).length;
const sentence = (value) => {
  const text = clean(value);
  return text && !/[.!?]$/.test(text) ? `${text}.` : text;
};
const normalized = (value) => clean(value)
  .toLowerCase()
  .replace(/[^a-z0-9áéíóúñü%]+/g, ' ')
  .trim();

function headlineDigest(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => sentence(item && (item.title || item.headline)))
    .filter(Boolean)
    .join(' ');
}

// The no-model path still has to orient the reader. Start with every selected
// headline so no story disappears, then add the cards' already-audited factual
// context in rank order while the opening paragraph remains readable. This is
// deliberately extractive: it adds sourced context without inventing a connection.
function contextDigest(items, { maxWords = 105 } = {}) {
  const rows = (Array.isArray(items) ? items : []).map((item) => ({
    title: sentence(item && (item.title || item.headline)),
    context: sentence(item && item.context),
  })).filter((item) => item.title || item.context);
  if (!rows.length) return '';

  const units = rows.map((row) => row.title || row.context);
  let count = words(units.join(' '));
  for (let index = 0; index < rows.length; index += 1) {
    const { title, context } = rows[index];
    if (!title || !context || normalized(title) === normalized(context)) continue;
    const extra = words(context);
    if (count + extra > maxWords) continue;
    units[index] = `${title} ${context}`;
    count += extra;
  }
  return units.join(' ');
}

function isHeadlineOnly(summary, items) {
  return normalized(summary) === normalized(headlineDigest(items));
}

module.exports = { contextDigest, headlineDigest, isHeadlineOnly };
