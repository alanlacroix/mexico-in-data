import assert from 'node:assert/strict';
import { healthStatus, summarizeHealth } from '../../assets/health-status.mjs';

const now = new Date('2026-07-13T18:00:00Z');
const hoursAgo = (hours) => new Date(now.getTime() - hours * 3600e3).toISOString();

assert.equal(healthStatus({ status: 'ok', cadence: 'daily', vintage: '2026-07-12', fetchedAt: hoursAgo(12) }, now), 'Current');
assert.equal(healthStatus({ status: 'ok', cadence: 'daily', vintage: '2026-07-12', fetchedAt: hoursAgo(48) }, now), 'Refresh overdue');
assert.equal(healthStatus({ status: 'failed', cadence: 'daily', vintage: '2026-07-12', fetchedAt: hoursAgo(2) }, now), 'Fetch issue');
assert.equal(healthStatus({ status: 'ok', cadence: 'monthly', vintage: '2026-06' }, now), 'Current');
assert.equal(healthStatus({ status: 'ok', cadence: 'monthly', vintage: '2026-04' }, now), 'Current');
assert.equal(healthStatus({ status: 'ok_flagged', cadence: 'quarterly', vintage: '2026-01', flags: ['stale_quarter_250d'] }, now), 'Update expected');
assert.equal(healthStatus({ status: 'ok_flagged', cadence: 'monthly', vintage: '2026-06', flags: ['series_jump_2020-06-01_82pct'] }, now), 'Review flag');
assert.equal(healthStatus({ status: 'ok_flagged', cadence: 'monthly', vintage: '2026-06', flags: [] }, now), 'Review flag');
assert.equal(healthStatus({ status: 'skipped', cadence: 'monthly', gatedBy: 'ENABLE_TEST' }, now), 'Paused');
assert.equal(healthStatus({ status: 'ok', cadence: 'monthly', vintage: '2026-05', gatedBy: 'ENABLE_TEST', scheduledSeparately: true, fetchedAt: hoursAgo(240) }, now), 'Current');

assert.deepEqual(summarizeHealth({ sources: [
  { status: 'ok', cadence: 'daily', vintage: '2026-07-12', fetchedAt: hoursAgo(12) },
  { status: 'ok', cadence: 'daily', vintage: '2026-07-12', fetchedAt: hoursAgo(48) },
  { status: 'ok_flagged', cadence: 'quarterly', vintage: '2026-01', flags: ['stale_quarter_250d'] },
  { status: 'ok_flagged', cadence: 'monthly', vintage: '2026-06', flags: ['series_jump_2020-06-01_82pct'] },
  { status: 'skipped', cadence: 'monthly', gatedBy: 'ENABLE_TEST' },
] }, now), { current: 1, expected: 1, reviews: 1, overdue: 1, issues: 0, paused: 1 });

console.log('health-status tests: ok');
