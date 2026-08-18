import assert from 'node:assert/strict';
import { publicationReadiness } from '../check-publication-readiness.mjs';

const empty = publicationReadiness({ meta: { editorialDate: '2026-08-17' }, lead: null, items: [] }, '2026-08-17');
assert.equal(empty.publish, false);
assert.equal(empty.storyCount, 0);
assert.match(empty.reason, /preserve the last complete edition/);

const complete = publicationReadiness({
  meta: { editorialDate: '2026-08-17', selection: { policy: 'exact-day-plus-carryover-v1' } },
  lead: { headline: 'A sourced development', lane: 'today', date: '2026-08-17' },
  items: [],
}, '2026-08-17');
assert.equal(complete.publish, true);
assert.equal(complete.storyCount, 1);
assert.equal(complete.todayCount, 1);

const carryoverOnly = publicationReadiness({
  meta: { editorialDate: '2026-08-18', selection: { policy: 'exact-day-plus-carryover-v1' } },
  lead: { headline: 'Yesterday remains important', lane: 'key-development', date: '2026-08-17' },
  items: [],
}, '2026-08-18');
assert.equal(carryoverOnly.publish, false);
assert.equal(carryoverOnly.storyCount, 1);
assert.equal(carryoverOnly.todayCount, 0);
assert.match(carryoverOnly.reason, /no same-day stories/);

const weekendRecap = publicationReadiness({
  meta: { editorialDate: '2026-08-16', selection: { policy: 'weekend-recap-v1' } },
  lead: { headline: 'The week in context', lane: 'week-recap', date: '2026-08-14' },
  items: [],
}, '2026-08-16');
assert.equal(weekendRecap.publish, true, 'a clearly labelled weekend recap need not invent a Sunday story');

assert.throws(
  () => publicationReadiness({ meta: { editorialDate: '2026-08-16' }, lead: null, items: [] }, '2026-08-17'),
  /does not match/,
);

console.log('publication-readiness tests: ok');
