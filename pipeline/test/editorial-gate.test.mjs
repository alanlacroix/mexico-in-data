import assert from 'node:assert/strict';
import { editorialDecision } from '../editorial-gate.mjs';

const decide = (now, options = {}) => editorialDecision({ now: new Date(now), ...options });

// One product, one daily edition. Hourly attempts before 9 AM Eastern wait; the first
// attempt after 9 publishes regardless of when GitHub actually grants a runner.
let result = decide('2026-07-31T12:37:00Z');
assert.equal(result.run, false, 'an EDT attempt before 9 AM must wait');
assert.equal(result.slot, 'morning');

result = decide('2026-07-31T13:07:00Z');
assert.equal(result.run, true, 'the first due EDT occurrence must publish');
assert.equal(result.editorialDate, '2026-07-31');

result = decide('2026-07-31T14:07:00Z');
assert.equal(result.run, true, 'a later attempt must recover a missed EDT publication');

result = decide('2026-12-15T13:37:00Z');
assert.equal(result.run, false, 'an EST attempt before 9 AM must wait');

result = decide('2026-12-15T14:07:00Z');
assert.equal(result.run, true, 'the EST 9 AM occurrence must publish');
assert.equal(result.editorialDate, '2026-12-15');

const morningReceipt = { editorialDate: '2026-07-31', slot: 'morning', publicationId: 'run-1' };
result = decide('2026-07-31T13:37:00Z', { status: morningReceipt });
assert.equal(result.run, false, 'a same-day receipt must stop a duplicate edition');
assert.match(result.reason, /already published/);

result = decide('2026-07-31T14:37:00Z', {
  status: { ...morningReceipt, state: 'deferred', contentEditorialDate: '2026-07-30' },
});
assert.equal(result.run, true, 'a deferred check must keep retrying until a complete edition exists');

result = decide('2026-07-31T13:37:00Z', { status: morningReceipt, force: true });
assert.equal(result.run, true, 'the watchdog must be able to repair stale production');

result = decide('2026-07-31T13:37:00Z', {
  status: { ...morningReceipt, editorialDate: '2026-07-30' },
});
assert.equal(result.run, true, 'yesterday’s receipt must not block today’s edition');

const budgetBlock = { editorialDate: '2026-07-31', reason: 'selected-story analysis exhausted the monthly model allowance' };
result = decide('2026-07-31T14:37:00Z', {
  status: { ...morningReceipt, editorialDate: '2026-07-30' },
  terminalBlock: budgetBlock,
});
assert.equal(result.run, false, 'hourly schedules must not repeat a known terminal budget failure');
assert.match(result.reason, /monthly model allowance/);

result = decide('2026-07-31T14:37:00Z', {
  status: { ...morningReceipt, editorialDate: '2026-07-30' },
  terminalBlock: budgetBlock,
  force: true,
});
assert.equal(result.run, true, 'a deliberate recovery must remain possible after the underlying blocker changes');

// Old afternoon receipts remain readable during migration, but the gate can never write
// or request a second edition. Even an evening recovery attempt is still morning.
const legacyReceipt = { editorialDate: '2026-07-31', slot: 'afternoon', publicationId: 'run-2' };
result = decide('2026-07-31T22:22:00Z', { status: legacyReceipt });
assert.equal(result.run, false, 'a legacy same-day receipt must stop a duplicate edition');

result = decide('2026-07-31T21:30:00Z');
assert.equal(result.run, true);
assert.equal(result.slot, 'morning', 'an evening recovery attempt must still target the one edition');

console.log('editorial-gate tests: ok');
