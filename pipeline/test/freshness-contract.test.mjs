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

console.log('freshness-contract tests: ok');
