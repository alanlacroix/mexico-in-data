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
const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const sentences = (value) => [...sentenceSegmenter.segment(clean(value))]
  .map((part) => sentence(part.segment))
  .filter(Boolean);

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
function contextDigest(items, { maxWords = 105, maxSentences = 5 } = {}) {
  const rows = (Array.isArray(items) ? items : []).map((item) => ({
    title: sentence(item && (item.title || item.headline)),
    context: sentences(item && item.context),
  })).filter((item) => item.title || item.context.length);
  if (!rows.length) return '';

  const units = rows.map((row) => row.title || row.context.shift());
  let count = words(units.join(' '));
  let sentenceCount = units.filter(Boolean).length;
  const contextDepth = Math.max(0, ...rows.map((row) => row.context.length));
  // Add one fact per story before giving any story a second sentence. That keeps a
  // multi-story opening balanced and prevents the lead card from consuming the cap.
  for (let depth = 0; depth < contextDepth; depth += 1) {
    for (let index = 0; index < rows.length; index += 1) {
      const { title, context } = rows[index];
      const extraSentence = context[depth];
      if (!extraSentence || normalized(title) === normalized(extraSentence)) continue;
      const extra = words(extraSentence);
      if (count + extra > maxWords || sentenceCount + 1 > maxSentences) continue;
      units[index] = `${units[index]} ${extraSentence}`;
      count += extra;
      sentenceCount += 1;
    }
  }
  return units.join(' ');
}

function isHeadlineOnly(summary, items) {
  return normalized(summary) === normalized(headlineDigest(items));
}

module.exports = { contextDigest, headlineDigest, isHeadlineOnly };
