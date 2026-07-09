// crosswalk.js — the frozen, exact-or-fail crosswalk regime. This is the #1
// accuracy investment. RULE (Fable, non-negotiable): NO fuzzy matching at
// runtime, ever. Fuzzy/name matching happens ONCE, offline, in build-crosswalks.js;
// its output is a frozen artifact checked into pipeline/crosswalks/. At runtime we
// only ever do exact lookup — and a miss is a HARD failure, never a silent drop.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XWALK_DIR = path.join(__dirname, '..', 'crosswalks');

const cache = new Map();

function load(name) {
  if (cache.has(name)) return cache.get(name);
  const file = path.join(XWALK_DIR, `${name}.frozen.json`);
  if (!fs.existsSync(file))
    throw new Error(`crosswalk "${name}" not built — run \`npm run build:crosswalks\` (missing ${file})`);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  cache.set(name, doc);
  return doc;
}

/**
 * Map a source-native code to canonical CVEGEO. Exact-or-throw.
 * Optionally scoped by state (Banxico/IMSS names duplicate across states, so
 * the match MUST be within `cve_ent`).
 * @returns {string} 5-digit CVEGEO
 */
export function toCvegeo(crosswalkName, sourceCode, { cve_ent } = {}) {
  const doc = load(crosswalkName);
  const key = cve_ent ? `${cve_ent}:${sourceCode}` : String(sourceCode);
  const hit = doc.map[key];
  if (!hit) throw new Error(`crosswalk ${crosswalkName}: no CVEGEO for "${key}" (exact-or-fail; add to override table)`);
  return hit;
}

/** The canonical municipio universe for the current geo-epoch. */
export function municipioUniverse() {
  return load('municipios').list; // [{cvegeo, cve_ent, cve_mun, nom_mun, nom_ent}]
}

export function geoEpoch() {
  const doc = load('municipios');
  return { epoch: doc.epoch, source: doc.source, vintage: doc.vintage, count: doc.list.length };
}

/**
 * Coverage check for a layer: how many of its keys are valid municipios, and
 * whether it fell below the source's expected-coverage band. Per Fable, absolute
 * "~2469 present" is wrong — coverage is per-source (IMSS only covers municipios
 * with registered employers). We check the band vs the source's own expectation.
 */
export function coverageReport(values, { minCovered } = {}) {
  const universe = new Set(municipioUniverse().map((r) => r.cvegeo));
  const keys = Object.keys(values);
  const invalid = keys.filter((k) => !universe.has(k));
  const covered = keys.length - invalid.length;
  const report = { covered, invalid: invalid.slice(0, 20), invalidCount: invalid.length, universe: universe.size };
  if (invalid.length) report.error = `${invalid.length} keys are not valid CVEGEO codes`;
  if (typeof minCovered === 'number' && covered < minCovered)
    report.belowBand = `covered ${covered} < expected floor ${minCovered}`;
  return report;
}
