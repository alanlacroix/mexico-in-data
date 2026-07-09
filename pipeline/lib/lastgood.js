// lastgood.js — fail-closed baseline. The "last good" version of any output IS
// the file currently committed under data/ (that's what the site serves and what
// CI committed on the previous successful run). Reading prior state from there —
// rather than a side directory — means the completeness/collapse check has a real
// baseline across CI runs with nothing extra to persist. On failure a connector
// never calls emit(), so the committed file simply stays in place = fail-closed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', '..', 'data');

/** Load the currently-served output for a connector (its manifest), or null. */
export function loadLastGood(m) {
  const sub = m.kind === 'layer' ? 'layers' : 'series';
  const f = path.join(DATA, sub, `${m.id}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

// Atomic write: temp file + rename, so a crash mid-write never leaves a
// truncated file that a later run would mistake for a real (collapsed) payload.
export function writeAtomic(file, contents) {
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, file);
}
