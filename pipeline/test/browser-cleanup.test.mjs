import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { browserCleanup } from '../lib/browser-cleanup.mjs';
const fakeChild = () => Object.assign(new EventEmitter(), { signals: [], kill(signal) { this.signals.push(signal); } });
const child = fakeChild();
let removed = false;
const cleanup = browserCleanup(child, '/tmp/owned-test-profile', { timeoutMs: 100, remove: async (profile, options) => {
 assert.equal(profile, '/tmp/owned-test-profile');
 assert.equal(child.closed, true, 'profile removal waits for process close');
 assert.deepEqual(options, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
 removed = true;
} });
const pending = cleanup();
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(removed, false, 'shutdown writes cannot race immediate profile removal');
child.closed = true; child.emit('close'); await pending;
assert.equal(removed, true); assert.deepEqual(child.signals, ['SIGTERM']);
const alreadyClosed = fakeChild();
const cleanupClosed = browserCleanup(alreadyClosed, '/tmp/owned-test-profile', { remove: async () => {} });
alreadyClosed.emit('close'); await cleanupClosed(); assert.deepEqual(alreadyClosed.signals, []);
const stubborn = fakeChild(); let deletes = 0;
await assert.rejects(browserCleanup(stubborn, '/tmp/owned-test-profile', { timeoutMs: 5, remove: async () => { deletes++; } })(), /did not close/);
assert.deepEqual(stubborn.signals, ['SIGTERM', 'SIGKILL']); assert.equal(deletes, 0);
const killed = fakeChild(); killed.kill = signal => { killed.signals.push(signal); if (signal === 'SIGKILL') killed.emit('close'); };
await browserCleanup(killed, '/tmp/owned-test-profile', { timeoutMs: 5, remove: async () => {} })();
assert.deepEqual(killed.signals, ['SIGTERM', 'SIGKILL']);
const qaFailure = new Error('visible warning must fail QA');
await assert.rejects(async () => { try { throw qaFailure; } finally { await cleanupClosed(); } }, error => error === qaFailure);
const deletionFailure = new Error('persistent profile removal failure');
const badRemoval = fakeChild();
const cleanupBad = browserCleanup(badRemoval, '/tmp/owned-test-profile', { remove: async () => { throw deletionFailure; } });
badRemoval.emit('close'); await assert.rejects(cleanupBad(), error => error === deletionFailure);
console.log('browser cleanup: waits for close, bounded termination/removal and genuine failure propagation pass');

// Startup regressions use simulated time; no real browser, network or sleep.
const { waitForBrowserEndpoint } = await import('../lib/browser-startup.mjs');
const endpoint = '9222\n/devtools/browser/01234567-89ab-cdef-0123-456789abcdef\n';
const missing = () => { throw Object.assign(new Error('not ready'), { code: 'ENOENT' }); };
const launchCase = async ({ readyAt = 0, timeoutMs = 30000, pollMs = 100, read, tick, state = {} } = {}) => {
  let time = 0;
  const process = Object.assign(new EventEmitter(), { pid: 123, exitCode: null, signalCode: null,
    stderr: new EventEmitter(), ...state });
  try {
    const result = await waitForBrowserEndpoint(process, '/tmp/owned-startup-profile', {
      timeoutMs, pollMs, now: () => time, executable: '/test/chrome',
      readFile: async () => read ? read(time, process) : time >= readyAt ? endpoint : missing(),
      sleep: async ms => { time += ms; tick?.(time, process); },
    });
    return { result, time };
  } finally {
    assert.equal(process.listenerCount('error'), 0, 'startup removes only its owned process listener');
    assert.equal(process.stderr.listenerCount('data'), 0, 'startup removes its stderr timing listener');
  }
};
const slow = await launchCase({ readyAt: 12000, tick: (time, process) => { if (time === 7000) process.stderr.emit('data', 'startup'); } });
assert.equal(slow.time, 12000); assert.equal(slow.result.launch.firstStderrMs, 7000);
assert.equal(slow.result.port, '9222'); assert.equal(slow.result.launch.portFileStatus, 'complete');
await assert.rejects(launchCase({ readyAt: 12000, timeoutMs: 10000 }), error => error.browserLaunch.elapsedMs === 10000);
await assert.rejects(launchCase({ readyAt: Infinity, timeoutMs: 250, pollMs: 100 }), error => {
  assert.equal(error.browserLaunch.elapsedMs, 250, 'final sleep is capped by remaining budget');
  assert.equal(error.browserLaunch.pid, 123); assert.equal(error.browserLaunch.portFileStatus, 'ENOENT');
  return /did not become ready/.test(error.message);
});
for (const state of [{ exitCode: 0 }, { exitCode: 1 }, { signalCode: 'SIGKILL' }]) {
  await assert.rejects(launchCase({ state }), error => /exited before readiness/.test(error.message) && error.browserLaunch.elapsedMs === 0);
}
await assert.rejects(launchCase({ readyAt: Infinity, tick: (_, process) => process.emit('error', Object.assign(new Error('missing executable'), { code: 'ENOENT' })) }),
  error => /spawn failed: ENOENT/.test(error.message) && error.browserLaunch.elapsedMs === 100);
await assert.rejects(launchCase({ read: () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } }),
  error => /could not be read: EACCES/.test(error.message) && error.browserLaunch.elapsedMs === 0);
const partial = await launchCase({ read: time => time === 0 ? '' : time === 100 ? '9222\n' : endpoint });
assert.equal(partial.time, 200);
for (const active of ['0\n/devtools/browser/id', '65536\n/devtools/browser/id', 'abc\n/devtools/browser/id',
  '9222\nhttp://external.example', '9222\n/devtools/page/id', '9222\n/devtools/browser/id\nextra']) {
  await assert.rejects(launchCase({ read: () => active }), /Invalid Chrome debugging endpoint/);
}
for (const timeoutMs of [0, -1, Infinity, NaN]) await assert.rejects(launchCase({ timeoutMs }), /Invalid Chrome startup/);
let stalledTime = 0, readSignal, cleared = 0, settleRead;
const stalledChild = Object.assign(new EventEmitter(), { pid: 321, exitCode: null, signalCode: null, stderr: new EventEmitter() });
await assert.rejects(waitForBrowserEndpoint(stalledChild, '/tmp/owned-stalled-profile', {
  timeoutMs: 30000, now: () => stalledTime,
  readFile: (_, { signal }) => { readSignal = signal; return new Promise(resolve => { settleRead = resolve; }); },
  setTimer: (callback, ms) => { queueMicrotask(() => { stalledTime += ms; callback(); }); return 1; },
  clearTimer: id => { assert.equal(id, 1); cleared++; },
}), error => error.browserLaunch.elapsedMs === 30000 && error.browserLaunch.portFileStatus === 'read-timeout');
assert.equal(readSignal.aborted, true); assert.equal(cleared, 1);
assert.equal(stalledChild.listenerCount('error'), 0); assert.equal(stalledChild.stderr.listenerCount('data'), 0);
settleRead(endpoint); await Promise.resolve();
console.log('browser startup: bounded slow-start, non-start, process failures and endpoint validation pass');
