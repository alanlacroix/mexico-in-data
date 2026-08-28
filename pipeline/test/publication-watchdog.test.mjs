import assert from 'node:assert/strict';
import {
  dueEdition,
  publicationCoversEdition,
  publicationStopsRecovery,
  recentActiveRun,
  recoveryThrottle,
  resolvePublicationStatus,
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
assert.deepEqual(dueEdition(morningDue), { editorialDate: '2026-07-31', slot: 'morning', quietRecheck: false });
assert.deepEqual(
  dueEdition(beforeAfternoonGrace),
  { editorialDate: '2026-07-31', slot: 'morning', quietRecheck: true },
  'the morning edition remains the only edition due later in the day',
);
assert.deepEqual(
  dueEdition(afternoonDue),
  { editorialDate: '2026-07-31', slot: 'morning', quietRecheck: true },
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
    { state: 'deferred', editorialDate: '2026-07-31', slot: 'morning' },
    { editorialDate: '2026-07-31', slot: 'morning' },
  ),
  false,
  'a deferral is not a published edition',
);
assert.equal(
  publicationStopsRecovery(
    { state: 'deferred', editorialDate: '2026-07-31', slot: 'morning' },
    { editorialDate: '2026-07-31', slot: 'morning' },
  ),
  false,
  'a current deferral remains eligible for one throttled independent recovery attempt',
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
  recoveryThrottle([{ id: 50, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', created_at: '2026-07-31T13:00:00Z' }], '2026-07-31').blocked,
  true,
  'one successful-but-deferred recovery must consume the independent allowance for that day',
);
assert.equal(
  recoveryThrottle([{ id: 1, event: 'workflow_dispatch', status: 'completed', conclusion: 'failure', created_at: '2026-07-31T12:00:00Z' }], '2026-07-31').blocked,
  true,
  'one failed independent recovery must also consume the allowance for that day',
);
assert.equal(
  recoveryThrottle([1, 2, 3, 4].map((id) => ({ id, event: 'schedule', status: 'completed', conclusion: 'failure', created_at: '2026-07-31T12:00:00Z' })), '2026-07-31').blocked,
  false,
  'failed scheduled attempts must not consume the independent recovery allowance',
);
assert.equal(
  recoveryThrottle([{ id: 50, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', created_at: '2026-07-31T23:00:00Z' }], '2026-08-01').blocked,
  false,
  'a recovery on the prior Eastern date must not consume the next day allowance',
);

const livePublished = {
  state: 'published', editorialDate: '2026-07-31', slot: 'morning', generatedAt: '2026-07-31T13:30:00Z',
};
const newerRepositoryDeferral = {
  state: 'deferred', editorialDate: '2026-07-31', slot: 'morning', generatedAt: '2026-07-31T14:00:00Z',
};
assert.deepEqual(
  resolvePublicationStatus(livePublished, newerRepositoryDeferral, dueEdition(morningDue)),
  { status: newerRepositoryDeferral, source: 'repository' },
  'a strictly newer same-day repository deferral must override the obsolete live receipt',
);
assert.equal(
  resolvePublicationStatus(livePublished, { ...newerRepositoryDeferral, generatedAt: '2026-07-31T13:00:00Z' }, dueEdition(morningDue)).source,
  'live',
  'an older repository deferral must not override production',
);
assert.equal(
  resolvePublicationStatus(livePublished, { ...newerRepositoryDeferral, editorialDate: '2026-07-30' }, dueEdition(morningDue)).source,
  'live',
  'a deferral from another editorial date must not override production',
);

assert.deepEqual(
  watchdogDecision({
    now: morningDue,
    status: { editorialDate: '2026-07-31', slot: 'morning' },
  }),
  {
    action: 'none',
    reason: 'publication is current',
    due: { editorialDate: '2026-07-31', slot: 'morning', quietRecheck: false },
  },
);

assert.deepEqual(
  watchdogDecision({
    now: morningDue,
    status: { state: 'blocked', editorialDate: '2026-07-31', slot: 'morning' },
  }),
  {
    action: 'none',
    reason: 'publication is blocked',
    due: { editorialDate: '2026-07-31', slot: 'morning', quietRecheck: false },
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
    due: { editorialDate: '2026-07-31', slot: 'morning', quietRecheck: false },
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
    due: { editorialDate: '2026-07-31', slot: 'morning', quietRecheck: true },
  },
);

assert.deepEqual(
  watchdogDecision({
    now: afternoonDue,
    status: { editorialDate: '2026-07-31', slot: 'morning', quiet: true, quietFinal: false },
    runs: [],
  }),
  {
    action: 'dispatch',
    reason: 'publication is stale and no active run exists',
    due: { editorialDate: '2026-07-31', slot: 'morning', quietRecheck: true },
  },
  'the independent watchdog must reopen one provisional quiet morning at noon',
);

assert.equal(publicationCoversEdition(
  { editorialDate: '2026-07-31', slot: 'morning', quiet: true, quietFinal: true },
  { editorialDate: '2026-07-31', slot: 'morning', quietRecheck: true },
), true, 'the final quiet recheck must stop further dispatches');

const originalFetch = globalThis.fetch;
const heartbeatStore = new Map();
let dispatchCalls = 0;
const dispatchInputs = [];
let servedPublication = {
  editorialDate: '2026-07-31', slot: 'morning', publicationId: 'test-1', generatedAt: '2026-07-31T13:30:00Z',
};
let servedRepository = { ...servedPublication };
let repositoryStatusFailure = false;
let servedRuns = [{ id: 99, status: 'completed', conclusion: 'success', created_at: morningDue.toISOString() }];
let servedRecoveryRuns = [];
const healthyEnv = {
  GITHUB_TOKEN: 'test-token',
  WATCHDOG_STATE: {
    get: async (key) => heartbeatStore.get(key) || null,
    put: async (key, value) => heartbeatStore.set(key, value),
  },
};

globalThis.fetch = async (url, init = {}) => {
  const target = String(url);
  if (target.startsWith('https://mexicobrief.com/')) {
    return Response.json(servedPublication);
  }
  if (target.includes('/contents/data/publication-status.json')) {
    if (repositoryStatusFailure) return new Response('unavailable', { status: 503 });
    return Response.json(servedRepository);
  }
  if (target.includes('/actions/workflows/')) {
    if (init.method === 'POST') {
      dispatchCalls += 1;
      dispatchInputs.push(JSON.parse(init.body).inputs);
      return new Response(null, { status: 204 });
    }
    if (target.includes('event=workflow_dispatch')) {
      return Response.json({ total_count: servedRecoveryRuns.length, workflow_runs: servedRecoveryRuns });
    }
    return Response.json({ workflow_runs: servedRuns });
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

  servedPublication = { editorialDate: '2026-07-30', slot: 'morning', publicationId: 'old' };
  servedRepository = { ...servedPublication };
  servedRuns = [1, 2, 3].map((id) => ({
    id, event: 'workflow_dispatch', status: 'completed', conclusion: 'failure', created_at: '2026-07-31T12:00:00Z',
  }));
  servedRecoveryRuns = [...servedRuns];
  const exhausted = await checkHealth(healthyEnv, new Date(morningDue.getTime() + 15 * 60_000));
  assert.equal(exhausted.ok, false, 'a stale edition after failed retries must never report healthy');
  assert.equal(exhausted.checks.editionCurrentOrRecoveryActive, false);
  const exhaustedRecovery = await runWatchdog(
    { ...healthyEnv, PUBLICATION_STATUS_JSON: JSON.stringify(servedPublication) },
    morningDue,
  );
  assert.equal(exhaustedRecovery.action, 'none');
  assert.match(exhaustedRecovery.reason, /allowance was already used/,
    'one recovery of any conclusion must stop repeat dispatches for the editorial date');

  servedPublication = {
    editorialDate: '2026-07-30', slot: 'morning', publicationId: 'stale-production', generatedAt: '2026-07-30T13:30:00Z',
  };
  servedRepository = { ...servedPublication };
  servedRuns = [{ id: 99, status: 'completed', conclusion: 'success', created_at: morningDue.toISOString() }];
  servedRecoveryRuns = [];

  const repositoryFallback = await runWatchdog(healthyEnv, morningDue);
  assert.equal(repositoryFallback.action, 'dispatch');
  assert.equal(dispatchCalls, 1, 'stale production must dispatch even when the repository run previously succeeded');
  assert.deepEqual(dispatchInputs[0], { force: 'true' }, 'recovery needs one input: bypass the stale repository receipt');

  servedPublication = {
    state: 'published', editorialDate: '2026-07-31', slot: 'morning', publicationId: 'live-old', generatedAt: '2026-07-31T13:30:00Z',
  };
  servedRepository = {
    state: 'deferred', editorialDate: '2026-07-31', slot: 'morning', publicationId: 'repo-new', generatedAt: '2026-07-31T14:00:00Z',
  };
  servedRuns = [];
  servedRecoveryRuns = [];
  const deferredRepair = await runWatchdog(healthyEnv, new Date('2026-07-31T14:15:00Z'));
  assert.equal(deferredRepair.action, 'dispatch');
  assert.equal(dispatchCalls, 2);
  assert.deepEqual(dispatchInputs[1], { force: 'false' },
    'a repository deferral must let the editorial gate enforce the bounded retry state');

  servedRuns = [{
    id: 101, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', created_at: '2026-07-31T14:16:00Z',
  }];
  servedRecoveryRuns = [...servedRuns];
  const secondDeferredRepair = await runWatchdog(healthyEnv, new Date('2026-07-31T15:30:00Z'));
  assert.equal(secondDeferredRepair.action, 'none');
  assert.match(secondDeferredRepair.reason, /allowance was already used/,
    'a successful deferred run must not be dispatched again on the same day');

  servedRuns = [{ id: 102, status: 'in_progress', created_at: '2026-07-31T14:10:00Z' }];
  servedRecoveryRuns = [];
  const activeDeferredRepair = await runWatchdog(healthyEnv, new Date('2026-07-31T14:15:00Z'));
  assert.equal(activeDeferredRepair.action, 'none');
  assert.equal(activeDeferredRepair.reason, 'workflow is already queued or in progress');

  servedRuns = Array.from({ length: 20 }, (_, index) => ({
    id: 200 + index, event: 'schedule', status: 'completed', conclusion: 'success', created_at: `2026-07-31T15:${String(index).padStart(2, '0')}:00Z`,
  }));
  servedRecoveryRuns = [{
    id: 199, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', created_at: '2026-07-31T14:16:00Z',
  }];
  const hiddenDeferredRepair = await runWatchdog(healthyEnv, new Date('2026-07-31T16:00:00Z'));
  assert.equal(hiddenDeferredRepair.action, 'none');
  assert.match(hiddenDeferredRepair.reason, /allowance was already used/,
    'newer scheduled runs must not hide a same-day recovery dispatch');

  servedRuns = [];
  servedRecoveryRuns = [];
  const deferredHealth = await checkHealth(healthyEnv, new Date('2026-07-31T14:15:00Z'));
  assert.equal(deferredHealth.ok, false, 'a newer repository deferral must make health non-current');
  assert.equal(deferredHealth.resolvedPublicationSource, 'repository');
  assert.equal(deferredHealth.checks.editionCurrentOrRecoveryActive, false);

  repositoryStatusFailure = true;
  const noRepositoryStatus = await checkHealth(healthyEnv, new Date('2026-07-31T14:15:00Z'));
  assert.equal(noRepositoryStatus.ok, false, 'health must fail closed when repository coordination state cannot be read');
  assert.equal(noRepositoryStatus.checks.repositoryStatusReachable, false);
  await assert.rejects(
    runWatchdog(healthyEnv, new Date('2026-07-31T14:15:00Z')),
    /GitHub publication-status request returned HTTP 503/,
    'scheduled recovery must fail closed when repository coordination state cannot be read',
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log('publication-watchdog tests: ok');
