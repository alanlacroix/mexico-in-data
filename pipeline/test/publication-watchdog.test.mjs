import assert from 'node:assert/strict';
import {
  dueEdition,
  publicationCoversEdition,
  recentActiveRun,
  recoveryThrottle,
  watchdogDecision,
} from '../../ops/publication-watchdog/src/decision.mjs';
import {
  checkHealth,
  runWatchdog,
  runScheduledCheck,
} from '../../ops/publication-watchdog/src/index.mjs';

const morningBeforeGrace = new Date('2026-07-31T13:19:00Z'); // 9:19 AM EDT
const morningDue = new Date('2026-07-31T13:20:00Z'); // 9:20 AM EDT
const beforeAfternoonGrace = new Date('2026-07-31T21:34:00Z'); // 5:34 PM EDT
const afternoonDue = new Date('2026-07-31T21:35:00Z'); // 5:35 PM EDT

assert.equal(dueEdition(morningBeforeGrace), null, 'morning must wait through its grace period');
assert.deepEqual(dueEdition(morningDue), { editorialDate: '2026-07-31', slot: 'morning' });
assert.deepEqual(
  dueEdition(beforeAfternoonGrace),
  { editorialDate: '2026-07-31', slot: 'morning' },
  'the morning edition remains the only edition due later in the day',
);
assert.deepEqual(
  dueEdition(afternoonDue),
  { editorialDate: '2026-07-31', slot: 'morning' },
  'the watchdog must never invent a second afternoon edition',
);

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
    status: { editorialDate: '2026-07-30', slot: 'morning' },
    runs: [],
  }),
  {
    action: 'dispatch',
    reason: 'publication is stale and no active run exists',
    due: { editorialDate: '2026-07-31', slot: 'morning' },
  },
);

const originalFetch = globalThis.fetch;
const heartbeatStore = new Map();
let dispatchCalls = 0;
const healthyEnv = {
  GITHUB_TOKEN: 'test-token',
  WATCHDOG_STATE: {
    get: async (key) => heartbeatStore.get(key) || null,
    put: async (key, value) => heartbeatStore.set(key, value),
  },
};

globalThis.fetch = async (url, init = {}) => {
  const target = String(url);
  if (target.includes('publication-status.json')) {
    return Response.json({ editorialDate: '2026-07-31', slot: 'morning', publicationId: 'test-1' });
  }
  if (target.includes('/actions/workflows/')) {
    if (init.method === 'POST') {
      dispatchCalls += 1;
      return new Response(null, { status: 204 });
    }
    return Response.json({ workflow_runs: [{ id: 99, status: 'completed', conclusion: 'success', created_at: morningDue.toISOString() }] });
  }
  throw new Error(`unexpected test URL: ${target}`);
};

try {
  await runScheduledCheck(healthyEnv, morningDue);
  const healthy = await checkHealth(healthyEnv, new Date(morningDue.getTime() + 15 * 60_000));
  assert.equal(healthy.ok, true, 'health must prove the secret, APIs, KV binding, and scheduled heartbeat');
  assert.equal(healthy.checks.heartbeatFresh, true);

  const missingToken = await checkHealth({ ...healthyEnv, GITHUB_TOKEN: '' }, morningDue);
  assert.equal(missingToken.ok, false, 'an undeployable credential state must never report healthy');
  assert.equal(missingToken.checks.githubTokenConfigured, false);

  const stale = await checkHealth(healthyEnv, new Date(morningDue.getTime() + 60 * 60_000));
  assert.equal(stale.ok, false, 'a missing cron invocation must make the public health check fail');
  assert.equal(stale.checks.heartbeatFresh, false);

  const repositoryFallback = await runWatchdog({
    ...healthyEnv,
    PUBLICATION_STATUS_JSON: JSON.stringify({ editorialDate: '2026-07-30', slot: 'morning' }),
  }, morningDue);
  assert.equal(repositoryFallback.action, 'dispatch');
  assert.equal(dispatchCalls, 1, 'the repository receipt path must dispatch without fetching the public receipt');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('publication-watchdog tests: ok');
