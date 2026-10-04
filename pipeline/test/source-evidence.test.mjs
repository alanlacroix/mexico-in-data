import assert from 'node:assert/strict';
import { MAX_ARTICLE_EVIDENCE_BYTES, shapeEvidenceRecord } from '../lib/source-evidence.mjs';
import { plainSourceName } from '../lib/plain-language.cjs';

const input = {
  id: ' article ',
  kind: ' article-body ',
  source: ' INEGI ',
  url: ' https://www.inegi.org.mx/example ',
  text: '  First paragraph.\n\nSecond  paragraph.  ',
};
const before = structuredClone(input);
assert.deepEqual(shapeEvidenceRecord(input), {
  id: 'article',
  kind: 'article-body',
  source: plainSourceName('INEGI'),
  url: 'https://www.inegi.org.mx/example',
  text: 'First paragraph.\n\nSecond  paragraph.',
}, 'metadata is normalized without rewriting internal source whitespace');
assert.deepEqual(input, before, 'shaping must not mutate the supplied source');

for (const kind of ['article-body', 'prior-article-body']) {
  const caveat = ' Relief applies only after both conditions are met and never retroactively.';
  const complete = 'The measure describes eligibility. '.repeat(100) + caveat;
  assert.ok(complete.indexOf(caveat) > 2200);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: complete }).text, complete,
    `${kind} retains the complete tail caveat beyond the former excerpt boundary`);

  const metadataBytes = Buffer.byteLength(JSON.stringify(shapeEvidenceRecord({ ...input, kind, text: '' })), 'utf8');
  const availableBytes = MAX_ARTICLE_EVIDENCE_BYTES - metadataBytes;
  const asciiBoundary = 'x'.repeat(availableBytes);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: asciiBoundary }).text, asciiBoundary,
    `${kind} accepts a serialized record exactly at the byte limit`);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: asciiBoundary + 'x' }), null,
    `${kind} rejects an oversized source rather than returning an excerpt`);

  const multibyteBoundary = 'é'.repeat(Math.floor(availableBytes / 2)) + 'x'.repeat(availableBytes % 2);
  assert.equal(Buffer.byteLength(multibyteBoundary, 'utf8') + metadataBytes, MAX_ARTICLE_EVIDENCE_BYTES);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: `  ${multibyteBoundary}\n` }).text, multibyteBoundary,
    `${kind} measures UTF-8 bytes after trimming outer whitespace`);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: multibyteBoundary + 'x' }), null,
    `${kind} rejects one byte over the limit even with fewer than 16,384 characters`);
  const supplementaryBoundary = '🌎'.repeat(Math.floor(availableBytes / 4)) + 'x'.repeat(availableBytes % 4);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: supplementaryBoundary }).text, supplementaryBoundary,
    `${kind} preserves complete supplementary Unicode characters`);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: supplementaryBoundary + '🌎' }), null);
  const escapedBoundary = '"'.repeat(Math.floor(availableBytes / 2)) + 'x'.repeat(availableBytes % 2);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: escapedBoundary }).text, escapedBoundary,
    `${kind} includes JSON escaping in its byte measurement`);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: escapedBoundary + 'x' }), null);
  assert.equal(shapeEvidenceRecord({ ...input, kind, url: 'x'.repeat(MAX_ARTICLE_EVIDENCE_BYTES), text: 'Short body.' }), null,
    `${kind} includes metadata in its byte bound`);
}

for (const kind of ['article', 'coverage', 'standing', 'calendar']) {
  const text = 'x'.repeat(2300);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text }).text, text.slice(0, 2200),
    `${kind} retains the existing non-body snippet contract`);
}

assert.deepEqual(shapeEvidenceRecord({}), { id: '', kind: '', source: '', url: '', text: '' },
  'the helper preserves existing empty-value normalization; admission belongs to the caller');

console.log('source-evidence tests: ok');
