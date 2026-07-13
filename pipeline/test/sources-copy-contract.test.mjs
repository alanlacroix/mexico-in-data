import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = fs.readFileSync(path.join(root, 'sources.njk'), 'utf8');

const internalOrOverstatedCopy = [
  /verify endpoint/i,
  /verify paths/i,
  /definitive external diagnosis/i,
  /best public high-frequency activity nowcast/i,
  /almost nobody wires/i,
  /most briefings never wire/i,
  /pipeline check:/i,
  /pipeline connector paused/i,
];

for (const phrase of internalOrOverstatedCopy) {
  assert.doesNotMatch(source, phrase, `Sources page must not publish internal or overstated copy: ${phrase}`);
}

assert.match(source, /Last checked:/, 'feed health should use reader-facing check language');
assert.match(source, /supporting signals, not substitutes for the official releases/i,
  'alternative sources should be framed as supporting evidence');

console.log('sources-copy-contract: ok');
