// Generation is not publication: the exact release gate must pass before a ledger
// can claim the new public artifact. Keep accounting and make recovery observable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import attemptsContract from './lib/edition-attempts.cjs';

export function recordReleaseFailure(attempts, date, slot) {
  return attemptsContract.finishAttempt(attempts, date, slot, {
    state: 'failed', artifactHash: '',
    reason: 'Exact site release validation failed; the last good public edition was retained',
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = new URL('../data/edition-attempts.json', import.meta.url);
  const attempts = recordReleaseFailure(JSON.parse(fs.readFileSync(file, 'utf8')),
    process.env.EDITORIAL_DATE, process.env.PUBLICATION_SLOT);
  fs.writeFileSync(file, `${JSON.stringify(attempts, null, 2)}\n`);
}
