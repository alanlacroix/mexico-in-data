import assert from 'node:assert/strict';
import { editorialDecision } from '../editorial-gate.mjs';

const MORNING_SCHEDULE = '7,37 13,14 * * *';
const AFTERNOON_SCHEDULE = '22,52 21,22 * * *';
const decide = (now, options = {}) => editorialDecision({ now: new Date(now), ...options });

// During daylight time, 13:00 UTC is the live 9 AM Eastern window. A delayed
// or missed first occurrence still has three more chances to publish.
let result = decide('2026-07-31T12:37:00Z', { schedule: MORNING_SCHEDULE });
assert.equal(result.run, false, 'the redundant EDT morning occurrence before 9 AM must wait');
assert.equal(result.slot, 'morning');

result = decide('2026-07-31T13:07:00Z', { schedule: MORNING_SCHEDULE });
assert.equal(result.run, true, 'the first due EDT morning occurrence must publish');
assert.equal(result.editorialDate, '2026-07-31');

result = decide('2026-07-31T14:07:00Z', { schedule: MORNING_SCHEDULE });
assert.equal(result.run, true, 'the later UTC-hour occurrence must recover a missed EDT publication');

// During standard time, the 13:00 UTC occurrences are early and 14:00 UTC is due.
result = decide('2026-12-15T13:37:00Z', { schedule: MORNING_SCHEDULE });
assert.equal(result.run, false, 'the EST morning occurrence before 9 AM must wait');

result = decide('2026-12-15T14:07:00Z', { schedule: MORNING_SCHEDULE });
assert.equal(result.run, true, 'the EST 9 AM occurrence must publish');
assert.equal(result.editorialDate, '2026-12-15');

// A committed receipt makes every later redundant occurrence idempotent.
const morningReceipt = { editorialDate: '2026-07-31', slot: 'morning', publicationId: 'run-1' };
result = decide('2026-07-31T13:37:00Z', { schedule: MORNING_SCHEDULE, status: morningReceipt });
assert.equal(result.run, false, 'a second morning occurrence must stop after the morning receipt exists');
assert.match(result.reason, /already published/);

result = decide('2026-07-31T13:37:00Z', { requested: 'morning', status: morningReceipt, force: true });
assert.equal(result.run, true, 'the watchdog must be able to repair stale production after a receipt was committed');

result = decide('2026-07-31T13:37:00Z', {
  schedule: MORNING_SCHEDULE,
  status: { ...morningReceipt, editorialDate: '2026-07-30' },
});
assert.equal(result.run, true, 'yesterday’s receipt must not block today’s edition');

// The afternoon is a separate, higher-ranked edition. A morning receipt does
// not block it, while an afternoon receipt stops all later attempts that day.
result = decide('2026-07-31T20:52:00Z', { schedule: AFTERNOON_SCHEDULE, status: morningReceipt });
assert.equal(result.run, false, 'the EDT afternoon occurrence before 5 PM must wait');
assert.equal(result.slot, 'afternoon');

result = decide('2026-07-31T21:22:00Z', { schedule: AFTERNOON_SCHEDULE, status: morningReceipt });
assert.equal(result.run, true, 'the afternoon edition must run after a morning receipt');

const afternoonReceipt = { editorialDate: '2026-07-31', slot: 'afternoon', publicationId: 'run-2' };
result = decide('2026-07-31T22:22:00Z', { schedule: AFTERNOON_SCHEDULE });
assert.equal(result.run, true, 'the later UTC-hour occurrence must recover a missed EDT afternoon publication');

result = decide('2026-07-31T22:22:00Z', { schedule: AFTERNOON_SCHEDULE, status: afternoonReceipt });
assert.equal(result.run, false, 'a redundant afternoon occurrence must stop after its receipt exists');

result = decide('2026-12-15T21:52:00Z', { schedule: AFTERNOON_SCHEDULE });
assert.equal(result.run, false, 'the EST afternoon occurrence before 5 PM must wait');

result = decide('2026-12-15T22:22:00Z', { schedule: AFTERNOON_SCHEDULE });
assert.equal(result.run, true, 'the EST 5 PM occurrence must publish');

// Manual dispatch uses the requested slot when supplied and otherwise chooses
// the edition that is due at the current Eastern time.
result = decide('2026-07-31T13:15:00Z', { requested: 'auto' });
assert.equal(result.run, true);
assert.equal(result.slot, 'morning', 'a morning manual dispatch in auto mode must choose morning');

result = decide('2026-07-31T21:30:00Z', { requested: 'auto', status: morningReceipt });
assert.equal(result.run, true);
assert.equal(result.slot, 'afternoon', 'an evening manual dispatch in auto mode must choose afternoon');

result = decide('2026-07-31T20:30:00Z', { requested: 'afternoon' });
assert.equal(result.run, false, 'an explicitly requested afternoon edition must not publish before 5 PM');

console.log('editorial-gate tests: ok');
