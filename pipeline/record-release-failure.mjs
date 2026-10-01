// Generation is not publication: the exact release gate must pass before a ledger
// can claim the new public artifact. Keep accounting and make recovery observable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import attemptsContract from './lib/edition-attempts.cjs';
import { preserveHeldEdition, RELEASE_FAILURE_REASON } from './lib/held-edition-recovery.mjs';

export function recordReleaseFailure(attempts, date, slot, options = {}) {
  const row = attemptsContract.slotAttempt(attempts, date, slot);
  if (row?.state !== 'published') throw new Error('Release failure requires a completed audited generation');
  const heldEdition = options.dataDirectory
    ? preserveHeldEdition({ ...options, attempts, date, slot }) : undefined;
  const failure = {
    failedAt: heldEdition?.heldAt || new Date(options.now || Date.now()).toISOString(),
    artifactHash: row.artifactHash,
    reason: RELEASE_FAILURE_REASON,
    previousReason: row.reason || '',
    diagnostics: structuredClone(row.diagnostics || []),
  };
  return attemptsContract.finishAttempt(attempts, date, slot, {
    state: 'failed', artifactHash: '',
    reason: RELEASE_FAILURE_REASON,
    releaseFailures: [...(row.releaseFailures || []), failure],
    ...(heldEdition ? { heldEdition } : {}),
  });
}

// CLI orchestration must record release failure even when preserving its artifact
// fails. Otherwise the always-persist workflow could commit a published ledger
// without committing that edition. Invalid held metadata deliberately blocks any
// paid fallback on the next bounded recovery.
export function persistReleaseFailure({ dataDirectory, date, slot, now = new Date(), runId, runAttempt }) {
  const file = path.join(dataDirectory, 'edition-attempts.json');
  const attempts = JSON.parse(fs.readFileSync(file, 'utf8'));
  let recorded;
  let preservationError = null;
  try {
    recorded = recordReleaseFailure(attempts, date, slot, { dataDirectory, now, runId, runAttempt });
  } catch (error) {
    const row = attemptsContract.slotAttempt(attempts, date, slot);
    if (row?.state !== 'published') throw error;
    const originalHash = row.artifactHash;
    const previousHeldEdition = row.heldEdition === undefined ? undefined : structuredClone(row.heldEdition);
    preservationError = String(error?.message || error).slice(0, 1000);
    recorded = recordReleaseFailure(attempts, date, slot, { now });
    const failed = attemptsContract.slotAttempt(recorded, date, slot);
    failed.heldEdition = {
      schemaVersion: 1,
      reason: 'release-preservation-failed',
      editorialDate: date,
      slot,
      artifactHash: originalHash,
      failedAt: new Date(now).toISOString(),
      preservationError,
      ...(previousHeldEdition === undefined ? {} : { previousHeldEdition }),
    };
    failed.releaseFailures.at(-1).preservationError = preservationError;
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(recorded, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { attempts: recorded, preservationError };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = persistReleaseFailure({
    dataDirectory: fileURLToPath(new URL('../data/', import.meta.url)),
    date: process.env.EDITORIAL_DATE,
    slot: process.env.PUBLICATION_SLOT,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  });
  if (result.preservationError) {
    console.error(`Release failed and its held artifact could not be preserved: ${result.preservationError}`);
    process.exitCode = 1;
  }
}
