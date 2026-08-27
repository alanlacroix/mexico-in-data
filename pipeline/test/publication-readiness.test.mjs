import assert from 'node:assert/strict';
import { publicationReadiness } from '../check-publication-readiness.mjs';

const empty = publicationReadiness({ meta: { editorialDate: '2026-08-17', quiet: true }, lead: null, items: [] }, '2026-08-17');
assert.equal(empty.publish, true);
assert.equal(empty.storyCount, 0);
assert.match(empty.reason, /current dated quiet edition/);

const falseQuiet = publicationReadiness(
  { meta: { editorialDate: '2026-08-17', quiet: true }, lead: null, items: [] },
  '2026-08-17',
  { curation: {
    policy: 'edition-window-assessment-v5', currentDayResolved: false,
    freshRejectedCount: 1, unassessedFreshCandidateCount: 0,
  } },
);
assert.equal(falseQuiet.publish, false, 'an unresolved selected fact must contradict, not certify, a quiet edition');
assert.match(falseQuiet.reason, /contradicted/);

const ambiguousEmpty = publicationReadiness({ meta: { editorialDate: '2026-08-17' }, lead: null, items: [] }, '2026-08-17');
assert.equal(ambiguousEmpty.publish, false, 'only an explicit quiet edition may publish without stories');

const complete = publicationReadiness({
  meta: { editorialDate: '2026-08-17', selection: { policy: 'exact-day-plus-carryover-v1' } },
  lead: { headline: 'A sourced development', lane: 'today', date: '2026-08-17' },
  items: [],
}, '2026-08-17');
assert.equal(complete.publish, true);
assert.equal(complete.storyCount, 1);
assert.equal(complete.todayCount, 1);

const factualFromBoundedReview = publicationReadiness({
  meta: { editorialDate: '2026-08-17', selection: { policy: 'exact-day-plus-carryover-v1' } },
  lead: { headline: 'A selected current-day fact', lane: 'today', date: '2026-08-17' },
  items: [],
}, '2026-08-17', { curation: {
    policy: 'edition-window-assessment-v5', currentDayResolved: false,
  freshKeptCount: 8, freshRejectedCount: 0, unassessedFreshCandidateCount: 21,
} });
assert.equal(factualFromBoundedReview.publish, true,
  'ledger completeness is an empty-edition requirement, not a reason to suppress accepted facts');

const carryoverOnly = publicationReadiness({
  meta: { editorialDate: '2026-08-18', selection: { policy: 'exact-day-plus-carryover-v1' } },
  lead: { headline: 'Yesterday remains important', lane: 'key-development', date: '2026-08-17' },
  items: [],
}, '2026-08-18');
assert.equal(carryoverOnly.publish, true);
assert.equal(carryoverOnly.storyCount, 1);
assert.equal(carryoverOnly.todayCount, 0);
assert.match(carryoverOnly.reason, /one-day key developments/);

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
