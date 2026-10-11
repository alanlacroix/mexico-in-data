import fs from 'node:fs/promises';

// Register immediately after spawn so a process that exits during QA is observed.
export function browserCleanup(child, profile, { timeoutMs = 3000, remove = fs.rm } = {}) {
  let closed = false;
  const closure = new Promise(resolve => child.once('close', () => { closed = true; resolve(); }));
  const waitForClose = async () => {
    if (closed) return true;
    let timer;
    try {
      return await Promise.race([closure.then(() => true), new Promise(resolve => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  };
  return async () => {
    if (!closed) child.kill('SIGTERM');
    if (!await waitForClose()) {
      child.kill('SIGKILL');
      if (!await waitForClose()) throw new Error('Chrome did not close before profile cleanup');
    }
    // Chrome subprocesses can finish profile writes just after the parent exits.
    await remove(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
}
