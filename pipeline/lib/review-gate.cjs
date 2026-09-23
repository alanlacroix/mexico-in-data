'use strict';
const path = require('node:path');

function publicationTarget({ dataDirectory, editorialDate, slot, requireReview = false }) {
  if (!requireReview) return { file: path.join(dataDirectory, 'edition.json'), state: 'published', publicationStatus: undefined };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(editorialDate || ''))) throw new Error('Invalid candidate editorial date');
  if (!['morning', 'noon'].includes(slot)) throw new Error('Invalid candidate slot');
  return {
    file: path.join(dataDirectory, 'candidates', `${editorialDate}-${slot}.json`),
    state: 'review-required', publicationStatus: 'candidate',
  };
}
module.exports = { publicationTarget };
