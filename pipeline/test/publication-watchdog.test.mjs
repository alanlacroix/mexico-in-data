import assert from 'node:assert/strict';
import worker, { checkHealth, dueSlot, runClock, runScheduledCheck } from '../../ops/publication-watchdog/src/index.mjs';

assert.equal(dueSlot(new Date('2026-07-31T12:59:00Z')), null, '8:59am EDT is before the morning slot');
assert.deepEqual(dueSlot(new Date('2026-07-31T13:00:00Z')), { editorialDate: '2026-07-31', slot: 'morning' });
assert.deepEqual(dueSlot(new Date('2026-07-31T16:00:00Z')), { editorialDate: '2026-07-31', slot: 'noon' });
assert.equal(dueSlot(new Date('2026-01-15T13:59:00Z')), null, '8:59am EST is before the morning slot');
assert.deepEqual(dueSlot(new Date('2026-01-15T14:00:00Z')), { editorialDate: '2026-01-15', slot: 'morning' });

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
  const morning = new Date('2026-07-31T13:00:00Z');
  assert.equal((await runClock(env, morning)).action, 'dispatch');
  assert.deepEqual(dispatches[0].inputs, { slot: 'morning' });
  assert.equal((await runClock(env, new Date('2026-07-31T13:15:00Z'))).action, 'none');
  assert.equal(dispatches.length, 1, 'the same slot dispatches once');

  assert.equal((await runClock(env, new Date('2026-07-31T16:00:00Z'))).action, 'dispatch');
  assert.deepEqual(dispatches[1].inputs, { slot: 'noon' });
  assert.equal(dispatches.length, 2);

  failDispatch = true;
  await assert.rejects(runClock(env, new Date('2026-08-01T13:00:00Z')), /HTTP 503/);
  await assert.rejects(runScheduledCheck(env, new Date('2026-08-02T13:00:00Z')), /HTTP 503/);
  const failedHealth = await checkHealth(env, new Date('2026-08-02T13:01:00Z'));
  assert.equal(failedHealth.heartbeat.errorCode, 'github-dispatch-http');
  assert.doesNotMatch(JSON.stringify(failedHealth), /GitHub workflow dispatch returned|\bno\b/,
    'public health must not expose upstream response text');
  failDispatch = false;
  assert.equal((await runClock(env, new Date('2026-08-01T13:15:00Z'))).action, 'dispatch', 'a failed dispatch releases its claim');

  await runScheduledCheck(env, new Date('2026-08-01T16:00:00Z'));
  const health = await checkHealth(env, new Date('2026-08-01T16:15:00Z'));
  assert.equal(health.ok, true);
  const stale = await checkHealth(env, new Date('2026-08-01T17:00:00Z'));
  assert.equal(stale.ok, false);

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
