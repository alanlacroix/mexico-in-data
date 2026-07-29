// Keep the brief's no-JavaScript fallback readings in lockstep with the series files.
// Editorial copy and its review clock are intentionally untouched.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import briefStanding from './lib/brief-standing.cjs';

const { buildStanding } = briefStanding;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'data', 'brief.json');
const brief = JSON.parse(fs.readFileSync(file, 'utf8'));
const next = buildStanding();

if (JSON.stringify(brief.standing || null) === JSON.stringify(next)) {
  console.log('sync-brief-standing: already current');
} else {
  brief.standing = next;
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(brief, null, 2));
  fs.renameSync(temp, file);
  console.log('sync-brief-standing: updated the brief fallback readings');
}
