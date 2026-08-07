import assert from 'node:assert/strict';
import fs from 'node:fs';
import scheduleCoverage from '../lib/schedule-coverage.cjs';

const { validateScheduleCoverage } = scheduleCoverage;
const current = JSON.parse(fs.readFileSync(new URL('../../data/events.json', import.meta.url), 'utf8'));
assert.deepEqual(validateScheduleCoverage(current, '2026-08-07'), [], 'the committed official-event calendar must cover its declared forward horizon');
assert.ok(validateScheduleCoverage(current, '2026-11-10').some((error) => /future obligations|forward horizon/.test(error)),
  'the gate must fail closed before a finite hand-maintained calendar silently expires');
const missingPolicy = { events: [] };
assert.ok(validateScheduleCoverage(missingPolicy, '2026-08-07').some((error) => /coveragePolicy/.test(error)));

console.log('schedule-coverage tests: ok');
