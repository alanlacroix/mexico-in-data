import assert from 'node:assert/strict';
import fs from 'node:fs';
import scheduleCoverage from '../lib/schedule-coverage.cjs';
import scheduledCandidate from '../lib/scheduled-candidate.cjs';

const { validateScheduleCoverage } = scheduleCoverage;
const current = JSON.parse(fs.readFileSync(new URL('../../data/events.json', import.meta.url), 'utf8'));
assert.deepEqual(validateScheduleCoverage(current, '2026-08-07'), [], 'the committed official-event calendar must cover its declared forward horizon');
assert.ok(validateScheduleCoverage(current, '2026-11-10').some((error) => /future obligations|forward horizon/.test(error)),
  'the gate must fail closed before a finite hand-maintained calendar silently expires');
const missingPolicy = { events: [] };
assert.ok(validateScheduleCoverage(missingPolicy, '2026-08-07').some((error) => /coveragePolicy/.test(error)));

// The official calendar entry records a release, not a pre-release result or a
// claim that the CPI-specific importer supports industrial production.
const imai = current.events.filter(row => row.id === 'inegi-imai-2026-10-12');
assert.equal(imai.length, 1, 'the dated national industrial release must appear once');
assert.equal(imai[0].referencePeriod, '2026-08');
assert.equal(imai[0].releaseAt, '2026-10-12T12:00:00Z');
const local = new Intl.DateTimeFormat('en-CA', {
  timeZone: imai[0].timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).formatToParts(new Date(imai[0].releaseAt));
const parts = Object.fromEntries(local.map(part => [part.type, part.value]));
assert.equal(`${parts.year}-${parts.month}-${parts.day}`, imai[0].date);
assert.equal(`${parts.hour}:${parts.minute}`, '06:00');
assert.equal(imai[0].advisoryOnly, true);
assert.equal(imai[0].outcomeRequired, false);
assert.equal(imai[0].requiredForBrief, false);
assert.deepEqual(scheduledCandidate.dueScheduledRows(imai, '2026-10-11', '2026-10-13'), [],
  'advisory metadata must not create an unsupported mandatory ingestion obligation');
assert.equal(scheduledCandidate.seedScheduledCandidate(imai[0],
  '12 de octubre de 2026 INEGI actividad industrial agosto'), null,
  'the calendar alone cannot become a reported outcome');

console.log('schedule-coverage tests: ok');
