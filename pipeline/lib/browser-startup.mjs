import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

// One launch, one bounded monotonic deadline. A slow runner gets startup time,
// never permission to skip the endpoint handshake or any subsequent page check.
// 30s matches Puppeteer's documented launch allowance (pptr.dev/api/puppeteer.launchoptions).
// CI observed initial process activity only around 7s on a slow runner; record
// timings rather than attributing ordinary Chrome stderr to an unproven cause.
export async function waitForBrowserEndpoint(child, profile, {
  timeoutMs = 30000, pollMs = 100, now = () => performance.now(),
  readFile = fs.readFile, sleep = delay, executable = '',
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(pollMs) || pollMs <= 0) {
    throw new Error('Invalid Chrome startup deadline or polling interval');
  }
  const started = now();
  const state = { executable, pid: child.pid ?? null, timeoutMs, pollCount: 0,
    firstStderrMs: null, lastStderrMs: null, portFileStatus: 'not-read' };
  let launchError;
  const onError = error => { launchError = error; };
  const onStderr = () => {
    const elapsed = Math.max(0, now() - started);
    state.firstStderrMs ??= elapsed;
    state.lastStderrMs = elapsed;
  };
  child.on('error', onError);
  child.stderr?.on('data', onStderr);
  const diagnostics = () => ({ ...state, elapsedMs: Math.max(0, now() - started),
    exitCode: child.exitCode ?? null, signalCode: child.signalCode ?? null });
  const fail = message => {
    const error = new Error(message);
    error.browserLaunch = diagnostics();
    return error;
  };
  const checkChild = () => {
    if (launchError) throw fail(`Chrome spawn failed: ${launchError.code || launchError.message}`);
    if (child.exitCode !== null && child.exitCode !== undefined || child.signalCode) {
      throw fail(`Chrome exited before readiness: code=${child.exitCode}, signal=${child.signalCode}`);
    }
  };
  try {
    while (now() - started < timeoutMs) {
      checkChild();
      let active;
      state.pollCount++;
      const abort = new AbortController();
      let timer;
      try {
        active = await Promise.race([
          readFile(path.join(profile, 'DevToolsActivePort'), { encoding: 'utf8', signal: abort.signal }),
          new Promise((_, reject) => {
            timer = setTimer(() => {
              state.portFileStatus = 'read-timeout';
              reject(fail(`Chrome readiness file exceeded ${timeoutMs}ms startup deadline`));
              abort.abort();
            }, Math.max(0, timeoutMs - (now() - started)));
          }),
        ]);
      } catch (error) {
        if (error.browserLaunch) throw error;
        state.portFileStatus = error.code || 'read-error';
        if (error.code !== 'ENOENT') throw fail(`Chrome port file could not be read: ${error.code || error.message}`);
      } finally {
        clearTimer(timer);
      }
      checkChild();
      if (now() - started >= timeoutMs) break;
      if (active !== undefined) {
        const lines = active.trim().split('\n');
        state.portFileStatus = !active.trim() ? 'empty' : lines.length < 2 || !lines[1].trim() ? 'partial' : 'complete';
        if (state.portFileStatus === 'complete') {
          const port = lines[0].trim();
          const socketPath = lines[1].trim();
          if (lines.length !== 2 || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535
            || !/^\/devtools\/browser\/[a-z0-9_-]+$/i.test(socketPath)) throw fail('Invalid Chrome debugging endpoint');
          return { port, socketPath, launch: diagnostics() };
        }
      }
      await sleep(Math.min(pollMs, Math.max(0, timeoutMs - (now() - started))));
    }
    checkChild();
    throw fail(`Chrome did not become ready within ${timeoutMs}ms`);
  } finally {
    child.removeListener('error', onError);
    child.stderr?.removeListener('data', onStderr);
  }
}
