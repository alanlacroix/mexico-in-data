// build-crosswalks.js — the ONE place fuzzy/name matching is allowed, run
// offline. Reads the geo-epoch reference artifacts (pipeline/reference/) + the
// human-reviewed override tables (crosswalks/overrides/), validates them, and
// freezes exact-lookup crosswalks that the runtime uses (never re-deriving).
// Per Fable: catalog + crosswalks + map geometry move together as ONE versioned
// geo-epoch, or keys silently drift.
//
//   node build-crosswalks.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REF = path.join(__dirname, 'reference');
const XW = path.join(__dirname, 'crosswalks');
const OVR = path.join(XW, 'overrides');
const GEO_OUT = path.join(__dirname, '..', 'data', 'geo');

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const exists = (f) => fs.existsSync(f);

function buildMunicipios() {
  const f = path.join(REF, 'municipios.cvegeo.json');
  if (!exists(f)) return { ok: false, why: 'reference/municipios.cvegeo.json missing (reference agent not done?)' };
  const raw = readJson(f);
  const list = Array.isArray(raw) ? raw : raw.list || raw.municipios;
  if (!Array.isArray(list)) return { ok: false, why: 'municipios file has no array' };

  const seen = new Set();
  const clean = [];
  for (const r of list) {
    const cvegeo = String(r.cvegeo || `${r.cve_ent}${r.cve_mun}`).padStart(5, '0');
    if (!/^\d{5}$/.test(cvegeo)) return { ok: false, why: `bad CVEGEO ${JSON.stringify(r)}` };
    if (seen.has(cvegeo)) continue;
    seen.add(cvegeo);
    clean.push({ cvegeo, cve_ent: cvegeo.slice(0, 2), cve_mun: cvegeo.slice(2), nom_mun: r.nom_mun || '', nom_ent: r.nom_ent || '' });
  }
  const epoch = process.env.GEO_EPOCH || (raw._meta?.vintage ? `mg-${raw._meta.vintage}` : 'mg-2020');
  const doc = { epoch, source: raw._meta?.source || 'INEGI Marco Geoestadístico', vintage: raw._meta?.vintage || 'unknown', list: clean };
  fs.writeFileSync(path.join(XW, 'municipios.frozen.json'), JSON.stringify(doc));
  return { ok: true, count: clean.length, epoch };
}

function buildImss(universe) {
  const seed = path.join(REF, 'imss-cvegeo.crosswalk.json');
  const map = {};
  let exact = 0, skipped = 0;
  if (exists(seed)) {
    const entries = readJson(seed);
    const arr = Array.isArray(entries) ? entries : entries.entries || [];
    for (const e of arr) {
      const ent = String(e.imss_ent ?? e.cve_ent ?? (e.cvegeo || '').slice(0, 2)).padStart(2, '0');
      const cvegeo = String(e.cvegeo || '').padStart(5, '0');
      // Only exact matches are auto-frozen; fuzzy/ambiguous must be confirmed via override.
      if (e.confidence === 'exact' && /^\d{5}$/.test(cvegeo)) { map[`${ent}:${e.imss_code}`] = cvegeo; exact++; }
      else skipped++;
    }
  }
  // Human-reviewed overrides win and add the ambiguous ones.
  const ovr = path.join(OVR, 'imss.json');
  let overrides = 0;
  if (exists(ovr)) {
    const o = readJson(ovr);
    for (const [k, v] of Object.entries(o)) { map[k] = String(v).padStart(5, '0'); overrides++; }
  }
  // Validate every target exists in the universe.
  const bad = universe ? Object.entries(map).filter(([, v]) => !universe.has(v)).map(([k]) => k) : [];
  if (universe && bad.length) return { ok: false, why: `IMSS crosswalk targets not in municipio universe: ${bad.slice(0, 8).join(', ')}` };
  fs.writeFileSync(path.join(XW, 'imss.frozen.json'), JSON.stringify({ map, meta: { exact, overrides, skipped } }));
  return { ok: true, exact, overrides, skipped, total: Object.keys(map).length };
}

function copyGeometry() {
  for (const name of ['mx-municipios.topojson', 'mx-municipios.topoJSON', 'municipios.topojson']) {
    const src = path.join(REF, name);
    if (exists(src)) {
      fs.mkdirSync(GEO_OUT, { recursive: true });
      fs.copyFileSync(src, path.join(GEO_OUT, 'municipios.topojson'));
      const kb = (fs.statSync(src).size / 1024).toFixed(0);
      return { ok: true, from: name, kb };
    }
  }
  return { ok: false, why: 'no municipio TopoJSON in reference/' };
}

fs.mkdirSync(XW, { recursive: true });
fs.mkdirSync(OVR, { recursive: true });

console.log('\n▶ Building geo-epoch crosswalks\n');
const muni = buildMunicipios();
console.log(`  municipios universe : ${muni.ok ? `${muni.count} municipios (epoch ${muni.epoch})` : 'SKIPPED — ' + muni.why}`);

let universe = null;
if (muni.ok) universe = new Set(readJson(path.join(XW, 'municipios.frozen.json')).list.map((r) => r.cvegeo));

const imss = buildImss(universe);
console.log(`  imss crosswalk      : ${imss.ok ? `${imss.total} codes (${imss.exact} exact + ${imss.overrides} override, ${imss.skipped} need review)` : 'FAILED — ' + imss.why}`);

const geo = copyGeometry();
console.log(`  map geometry        : ${geo.ok ? `${geo.from} -> data/geo/municipios.topojson (${geo.kb} KB)` : 'SKIPPED — ' + geo.why}`);

const report = { builtAt: new Date().toISOString(), municipios: muni, imss, geometry: geo };
fs.writeFileSync(path.join(XW, 'BUILD-REPORT.json'), JSON.stringify(report, null, 2));
console.log(`\n  report -> pipeline/crosswalks/BUILD-REPORT.json`);
if (!muni.ok || !geo.ok) console.log(`  ⚠ geo-epoch incomplete — map layers will fail-closed until reference artifacts land.\n`);
else console.log('');
