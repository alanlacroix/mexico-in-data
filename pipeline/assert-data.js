// assert-data.js — publication gate for the assembled data product.
// Fails only on conditions that would make a public page wrong or broken. Old but
// valid last-good data warn; the page must date it, not silently replace it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PAGE_DATA_CONTRACTS, BUILDER_OWNED_SERIES, assetId,
  validateSeriesDocument, validateLayerDocument, validateHealthDocument,
  validateHs4Hierarchy, validateNarrativeText, validateTopicAreasDocument,
  isSafeHttpUrl, validPeriod,
} from './lib/publication-contract.js';
import { freshnessStatus } from './lib/freshness.js';
import { lintReportText } from './lib/lint.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const fails = [], warns = [];
const read = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));
const addErrors = (label, errors) => errors.forEach((error) => fails.push(`${label}: ${error}`));
const checkText = (label, value) => { if (value !== undefined && value !== null && value !== '') addErrors(label, validateNarrativeText(value)); };
const dayAge = (value) => (Date.now() - Date.parse(value)) / 86_400_000;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

// 1. Every published JSON/GeoJSON/TopoJSON file must parse. A truncated atomic
// write is impossible in the connector harness, but this also protects manual and
// derived builders that do not yet use that harness.
for (const file of walk(DATA).filter((value) => /\.(?:json|geojson|topojson)$/.test(value))) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fails.push(`${path.relative(ROOT, file)}: invalid JSON (${error.message})`); }
}

// 2. Page contracts: publication is blocked if a control, chart, or drilldown file
// is absent. Runtime code may degrade gracefully, but production must ship complete.
for (const [page, assets] of Object.entries(PAGE_DATA_CONTRACTS)) {
  for (const asset of new Set(assets)) if (!exists(asset)) fails.push(`${page}: required asset ${asset} is missing`);
}

// 3. Connector-shaped files: exact id, provenance, finite values, unique ordered
// periods, and metadata tied to the latest observation.
const servedById = new Map();
const seriesDir = path.join(DATA, 'series');
for (const file of fs.readdirSync(seriesDir).filter((name) => name.endsWith('.json')).sort()) {
  const id = assetId(file), relative = `data/series/${file}`;
  let doc; try { doc = read(relative); } catch { continue; }
  servedById.set(id, doc);
  addErrors(relative, validateSeriesDocument(doc, id));
  const fresh = freshnessStatus({ cadence: doc.meta?.cadence, thresholds: { freshnessGraceDays: doc.meta?.freshnessGraceDays } }, doc.meta?.vintage);
  if (fresh?.stale) warns.push(`${id}: latest observation ${doc.meta.vintage} is older than the ${doc.meta.cadence} release window`);
}

let registryIds = null;
try {
  const registry = read('data/meta/municipios.json');
  const rows = Array.isArray(registry.m) ? registry.m : Object.entries(registry.m || {}).map(([id, row]) => ({ id, ...row }));
  registryIds = new Set(rows.map((row) => String(row.cvegeo || row.cve || row.id || '').padStart(5, '0')));
  if (!registryIds.size) throw new Error('no municipality ids');
} catch (error) { fails.push(`municipality registry: ${error.message}`); }

const layerDir = path.join(DATA, 'layers');
for (const file of fs.readdirSync(layerDir).filter((name) => name.endsWith('.json')).sort()) {
  const id = assetId(file), relative = `data/layers/${file}`;
  let doc; try { doc = read(relative); } catch { continue; }
  servedById.set(id, doc);
  addErrors(relative, validateLayerDocument(doc, id, registryIds));
  const fresh = freshnessStatus({ cadence: doc.meta?.cadence, thresholds: { freshnessGraceDays: doc.meta?.freshnessGraceDays } }, doc.meta?.vintage);
  if (fresh?.stale) warns.push(`${id}: latest observation ${doc.meta.vintage} is older than the ${doc.meta.cadence} release window`);
}

// 4. Health must describe what is actually served. Builder-owned trade series are
// explicitly classified; any other unmonitored series is an architecture regression.
let health = null;
try {
  health = read('data/health.json');
  addErrors('data/health.json', validateHealthDocument(health, servedById));
  const tracked = new Set((health.sources || []).map((source) => source.id));
  for (const id of servedById.keys()) {
    if (!tracked.has(id) && !BUILDER_OWNED_SERIES.has(id)) fails.push(`${id}: served data has no health record or declared builder owner`);
  }
  for (const source of health.sources || []) {
    if (!['ok', 'ok_flagged'].includes(source.status) || !source.vintage) continue;
    const current = freshnessStatus({ cadence: source.cadence, thresholds: { freshnessGraceDays: source.freshnessGraceDays } }, source.vintage);
    const hasStale = (source.flags || []).some((flag) => String(flag).startsWith('stale_'));
    if (current?.stale && !hasStale) warns.push(`${source.id}: health does not yet carry its computed stale flag`);
    if (current && !current.stale && hasStale) warns.push(`${source.id}: health carries a stale flag that no longer matches the release-aware rule`);
  }
} catch (error) { fails.push(`data/health.json: ${error.message}`); }

// 5. Deterministic facts must agree exactly with their source series. This stops a
// fresh page from showing an old computed summary after only the raw feed updated.
try {
  const facts = read('data/analysis/facts.json');
  if (!Number.isFinite(Date.parse(facts.generatedAt))) fails.push('facts: generatedAt is invalid');
  if (!facts.metrics || typeof facts.metrics !== 'object') fails.push('facts: metrics are missing');
  else for (const [id, metric] of Object.entries(facts.metrics)) {
    const source = servedById.get(id), latest = source?.data?.at(-1);
    if (!source) { warns.push(`facts: ${id} has no connector-shaped source file`); continue; }
    const sourceValue = Number(latest?.value), factValue = Number(metric.value);
    // The facts pack stores display-ready values rounded to four decimals.
    const tolerance = Math.max(5e-5, Math.abs(sourceValue) * 1e-6);
    if (!latest || String(metric.date) !== String(latest.date) || !Number.isFinite(factValue) || Math.abs(factValue - sourceValue) > tolerance) {
      fails.push(`facts: ${id} does not match the latest served observation`);
    }
  }
  if (dayAge(facts.generatedAt) > 8) warns.push(`facts: generated ${Math.floor(dayAge(facts.generatedAt))} days ago`);
} catch (error) { fails.push(`data/analysis/facts.json: ${error.message}`); }

// 6. Narrative/context contracts: every public claim row is dated, named, and
// linked. Brief references must resolve to the curated event ledger.
try {
  const happening = read('data/happening.json');
  const events = happening.events || [];
  const ids = new Set();
  for (const [index, event] of events.entries()) {
    if (!event.id || ids.has(event.id)) fails.push(`happening: duplicate or missing id at row ${index}`);
    ids.add(event.id);
    for (const key of ['date', 'section', 'title', 'source', 'url']) if (!event[key]) fails.push(`happening: ${event.id || index} missing ${key}`);
    if (!validPeriod(event.date)) fails.push(`happening: ${event.id || index} has invalid date ${event.date}`);
    for (const key of ['title', 'source', 'why']) checkText(`happening: ${event.id || index}.${key}`, event[key]);
    if (!isSafeHttpUrl(event.url)) fails.push(`happening: ${event.id || index} has invalid source URL`);
  }
  if (happening.meta?.count !== events.length) fails.push(`happening: meta.count ${happening.meta?.count} does not match ${events.length}`);
  if (dayAge(happening.meta?.generatedAt) > 4) warns.push(`happening: generated ${Math.floor(dayAge(happening.meta.generatedAt))} days ago`);

  const brief = read('data/brief.json');
  const claims = [brief.lead, ...(brief.items || [])].filter(Boolean);
  if (!brief.lead || !brief.items?.length) fails.push('brief: needs a lead and at least one item');
  if (brief.meta?.count !== claims.length) fails.push(`brief: meta.count ${brief.meta?.count} does not match ${claims.length} total claims`);
  for (const [index, claim] of claims.entries()) {
    for (const key of [index ? 'headline' : 'h1', 'context', 'href', 'source']) if (!claim[key]) fails.push(`brief: claim ${index + 1} missing ${key}`);
    for (const key of [index ? 'headline' : 'h1', 'context', 'source']) checkText(`brief: claim ${index + 1}.${key}`, claim[key]);
    if (!isSafeHttpUrl(claim.href)) fails.push(`brief: claim ${index + 1} has invalid source URL`);
    if (!Array.isArray(claim.refs) || !claim.refs.length) fails.push(`brief: claim ${index + 1} has no evidence ref`);
    for (const ref of claim.refs || []) if (!ids.has(ref)) fails.push(`brief: evidence ref ${ref} is absent from happening.json`);
  }
  for (const live of brief.standing?.live || []) if (!servedById.has(live.series)) fails.push(`brief: standing line needs missing series ${live.series}`);
  if (dayAge(brief.meta?.generatedAt) > 4) warns.push(`brief: generated ${Math.floor(dayAge(brief.meta.generatedAt))} days ago`);

  const areas = read('data/areas.json');
  addErrors('areas taxonomy', validateTopicAreasDocument(areas));
  const areaKeys = new Set();
  for (const [index, area] of (areas.areas || []).entries()) {
    if (!area.key || areaKeys.has(area.key)) fails.push(`areas: duplicate or missing key at row ${index}`);
    areaKeys.add(area.key);
    for (const key of ['label', 'href']) if (!area[key]) fails.push(`areas: ${area.key || index} missing ${key}`);
    checkText(`areas: ${area.key || index}.label`, area.label);
    checkText(`areas: ${area.key || index}.synthesis`, area.synthesis);
    if (!['reviewed', 'generated-gated', 'unavailable'].includes(area.synthesisStatus)) fails.push(`areas: ${area.key || index} has invalid synthesisStatus`);
    if (area.synthesisStatus === 'unavailable' && area.synthesis) fails.push(`areas: ${area.key || index} marks a synthesis unavailable but includes one`);
    if (area.synthesisStatus !== 'unavailable' && !area.synthesis) fails.push(`areas: ${area.key || index} marks a synthesis available but has none`);
    for (const [headlineIndex, headline] of (area.headlines || []).entries()) {
      for (const key of ['title', 'source', 'url', 'date']) if (!headline[key]) fails.push(`areas: ${area.key} headline ${headlineIndex + 1} missing ${key}`);
      for (const key of ['title', 'source']) checkText(`areas: ${area.key} headline ${headlineIndex + 1}.${key}`, headline[key]);
      if (!validPeriod(headline.date)) fails.push(`areas: ${area.key} headline ${headlineIndex + 1} has invalid date`);
      if (!isSafeHttpUrl(headline.url)) fails.push(`areas: ${area.key} headline ${headlineIndex + 1} has invalid source URL`);
      const event = events.find((candidate) => candidate.title === headline.title && candidate.url === headline.url);
      if (!event) {
        fails.push(`areas: ${area.key} headline ${headlineIndex + 1} is not backed by the curated event ledger`);
      } else {
        const context = String(event.context || '').replace(/\s+/g, ' ').trim();
        const gate = lintReportText({ text: context, inputs: [event.date, event.title, context], maxWords: 45, maxSentences: 2 });
        if (!gate.ok) fails.push(`areas: ${area.key} headline ${headlineIndex + 1} lacks reviewed context that passes the report gate (${gate.flags.join('; ')})`);
      }
    }
  }
  if (!(areas.areas || []).length) fails.push('areas: no topic summaries');
  if (dayAge(areas.meta?.generatedAt) > 4) warns.push(`areas: generated ${Math.floor(dayAge(areas.meta.generatedAt))} days ago`);

  const calendar = read('data/events.json');
  for (const [index, event] of (calendar.events || []).entries()) {
    for (const key of ['date', 'label', 'mechanism', 'source', 'sourceUrl']) if (!event[key]) fails.push(`events: row ${index + 1} missing ${key}`);
    for (const key of ['label', 'mechanism', 'source']) checkText(`events: row ${index + 1}.${key}`, event[key]);
    if (!validPeriod(event.date)) fails.push(`events: row ${index + 1} has invalid date ${event.date}`);
    if (!isSafeHttpUrl(event.sourceUrl)) fails.push(`events: row ${index + 1} has invalid source URL`);
  }
} catch (error) { fails.push(`narrative contracts: ${error.message}`); }

// 7. Atlas and trade hierarchy invariants. A visual hierarchy must conserve the
// quantity it partitions; otherwise area/length no longer means the stated value.
try {
  const atlas = read('data/atlas-states.json');
  const states = Object.entries(atlas.states || {});
  if (states.length !== 32) fails.push(`atlas: expected 32 states, found ${states.length}`);
  for (const [code, state] of states) {
    if (!/^\d{2}$/.test(code)) fails.push(`atlas: invalid state code ${code}`);
    for (const key of ['name', 'official_name', 'gdp_mxn_m', 'gdppc_mxn', 'pop', 'poverty', 'informality']) if (state[key] === undefined || state[key] === null) fails.push(`atlas: ${code} missing ${key}`);
    for (const key of ['gdp_mxn_m', 'gdppc_mxn', 'pop', 'poverty', 'informality']) if (!Number.isFinite(state[key])) fails.push(`atlas: ${code}.${key} is not finite`);
  }
  const stateSum = states.reduce((sum, [, state]) => sum + Number(state.gdp_mxn_m || 0), 0);
  const stated = Number(atlas.meta?.national?.state_gdp_sum_mxn_m);
  if (!Number.isFinite(stated) || Math.abs(stateSum - stated) / stated > 1e-9) fails.push('atlas: state GDP does not reconcile to the stated state sum');
  for (const [key, source] of Object.entries(atlas.meta?.sources || {})) {
    if (!source.label || !source.period || !source.unit || !/^https?:\/\//.test(source.url || '')) fails.push(`atlas: source ${key} is incomplete`);
  }
} catch (error) { fails.push(`data/atlas-states.json: ${error.message}`); }

try {
  addErrors('trade HS4 hierarchy', validateHs4Hierarchy(read('data/trade/exports-hs4.json'), read('data/trade/exports-by-product.json')));
} catch (error) { fails.push(`trade hierarchy: ${error.message}`); }

warns.forEach((warning) => console.log(`  WARN ${warning}`));
if (fails.length) {
  fails.forEach((failure) => console.error(`  FAIL ${failure}`));
  console.error(`\nassert-data: ${fails.length} failure(s) — publication blocked.`);
  process.exit(1);
}
console.log(`assert-data: ok (${warns.length} warning${warns.length === 1 ? '' : 's'}).`);
