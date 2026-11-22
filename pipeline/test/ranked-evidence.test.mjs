import assert from 'node:assert/strict';
import { resolveRankedEvidence, rotateDeterministicRejects } from '../lib/ranked-evidence.mjs';
const date = '2026-11-13';
const rows = Array.from({ length: 30 }, (_, index) => ({ index, item: { _editorialDate: date } }));
const ready = row => row.evidence.length > 0;
async function check(eligible, extra = {}) {
  const calls = [];
  const result = await resolveRankedEvidence(rows, { editorialDate: date, ready,
    fetchEvidence: async row => { calls.push(row.index); return eligible.includes(row.index) ? ['complete-body'] : []; }, ...extra });
  return { calls, result };
}
let x = await check([6,7,8,9]);
assert.equal(x.calls.length,16); // next bounded batch, not arbitrary full crawl
assert.deepEqual(x.result.filter(ready).map(r=>r.index),[6,7,8,9]);
x = await check([0,1,2]); assert.equal(x.calls.length,8);
x = await check([25,26,27]); assert.equal(x.calls.length,24); assert.equal(x.result.filter(ready).length,0);
x = await check([0,1]); assert.equal(x.calls.length,24); // no padding
await assert.rejects(resolveRankedEvidence([{index:0,item:{_scheduled:{requiredForBrief:true}}},...rows],
  { editorialDate:date, ready, fetchEvidence:async row=>row.item._scheduled?[]:['body'] }),/required scheduled outcome/);
await assert.rejects(resolveRankedEvidence(rows,{editorialDate:date,ready,fetchEvidence:async()=>{throw Error('fetch failure');}}),/fetch failure/);
const dated = rows.map(r=>({...r,item:{_editorialDate:r.index===8?date:'2026-11-12'}}));
let calls = 0;
await resolveRankedEvidence(dated,{editorialDate:date,ready,fetchEvidence:async()=>{calls++;return ['body'];}});
// Date-sorted caller puts exact-day candidates first. Here first five stay prior
// day, so the helper must not claim sufficient exact-day coverage or exceed cap.
assert.equal(calls,24);
console.log('ranked evidence bounded fallback: ok');

const retryRows = ['mandatory', 'exact-rejected', 'exact-clean', 'prior-audit-flag', 'prior-clean']
  .map((id, index) => ({ index, item: { id, _editorialDate: index <= 2 ? date : '2026-11-12',
    ...(index === 0 ? { _scheduled: { requiredForBrief: true } } : {}) } }));
const diagnostics = [
  { stage: 'deterministic', storyId: 'mandatory' },
  { stage: 'deterministic', storyId: 'exact-rejected' },
  { stage: 'audit', storyId: 'prior-audit-flag' },
];
const retryOptions = { diagnostics, storyId: item => item.id, editorialDate: date };
const ids = list => list.map(row => row.item.id);
const weekdayRetry = rotateDeterministicRejects(retryRows, retryOptions);
assert.deepEqual(ids(weekdayRetry), ['mandatory', 'exact-clean', 'exact-rejected', 'prior-audit-flag', 'prior-clean']);
const weekendRetry = rotateDeterministicRejects(retryRows, { ...retryOptions, weekend: true });
assert.deepEqual(ids(weekendRetry), ['mandatory', 'exact-clean', 'prior-audit-flag', 'prior-clean', 'exact-rejected']);
assert.deepEqual(ids(retryRows), ['mandatory', 'exact-rejected', 'exact-clean', 'prior-audit-flag', 'prior-clean']);
assert.equal(rotateDeterministicRejects(retryRows, { ...retryOptions, diagnostics: [] }), retryRows);
const fallback = await resolveRankedEvidence(weekendRetry, {
  editorialDate: date, weekend: true, ready, batchSize: 2,
  fetchEvidence: async row => [0, 1, 2].includes(row.index) ? ['complete body'] : [],
});
assert.deepEqual(ids(fallback.filter(ready)), ['mandatory', 'exact-clean', 'exact-rejected']);
console.log('retry rotates known optional deterministic rejects without losing coverage: ok');
