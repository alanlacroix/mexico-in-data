import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { reconcileExpectedOutcomes } = require('../lib/expected-outcomes.cjs');

const RATE_DECISION_ID = 'banxico-policy-decision-2026-08-06';
const rateDecision = {
  id: RATE_DECISION_ID,
  date: '2026-08-06',
  label: 'Banxico monetary-policy decision',
  outcomeRequired: true,
  approx: false,
};

let result = reconcileExpectedOutcomes({
  schedule: [rateDecision],
  events: [],
  editorialDate: '2026-08-06',
});
assert.equal(result.items[0].status, 'pending', 'a required outcome remains pending on its event day');
assert.equal(result.items[0].hardBlock, false, 'an event-day outcome must not block a brief before the result arrives');
assert.equal(result.ok, true);

const rateHold = {
  id: 'n-banxico-holds-rate-2026-08-06',
  scheduledEventId: RATE_DECISION_ID,
  date: '2026-08-06',
  title: 'Banxico holds benchmark rate at 6.50 percent',
  value: 6.5,
  prev_value: 6.5,
};
result = reconcileExpectedOutcomes({
  schedule: { events: [rateDecision] },
  events: { events: [rateHold] },
  editorialDate: '2026-08-06',
});
assert.equal(result.items[0].status, 'satisfied', 'a zero-change decision is still a reported outcome');
assert.equal(result.items[0].matchedEvent, rateHold, 'the exact scheduledEventId must close the expected outcome');
assert.equal(result.satisfied.length, 1);

result = reconcileExpectedOutcomes({
  schedule: [rateDecision],
  events: [],
  priorOutcomes: [{
    id: RATE_DECISION_ID,
    date: '2026-08-06',
    status: 'satisfied',
    matchedEventId: rateHold.id,
    evidence: [{ kind: 'curated-report', source: 'Banco de México', url: 'https://banxico.example/decision' }],
  }],
  editorialDate: '2026-08-21',
});
assert.equal(result.items[0].status, 'satisfied', 'a certified outcome must not become missing when its event rolls out of the capped log');
assert.equal(result.items[0].matchedEvent, null);
assert.equal(result.items[0].priorOutcome.matchedEventId, rateHold.id);
assert.equal(result.blockers.length, 0);

result = reconcileExpectedOutcomes({
  schedule: [rateDecision],
  events: [],
  priorOutcomes: [{
    id: RATE_DECISION_ID,
    date: '2026-08-05',
    status: 'satisfied',
    matchedEventId: rateHold.id,
    evidence: [{ kind: 'curated-report', url: 'https://banxico.example/old-decision' }],
  }],
  editorialDate: '2026-08-21',
});
assert.equal(result.items[0].status, 'missing', 'a reused ID or corrected calendar date cannot inherit satisfaction from another day');
assert.equal(result.blockers.length, 1);

result = reconcileExpectedOutcomes({
  schedule: [rateDecision],
  events: [],
  priorOutcomes: [{
    id: RATE_DECISION_ID,
    date: '2026-08-06',
    status: 'satisfied',
    matchedEventId: rateHold.id,
    evidence: [],
  }],
  editorialDate: '2026-08-21',
});
assert.equal(result.items[0].status, 'missing', 'a prior status without linked evidence is not a durable certification');

const commentary = {
  id: 'n-banxico-commentary-2026-08-07',
  date: '2026-08-07',
  title: 'Banxico and the Federal Reserve chart divergent paths on interest rates',
  source: 'Commentary outlet',
};
result = reconcileExpectedOutcomes({
  schedule: [rateDecision],
  events: [commentary],
  editorialDate: '2026-08-07',
});
assert.equal(result.items[0].status, 'missing', 'similar Banxico language must not satisfy a schedule item');
assert.equal(result.items[0].matchedEvent, null);
assert.equal(result.blockers.length, 1, 'a required prior-day outcome must block when no explicitly linked event exists');
assert.equal(result.ok, false);

const exactButWrongId = {
  ...rateHold,
  scheduledEventId: 'banxico-policy-decision-2026-09-24',
};
result = reconcileExpectedOutcomes({
  schedule: [rateDecision],
  events: [exactButWrongId],
  editorialDate: '2026-08-07',
});
assert.equal(result.items[0].status, 'missing', 'even an identical headline and value must not override a different event id');

const softSchedule = [
  {
    id: 'banxico-expectations-2026-08',
    date: '2026-08-03',
    label: 'Banxico Survey of Expectations',
    outcomeRequired: true,
    approx: true,
  },
  {
    id: 'usmca-review-watch-2026',
    date: '2026-08-04',
    label: 'USMCA review watch',
    outcomeRequired: true,
    watch: true,
  },
  {
    id: 'fdi-watch-2026-h1',
    date: '2026-08-05',
    label: 'Foreign direct investment watch',
  },
];
result = reconcileExpectedOutcomes({
  schedule: softSchedule,
  events: [],
  editorialDate: '2026-08-07',
});
assert.deepEqual(result.items.map((item) => item.status), ['pending', 'pending', 'pending']);
assert.ok(result.items.every((item) => item.hardBlock === false), 'approximate and watch entries must never hard-block');
assert.equal(result.blockers.length, 0);
assert.equal(result.ok, true);

result = reconcileExpectedOutcomes({
  schedule: [{
    id: 'inegi-cpi-2026-08-07',
    date: '2026-08-07',
    label: 'INEGI CPI',
    outcomeRequired: true,
  }],
  events: [],
  editorialDate: '2026-08-06',
});
assert.equal(result.items[0].status, 'upcoming');

assert.throws(
  () => reconcileExpectedOutcomes({
    schedule: [{ date: '2026-08-06', outcomeRequired: true }],
    events: [],
    editorialDate: '2026-08-07',
  }),
  /stable id/,
  'a required outcome without a stable schedule id must fail loudly',
);

result = reconcileExpectedOutcomes({
  schedule: [{
    ...rateDecision,
    resolution: {
      status: 'postponed',
      source: 'Banco de México',
      url: 'https://authority.example/postponement',
      note: 'Meeting moved to a later date.',
    },
  }],
  events: [],
  editorialDate: '2026-08-07',
});
assert.equal(result.items[0].status, 'postponed', 'an evidenced postponement must resolve the old obligation without inventing an outcome');
assert.equal(result.items[0].hardBlock, false);
assert.equal(result.resolved.length, 1);
assert.equal(result.ok, true);

assert.throws(
  () => reconcileExpectedOutcomes({
    schedule: [{ ...rateDecision, resolution: { status: 'waived', source: 'Editor' } }],
    events: [],
    editorialDate: '2026-08-07',
  }),
  /linked evidence/,
  'a hand-waived obligation without a source link must not bypass the blocker',
);

console.log('expected-outcomes tests: ok');
