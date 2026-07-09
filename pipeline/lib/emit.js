// emit.js — write the served static JSON. Series go to data/series/, map layers
// to data/layers/. Writes are atomic. On success we also snapshot last-good.
// On failure the connector never calls emit, so the previously-served file
// (the last good one) simply stays in place — fail-closed by construction.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeAtomic } from './lastgood.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', '..', 'data');

export function emit(m, out) {
  const sub = m.kind === 'layer' ? 'layers' : 'series';
  const file = path.join(DATA, sub, `${m.id}.json`);
  writeAtomic(file, JSON.stringify(out));
  return path.relative(path.join(__dirname, '..', '..'), file);
}

export const DATA_DIR = DATA;
