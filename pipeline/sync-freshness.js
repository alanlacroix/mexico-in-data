// sync-freshness.js — reconcile time-dependent stale flags without refetching.
// Useful when a source is temporarily unavailable: last-good stays untouched in
// value/provenance, while its freshness label can still age honestly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stalenessFlag } from './lib/freshness.js';
import { writeAtomic } from './lib/lastgood.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const docs = new Map();

for (const sub of ['series', 'layers']) {
  const dir = path.join(DATA, sub);
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.json'))) {
    const file = path.join(dir, name), doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!doc.meta?.id || !doc.meta?.vintage) continue;
    const flags = (doc.meta.flags || []).filter((flag) => !String(flag).startsWith('stale_'));
    const stale = stalenessFlag({ cadence: doc.meta.cadence, thresholds: { freshnessGraceDays: doc.meta.freshnessGraceDays } }, doc.meta.vintage);
    if (stale) flags.push(stale);
    if (JSON.stringify(flags) !== JSON.stringify(doc.meta.flags || [])) {
      doc.meta.flags = flags;
      writeAtomic(file, JSON.stringify(doc));
    }
    docs.set(doc.meta.id, doc);
  }
}

const healthFile = path.join(DATA, 'health.json');
const health = JSON.parse(fs.readFileSync(healthFile, 'utf8'));
for (const source of health.sources || []) {
  if (!['ok', 'ok_flagged'].includes(source.status)) continue;
  const doc = docs.get(source.id);
  if (!doc) continue;
  source.flags = [...(doc.meta.flags || [])];
  source.status = source.flags.length ? 'ok_flagged' : 'ok';
}
health.summary.ok = health.sources.filter((source) => source.status === 'ok').length;
health.summary.flagged = health.sources.filter((source) => source.status === 'ok_flagged').length;
health.summary.failed = health.sources.filter((source) => source.status === 'failed').length;
health.summary.skipped = health.sources.filter((source) => source.status === 'skipped').length;
health.summary.darkSources = health.sources.filter((source) => source.status === 'failed' && source.stale).map((source) => source.id);
writeAtomic(healthFile, JSON.stringify(health, null, 2));
console.log(`freshness: ${health.summary.ok} current · ${health.summary.flagged} flagged · ${health.summary.failed} failed · ${health.summary.skipped} paused`);
