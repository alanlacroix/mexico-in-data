import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { candidateSignature, canReuseCuration } = require('../lib/curation-checkpoint.cjs');

const morning = [{ url: 'https://example.com/a', published_at: '2026-08-18T12:00:00Z', title: 'Morning report', dek: 'A complete sentence.' }];
const later = [...morning, { url: 'https://example.com/b', published_at: '2026-08-18T15:00:00Z', title: 'Later report', dek: 'Another complete sentence.' }];
const receipt = {
  editorialDate: '2026-08-18', complete: true, candidateSig: candidateSignature(morning),
};

assert.equal(canReuseCuration(receipt, '2026-08-18', candidateSignature(morning)), true);
assert.equal(canReuseCuration(receipt, '2026-08-18', candidateSignature(later)), false,
  'new reporting must invalidate a complete morning checkpoint');
assert.equal(canReuseCuration({ ...receipt, candidateSig: '' }, '2026-08-18', candidateSignature(morning)), false,
  'legacy checkpoints without a source signature must be reassessed once');
assert.equal(candidateSignature(morning), candidateSignature([...morning].reverse()),
  'candidate order must not create false invalidations');

console.log('curation-checkpoint tests: ok');
