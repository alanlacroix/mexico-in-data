// One data gate for the one-page product. A valid old edition is allowed and stays
// visibly dated; malformed data, unsafe copy, or a partial edition blocks release.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  PAGE_DATA_CONTRACTS,
  assetId,
  isSafeHttpUrl,
  validPeriod,
  validateHealthDocument,
  validateNarrativeText,
  validateSeriesDocument,
} from './lib/publication-contract.js';
import { freshnessStatus } from './lib/freshness.js';
import publicEdition from './lib/public-edition.cjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const fails = [];
const warns = [];
const read = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));
const add = (label, errors) => errors.forEach((error) => fails.push(`${label}: ${error}`));

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

for (const file of walk(DATA).filter((value) => /\.(?:json|geojson|topojson)$/.test(value))) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fails.push(`${path.relative(ROOT, file)}: invalid JSON (${error.message})`); }
}

for (const [page, assets] of Object.entries(PAGE_DATA_CONTRACTS)) {
  for (const asset of new Set(assets)) if (!exists(asset)) fails.push(`${page}: required asset ${asset} is missing`);
}

const servedById = new Map();
const seriesDir = path.join(DATA, 'series');
for (const file of fs.readdirSync(seriesDir).filter((name) => name.endsWith('.json')).sort()) {
  const id = assetId(file);
  const relative = `data/series/${file}`;
  let document;
  try { document = read(relative); } catch { continue; }
  servedById.set(id, document);
  add(relative, validateSeriesDocument(document, id));
  const fresh = freshnessStatus({
    cadence: document.meta?.cadence,
    thresholds: { freshnessGraceDays: document.meta?.freshnessGraceDays },
  }, document.meta?.vintage);
  if (fresh?.stale) warns.push(`${id}: latest observation ${document.meta.vintage} is outside its release window`);
}

try {
  const health = read('data/health.json');
  const homepageSeries = new Set((PAGE_DATA_CONTRACTS.Brief || [])
    .map((asset) => /^data\/series\/([^/]+)\.json$/.exec(asset)?.[1]).filter(Boolean));
  const sources = (health.sources || []).filter((source) => homepageSeries.has(source.id));
  const narrowed = {
    ...health,
    sources,
    summary: {
      ok: sources.filter((source) => source.status === 'ok').length,
      flagged: sources.filter((source) => source.status === 'ok_flagged').length,
      failed: sources.filter((source) => source.status === 'failed').length,
      skipped: sources.filter((source) => source.status === 'skipped').length,
      darkSources: sources.filter((source) => source.status === 'failed' && source.stale).map((source) => source.id),
    },
  };
  add('data/health.json', validateHealthDocument(narrowed, servedById));
} catch (error) {
  fails.push(`data/health.json: ${error.message}`);
}

try {
  const edition = read('data/edition.json');
  add('data/edition.json', publicEdition.validateEdition(edition).errors);
  for (const story of edition.stories || []) {
    for (const locale of ['en', 'es']) {
      for (const field of publicEdition.TEXT_FIELDS) add(`edition ${story.id}.${locale}.${field}`, validateNarrativeText(story[locale]?.[field]));
    }
    if (!isSafeHttpUrl(story.url)) fails.push(`edition ${story.id}: invalid article URL`);
    for (const evidence of story.evidence || []) {
      if (!isSafeHttpUrl(evidence.url)) fails.push(`edition ${story.id}: invalid evidence URL ${evidence.id}`);
    }
  }
  for (const story of edition.weekStories || []) {
    for (const locale of ['en', 'es']) {
      for (const field of ['headline', 'dek']) add(`edition week ${story.id}.${locale}.${field}`, validateNarrativeText(story[locale]?.[field]));
    }
    if (!isSafeHttpUrl(story.url)) fails.push(`edition week ${story.id}: invalid article URL`);
  }
} catch (error) {
  fails.push(`data/edition.json: ${error.message}`);
}

try {
  const calendar = read('data/events.json');
  for (const [index, event] of (calendar.events || []).entries()) {
    for (const key of ['date', 'label', 'mechanism', 'source', 'sourceUrl']) if (!event[key]) fails.push(`events: row ${index + 1} missing ${key}`);
    if (!validPeriod(event.date)) fails.push(`events: row ${index + 1} has invalid date ${event.date}`);
    if (!isSafeHttpUrl(event.sourceUrl)) fails.push(`events: row ${index + 1} has invalid source URL`);
    for (const key of ['label', 'mechanism', 'source']) add(`events row ${index + 1}.${key}`, validateNarrativeText(event[key]));
  }
} catch (error) {
  fails.push(`data/events.json: ${error.message}`);
}

try {
  const nowBoard = createRequire(import.meta.url)(path.join(ROOT, '_data', 'nowBoard.js'));
  const today = new Date().toISOString().slice(0, 10);
  for (const card of nowBoard()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(card.date || '')) fails.push(`homepage figure ${card.label} has no observation date`);
    else if (card.date > today) fails.push(`homepage figure ${card.label} is future-dated ${card.date}`);
    if (!card.observed) fails.push(`homepage figure ${card.label} has no reader-visible as-of date`);
  }
} catch (error) {
  fails.push(`homepage figures: ${error.message}`);
}

warns.forEach((warning) => console.log(`  WARN ${warning}`));
if (fails.length) {
  fails.forEach((failure) => console.error(`  FAIL ${failure}`));
  console.error(`\nassert-data: ${fails.length} failure(s) — publication blocked.`);
  process.exit(1);
}
console.log(`assert-data: ok (${warns.length} warning${warns.length === 1 ? '' : 's'}).`);
