import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker, { checkHealth, dueSlot, mexicoCityClock, runClock, runScheduledCheck } from '../../ops/publication-watchdog/src/index.mjs';

const config = JSON.parse(fs.readFileSync(new URL('../../ops/publication-watchdog/wrangler.jsonc', import.meta.url), 'utf8'));
assert.deepEqual(config.triggers.crons, ['*/15 * * * *', '5 12 * * *'],
  'the clock must have one exact 6:05am Mexico City daily trigger plus heartbeat checks');

assert.deepEqual(mexicoCityClock(new Date('2026-07-31T12:05:00Z')), {
  editorialDate: '2026-07-31', minuteOfDay: 365, weekday: 'Fri',
});
assert.equal(dueSlot(new Date('2026-07-31T12:04:00Z')), null, '6:04am Mexico City is before the build target');
assert.deepEqual(dueSlot(new Date('2026-07-31T12:05:00Z')), { editorialDate: '2026-07-31', slot: 'morning' });
assert.deepEqual(dueSlot(new Date('2026-07-31T12:15:00Z')), { editorialDate: '2026-07-31', slot: 'morning' },
  'the heartbeat trigger provides one bounded retry opportunity');
assert.equal(dueSlot(new Date('2026-07-31T12:20:00Z')), null, 'the dispatch window closes at 6:20am Mexico City');
assert.equal(dueSlot(new Date('2026-07-31T18:00:00Z')), null, 'noon is manual recovery only');
assert.deepEqual(dueSlot(new Date('2026-01-15T12:05:00Z')), { editorialDate: '2026-01-15', slot: 'morning' },
  'Mexico City stays aligned at UTC-6 in January');
assert.deepEqual(dueSlot(new Date('2026-08-01T12:05:00Z')), { editorialDate: '2026-08-01', slot: 'morning' });
assert.deepEqual(dueSlot(new Date('2026-08-02T12:05:00Z')), { editorialDate: '2026-08-02', slot: 'morning' });

const values = new Map();
const state = {
  get: async (key) => values.get(key) || null,
  put: async (key, value) => values.set(key, value),
  delete: async (key) => values.delete(key),
};
const env = { GITHUB_TOKEN: 'test-token', WATCHDOG_STATE: state };
const originalFetch = globalThis.fetch;
const dispatches = [];
let failDispatch = false;
globalThis.fetch = async (_url, init) => {
  dispatches.push(JSON.parse(init.body));
  return failDispatch ? new Response('no', { status: 503 }) : new Response(null, { status: 204 });
};

try {
  const morning = new Date('2026-07-31T12:05:00Z');
  assert.equal((await runClock(env, morning)).action, 'dispatch');
  assert.deepEqual(dispatches[0].inputs, { slot: 'morning' });
  assert.equal((await runClock(env, new Date('2026-07-31T12:15:00Z'))).action, 'none');
  assert.equal(dispatches.length, 1, 'the same slot dispatches once');

  assert.equal((await runClock(env, new Date('2026-07-31T18:00:00Z'))).action, 'none');
  assert.equal(dispatches.length, 1, 'noon never dispatches from the clock');

  failDispatch = true;
  await assert.rejects(runClock(env, new Date('2026-08-03T12:05:00Z')), /HTTP 503/);
  await assert.rejects(runScheduledCheck(env, new Date('2026-08-04T12:05:00Z')), /HTTP 503/);
  const failedHealth = await checkHealth(env, new Date('2026-08-04T12:06:00Z'));
  assert.equal(failedHealth.heartbeat.errorCode, 'github-dispatch-http');
  assert.doesNotMatch(JSON.stringify(failedHealth), /GitHub workflow dispatch returned|\bno\b/,
    'public health must not expose upstream response text');
  failDispatch = false;
  assert.equal((await runClock(env, new Date('2026-08-03T12:15:00Z'))).action, 'dispatch', 'a failed dispatch releases its claim');

  await runScheduledCheck(env, new Date('2026-08-03T13:00:00Z'));
  const health = await checkHealth(env, new Date('2026-08-03T13:15:00Z'));
  assert.equal(health.ok, true);
  const stale = await checkHealth(env, new Date('2026-08-03T14:00:00Z'));
  assert.equal(stale.ok, false);

  // A routine heartbeat must not erase a missed or failed daily dispatch.
  await runScheduledCheck(env, new Date('2026-08-05T12:00:00Z'));
  assert.equal((await checkHealth(env, new Date('2026-08-05T12:04:00Z'))).ok, true,
    'today is not overdue before the morning window');
  await runScheduledCheck(env, new Date('2026-08-05T12:30:00Z'));
  const missed = await checkHealth(env, new Date('2026-08-05T12:31:00Z'));
  assert.equal(missed.checks.heartbeatFresh, true);
  assert.equal(missed.checks.lastScheduledCheckHealthy, true);
  assert.equal(missed.checks.dailyDispatchConfirmed, false);
  assert.equal(missed.ok, false, 'a fresh outside-window heartbeat cannot conceal a missed cron');
  assert.equal(missed.dailyDispatch, null, 'a previous day receipt cannot satisfy today');

  failDispatch = true;
  await assert.rejects(runScheduledCheck(env, new Date('2026-08-06T12:05:00Z')), /HTTP 503/);
  await assert.rejects(runScheduledCheck(env, new Date('2026-08-06T12:15:00Z')), /HTTP 503/);
  await runScheduledCheck(env, new Date('2026-08-06T12:30:00Z'));
  assert.equal((await checkHealth(env, new Date('2026-08-06T12:31:00Z'))).ok, false,
    'failed dispatches stay unhealthy after a successful outside-window heartbeat');

  await assert.rejects(runScheduledCheck(env, new Date('2026-08-07T12:05:00Z')), /HTTP 503/);
  failDispatch = false;
  await runScheduledCheck(env, new Date('2026-08-07T12:15:00Z'));
  await runScheduledCheck(env, new Date('2026-08-07T12:30:00Z'));
  const retried = await checkHealth(env, new Date('2026-08-07T12:31:00Z'));
  assert.equal(retried.ok, true, 'an acknowledged retry satisfies daily clock health');
  assert.equal(retried.dailyDispatch.dispatchedAt, '2026-08-07T12:15:00.000Z');

  // Old/in-flight claims and malformed receipts are not delivery evidence.
  values.set('edition-dispatch:2026-08-08:morning', JSON.stringify({ claimedAt: '2026-08-08T12:05:00Z' }));
  await runScheduledCheck(env, new Date('2026-08-08T12:15:00Z'));
  assert.equal((await checkHealth(env, new Date('2026-08-08T12:20:00Z'))).ok, false);
  values.set('edition-dispatch-success:2026-08-08:morning', '{');
  assert.equal((await checkHealth(env, new Date('2026-08-08T12:20:00Z'))).ok, false);

  const receiptFailureEnv = { ...env, WATCHDOG_STATE: { ...state, put: async (key, value) => {
    if (key.startsWith('edition-dispatch-success:')) throw new Error('KV receipt write failed');
    return state.put(key, value);
  } } };
  await assert.rejects(runScheduledCheck(receiptFailureEnv, new Date('2026-08-09T12:05:00Z')), /KV receipt write failed/);
  const acceptedCount = dispatches.length;
  await runScheduledCheck(env, new Date('2026-08-09T12:15:00Z'));
  assert.equal(dispatches.length, acceptedCount, 'receipt write failure must not resend an accepted dispatch');
  assert.equal((await checkHealth(env, new Date('2026-08-09T12:20:00Z'))).ok, false);

  const before = dispatches.length;
  const response = await worker.fetch(new Request('https://worker.example/health'), env);
  assert.ok([200, 503].includes(response.status));
  assert.equal(dispatches.length, before, 'HTTP health is read-only');
  assert.equal((await worker.fetch(new Request('https://worker.example/health', { method: 'POST' }), env)).status, 405);
  await assert.rejects(runClock({ ...env, GITHUB_TOKEN: '' }, morning), /GITHUB_TOKEN/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('publication-watchdog tests: ok');
