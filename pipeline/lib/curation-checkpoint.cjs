'use strict';

const { createHash } = require('node:crypto');

const clean = (value) => String(value || '').trim();

// A checkpoint is reusable only while the eligible source universe is identical.
// New reporting must invalidate the morning assessment, even when that assessment
// was technically complete, so an hourly retry can see stories published later.
function candidateSignature(candidates) {
  const rows = (Array.isArray(candidates) ? candidates : []).map((candidate) => [
    clean(candidate && candidate.url),
    clean(candidate && (candidate.published_at || candidate.publishedAt)),
    clean(candidate && candidate.title),
    clean(candidate && candidate.dek),
    clean(candidate && candidate._scheduled && candidate._scheduled.id),
  ]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function canReuseCuration(receipt, editorialDate, signature, policy = '') {
  return Boolean(receipt
    && receipt.editorialDate === editorialDate
    && receipt.complete === true
    && (!clean(policy) || receipt.policy === policy)
    && clean(receipt.candidateSig)
    && receipt.candidateSig === signature);
}

module.exports = { candidateSignature, canReuseCuration };
