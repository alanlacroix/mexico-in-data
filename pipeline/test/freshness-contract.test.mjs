import assert from 'node:assert/strict';
import freshness from '../lib/freshness-contract.cjs';

const { curationReadiness } = freshness;

assert.deepEqual(curationReadiness(null, '2026-08-14'), {
  ok: false, legacy: false, reason: 'missing complete receipt',
});
assert.equal(curationReadiness(null, '2026-08-14', { allowMissing: true }).ok, true,
  'the one legacy artifact deployed before this contract must remain buildable');

let result = curationReadiness({
  editorialDate: '2026-08-14', complete: false,
  freshCandidateCount: 5, assessedCount: 0,
  reason: 'fresh candidates were not assessed by the curator',
}, '2026-08-14');
assert.equal(result.ok, false, 'an API or budget failure must not advance the edition date');
assert.match(result.reason, /not assessed/);

result = curationReadiness({ editorialDate: '2026-08-13', complete: true }, '2026-08-14');
assert.equal(result.ok, false, 'yesterday’s success cannot certify today’s edition');

result = curationReadiness({
  editorialDate: '2026-08-14', complete: true,
  freshCandidateCount: 24, assessedCount: 24,
}, '2026-08-14');
assert.equal(result.ok, true, 'one exhaustive exact-day receipt may certify the edition');

result = curationReadiness({
  editorialDate: '2026-08-14', complete: true,
  mode: 'deterministic-fallback', freshCandidateCount: 4, assessedCount: 4, keptCount: 0,
}, '2026-08-14');
assert.equal(result.ok, false,
  'unresolved fresh reporting must not be relabelled as a quiet editorial day');
assert.match(result.reason, /could not be resolved/);

result = curationReadiness({
  editorialDate: '2026-08-14', complete: true,
  mode: 'deterministic-fallback', freshCandidateCount: 0, assessedCount: 4, keptCount: 0,
}, '2026-08-14');
assert.equal(result.ok, true, 'a fallback may certify quiet only when there is no fresh reporting');

result = curationReadiness({
  editorialDate: '2026-08-14', complete: true,
  mode: 'deterministic-fallback', freshCandidateCount: 2, assessedCount: 4, keptCount: 1,
}, '2026-08-14');
assert.equal(result.ok, true, 'a fallback may certify an edition when it retained a fresh report');

result = curationReadiness({
  policy: 'edition-window-assessment-v2', editorialDate: '2026-08-14', complete: true,
  mode: 'deterministic-fallback', freshCandidateCount: 2, eligibleFreshCandidateCount: 2,
  selectedCount: 1, keptCount: 1, rejectedCount: 0,
  freshSelectedCount: 0, freshKeptCount: 0,
  unassessedFreshCandidateCount: 0, freshRejectedCount: 0, currentDayResolved: false,
}, '2026-08-14');
assert.equal(result.ok, false,
  'an accepted prior-day fallback item must not falsely certify unresolved current-day reporting');
assert.match(result.reason, /could not be resolved/);

result = curationReadiness({
  policy: 'edition-window-assessment-v3', editorialDate: '2026-08-14', complete: true,
  freshCandidateCount: 5, eligibleFreshCandidateCount: 5,
  selectedCount: 1, keptCount: 0, rejectedCount: 1,
  freshSelectedCount: 1, freshKeptCount: 0,
  unassessedFreshCandidateCount: 0, freshRejectedCount: 1, currentDayResolved: false,
}, '2026-08-14');
assert.equal(result.ok, false, 'a selected current-day fact rejected by the copy gate must never become a quiet success');
assert.match(result.reason, /final copy gate/);

result = curationReadiness({
  policy: 'edition-window-assessment-v2', editorialDate: '2026-08-14', complete: true,
  freshCandidateCount: 5, eligibleFreshCandidateCount: 7,
  selectedCount: 0, keptCount: 0, rejectedCount: 0,
  freshSelectedCount: 0, freshKeptCount: 0,
  unassessedFreshCandidateCount: 2, freshRejectedCount: 0, currentDayResolved: false,
}, '2026-08-14');
assert.equal(result.ok, false, 'uncapped same-day reporting must not disappear behind the input cap');
assert.match(result.reason, /did not enter/);

result = curationReadiness({
  policy: 'edition-window-assessment-v2', editorialDate: '2026-08-14', complete: true,
  mode: 'model', freshCandidateCount: 24, eligibleFreshCandidateCount: 45,
  selectedCount: 8, keptCount: 8, rejectedCount: 0,
  freshSelectedCount: 8, freshKeptCount: 8,
  unassessedFreshCandidateCount: 21, freshRejectedCount: 0, currentDayResolved: false,
}, '2026-08-14');
assert.equal(result.ok, true,
  'accepted current-day facts may publish even when lower-priority reporting remains outside the bounded batch');

result = curationReadiness({
  policy: 'edition-window-assessment-v2', editorialDate: '2026-08-14', complete: true,
  freshCandidateCount: 5, eligibleFreshCandidateCount: 5,
  selectedCount: 1, keptCount: 1, rejectedCount: 0,
  freshSelectedCount: 1, freshKeptCount: 1,
  unassessedFreshCandidateCount: 0, freshRejectedCount: 0, currentDayResolved: true,
}, '2026-08-14');
assert.equal(result.ok, true, 'the current evidence-fidelity policy may certify a fully resolved current-day ledger');

console.log('freshness-contract tests: ok');
