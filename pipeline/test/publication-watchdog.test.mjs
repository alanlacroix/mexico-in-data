import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker, { checkHealth, dueSlot, mexicoCityClock, runClock, runScheduledCheck } from '../../ops/publication-watchdog/src/index.mjs';

const config = JSON.parse(fs.readFileSync(new URL('../../ops/publication-watchdog/wrangler.jsonc', import.meta.url), 'utf8'));
assert.deepEqual(config.triggers.crons, ['*/15 * * * *', '35 12 * * mon-fri'],
  'the clock must have one exact 6:35am Mexico City weekday trigger plus heartbeat checks');

assert.deepEqual(mexicoCityClock(new Date('2026-07-31T12:35:00Z')), {
  editorialDate: '2026-07-31', minuteOfDay: 395, weekday: 'Fri',
});
assert.equal(dueSlot(new Date('2026-07-31T12:34:00Z')), null, '6:34am Mexico City is before the build target');
assert.deepEqual(dueSlot(new Date('2026-07-31T12:35:00Z')), { editorialDate: '2026-07-31', slot: 'morning' });
assert.deepEqual(dueSlot(new Date('2026-07-31T12:45:00Z')), { editorialDate: '2026-07-31', slot: 'morning' },
  'the heartbeat trigger provides one bounded retry opportunity');
assert.equal(dueSlot(new Date('2026-07-31T12:50:00Z')), null, 'the dispatch window closes at 6:50am Mexico City');
assert.equal(dueSlot(new Date('2026-07-31T18:00:00Z')), null, 'noon is manual recovery only');
assert.deepEqual(dueSlot(new Date('2026-01-15T12:35:00Z')), { editorialDate: '2026-01-15', slot: 'morning' },
  'Mexico City stays aligned at UTC-6 in January');
assert.equal(dueSlot(new Date('2026-08-01T12:35:00Z')), null, 'Saturday has no candidate run');
assert.equal(dueSlot(new Date('2026-08-02T12:35:00Z')), null, 'Sunday has no candidate run');

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
  const morning = new Date('2026-07-31T12:35:00Z');
  assert.equal((await runClock(env, morning)).action, 'dispatch');
  assert.deepEqual(dispatches[0].inputs, { slot: 'morning' });
  assert.equal((await runClock(env, new Date('2026-07-31T12:45:00Z'))).action, 'none');
  assert.equal(dispatches.length, 1, 'the same slot dispatches once');

  assert.equal((await runClock(env, new Date('2026-07-31T18:00:00Z'))).action, 'none');
  assert.equal(dispatches.length, 1, 'noon never dispatches from the clock');

  failDispatch = true;
  await assert.rejects(runClock(env, new Date('2026-08-03T12:35:00Z')), /HTTP 503/);
  await assert.rejects(runScheduledCheck(env, new Date('2026-08-04T12:35:00Z')), /HTTP 503/);
  const failedHealth = await checkHealth(env, new Date('2026-08-04T12:36:00Z'));
  assert.equal(failedHealth.heartbeat.errorCode, 'github-dispatch-http');
  assert.doesNotMatch(JSON.stringify(failedHealth), /GitHub workflow dispatch returned|\bno\b/,
    'public health must not expose upstream response text');
  failDispatch = false;
  assert.equal((await runClock(env, new Date('2026-08-03T12:45:00Z'))).action, 'dispatch', 'a failed dispatch releases its claim');

  await runScheduledCheck(env, new Date('2026-08-03T13:00:00Z'));
  const health = await checkHealth(env, new Date('2026-08-03T13:15:00Z'));
  assert.equal(health.ok, true);
  const stale = await checkHealth(env, new Date('2026-08-03T14:00:00Z'));
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
