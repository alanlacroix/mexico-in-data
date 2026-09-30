// A deployment retry never regenerates content and may be claimed once per artifact.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export function claimDeploymentRetry(attempts, edition, now = new Date().toISOString()) {
  const row = attempts.attempts.find(row => row.editorialDate === edition.editorialDate
    && row.state === 'published' && row.artifactHash === edition.artifactHash);
  if (!row) throw new Error('No published attempt matches the exact deployment artifact');
  if (row.deploymentRecovery?.artifactHash === edition.artifactHash && row.deploymentRecovery.attempts >= 1) {
    throw new Error('Deployment retry exhausted for this artifact; manual diagnosis required');
  }
  row.deploymentRecovery = { artifactHash: edition.artifactHash, attempts: 1, claimedAt: now };
  return attempts;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = new URL('../data/edition-attempts.json', import.meta.url);
  const edition = JSON.parse(fs.readFileSync(new URL('../data/edition.json', import.meta.url), 'utf8'));
  const attempts = claimDeploymentRetry(JSON.parse(fs.readFileSync(file,'utf8')),edition);
  fs.writeFileSync(file,`${JSON.stringify(attempts,null,2)}\n`);
}
