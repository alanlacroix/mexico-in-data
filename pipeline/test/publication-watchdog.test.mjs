import assert from 'node:assert/strict';
import {
  dueEdition,
  publicationCoversEdition,
  recentActiveRun,
  recoveryThrottle,
  watchdogDecision,
} from '../../ops/publication-watchdog/src/decision.mjs';

const morningBeforeGrace = new Date('2026-07-31T13:19:00Z'); // 9:19 AM EDT
const morningDue = new Date('2026-07-31T13:20:00Z'); // 9:20 AM EDT
const beforeAfternoonGrace = new Date('2026-07-31T21:34:00Z'); // 5:34 PM EDT
const afternoonDue = new Date('2026-07-31T21:35:00Z'); // 5:35 PM EDT

assert.equal(dueEdition(morningBeforeGrace), null, 'morning must wait through its grace period');
assert.deepEqual(dueEdition(morningDue), { editorialDate: '2026-07-31', slot: 'morning' });
assert.deepEqual(
  dueEdition(beforeAfternoonGrace),
  { editorialDate: '2026-07-31', slot: 'morning' },
  'morning remains the due edition until the afternoon grace period ends',
);
assert.deepEqual(dueEdition(afternoonDue), { editorialDate: '2026-07-31', slot: 'afternoon' });

assert.equal(
  publicationCoversEdition(
    { editorialDate: '2026-07-31', slot: 'afternoon' },
    { editorialDate: '2026-07-31', slot: 'morning' },
  ),
  true,
  'an afternoon receipt also covers the morning edition',
);
assert.equal(
  publicationCoversEdition(
    { editorialDate: '2026-07-30', slot: 'afternoon' },
    { editorialDate: '2026-07-31', slot: 'morning' },
  ),
  false,
  'a receipt from the prior day is stale',
);

const recentQueued = {
  id: 42,
  status: 'queued',
  created_at: '2026-07-31T13:10:00Z',
};
assert.equal(recentActiveRun([recentQueued], morningDue)?.id, 42);
assert.equal(
  recentActiveRun([{ ...recentQueued, created_at: '2026-07-31T09:00:00Z' }], morningDue),
  null,
  'an old stuck run must not suppress recovery forever',
);
assert.equal(
  recentActiveRun([{ ...recentQueued, status: 'completed' }], morningDue),
  null,
  'a completed run does not count as active',
);

assert.equal(
  recoveryThrottle([{ id: 50, event: 'workflow_dispatch', status: 'completed', created_at: '2026-07-31T13:00:00Z' }], morningDue).blocked,
  true,
  'the watchdog must not dispatch repeatedly during the recovery cooldown',
);
assert.equal(
  recoveryThrottle([1, 2, 3].map((id) => ({ id, event: 'workflow_dispatch', status: 'completed', conclusion: 'failure', created_at: '2026-07-31T12:00:00Z' })), morningDue).reason,
  'recovery failure limit reached',
  'the watchdog must stop a notification-producing failure loop',
);

assert.deepEqual(
  watchdogDecision({
    now: morningDue,
    status: { editorialDate: '2026-07-31', slot: 'morning' },
  }),
  {
    action: 'none',
    reason: 'publication is current',
    due: { editorialDate: '2026-07-31', slot: 'morning' },
  },
);

assert.deepEqual(
  watchdogDecision({
    now: morningDue,
    status: { editorialDate: '2026-07-30', slot: 'afternoon' },
    runs: [recentQueued],
  }),
  {
    action: 'none',
    reason: 'workflow is already queued or in progress',
    due: { editorialDate: '2026-07-31', slot: 'morning' },
    activeRunId: 42,
  },
);

assert.deepEqual(
  watchdogDecision({
    now: afternoonDue,
    status: { editorialDate: '2026-07-31', slot: 'morning' },
    runs: [],
  }),
  {
    action: 'dispatch',
    reason: 'publication is stale and no active run exists',
    due: { editorialDate: '2026-07-31', slot: 'afternoon' },
  },
);

console.log('publication-watchdog tests: ok');
