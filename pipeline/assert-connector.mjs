// Publication gate for a scoped connector workflow. The orchestrator now exits
// non-zero when a scoped fetch fails; this second gate validates the artifact,
// vintage, and merged health record before a monthly job can commit it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLayerDocument, validateSeriesDocument } from './lib/publication-contract.js';
import { observationPeriodEnd } from './lib/freshness.js';

const id = process.argv[2];
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('usage: node assert-connector.mjs <connector-id>');
  process.exit(2);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const health = JSON.parse(fs.readFileSync(path.join(root, 'data', 'health.json'), 'utf8'));
const source = health.sources?.find((row) => row.id === id);
if (!source) throw new Error(`${id}: missing from data/health.json`);
if (!['ok', 'ok_flagged'].includes(source.status)) {
  throw new Error(`${id}: scoped refresh did not succeed (${source.status}: ${source.message || 'no message'})`);
}

const subdir = source.kind === 'layer' ? 'layers' : 'series';
const file = path.join(root, 'data', subdir, `${id}.json`);
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
let registryIds = null;
if (source.kind === 'layer') {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'meta', 'municipios.json'), 'utf8'));
  const rows = Array.isArray(registry.m) ? registry.m : Object.entries(registry.m || {}).map(([key, row]) => ({ id: key, ...row }));
  registryIds = new Set(rows.map((row) => String(row.cvegeo || row.cve || row.id || '').padStart(5, '0')));
}
const errors = source.kind === 'layer'
  ? validateLayerDocument(doc, id, registryIds)
  : validateSeriesDocument(doc, id);
if (errors.length) throw new Error(`${id}: ${errors.join('; ')}`);
if (String(source.vintage) !== String(doc.meta.vintage)) throw new Error(`${id}: health and served vintages differ`);

const maxAgeAt = process.argv.indexOf('--max-age-days');
if (maxAgeAt >= 0) {
  const maxAgeDays = Number(process.argv[maxAgeAt + 1]);
  const periodEnd = observationPeriodEnd(doc.meta.vintage, doc.meta.cadence);
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0 || !periodEnd) throw new Error(`${id}: invalid --max-age-days check`);
  const ageDays = Math.max(0, (Date.now() - periodEnd.getTime()) / 86_400_000);
  if (ageDays > maxAgeDays) {
    throw new Error(`${id}: latest observation ${doc.meta.vintage} is ${Math.floor(ageDays)} days past its period end (limit ${maxAgeDays})`);
  }
}

console.log(`${id}: connector output validated (${source.status}, vintage ${source.vintage})`);
