import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWatchdog } from './src/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repositoryReceipt = fs.readFileSync(path.join(root, 'data', 'publication-status.json'), 'utf8');
const result = await runWatchdog({
  ...process.env,
  // The in-repository fallback answers whether the publication job ran. It does
  // not depend on the public site being reachable from a GitHub runner. The
  // independent Cloudflare watchdog separately checks the actual live receipt.
  PUBLICATION_STATUS_JSON: repositoryReceipt,
}, new Date());
console.log(JSON.stringify(result));
