import assert from 'node:assert/strict';
import { publicationReadiness } from '../check-publication-readiness.mjs';

const empty = publicationReadiness({ meta: { editorialDate: '2026-08-17' }, lead: null, items: [] }, '2026-08-17');
assert.equal(empty.publish, false);
assert.equal(empty.storyCount, 0);
assert.match(empty.reason, /preserve the last complete edition/);

const complete = publicationReadiness({
  meta: { editorialDate: '2026-08-17' },
  lead: { headline: 'A sourced development' },
  items: [],
}, '2026-08-17');
assert.equal(complete.publish, true);
assert.equal(complete.storyCount, 1);

assert.throws(
  () => publicationReadiness({ meta: { editorialDate: '2026-08-16' }, lead: null, items: [] }, '2026-08-17'),
  /does not match/,
);

console.log('publication-readiness tests: ok');
