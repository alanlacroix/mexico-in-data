// build-registry.js — the municipio registry: CVEGEO -> { nombre, estado, población }.
// The spine Fable flagged: unlocks map tooltips-with-names, per-capita rates
// (crime per 100k), and the profile card. Names come from the frozen INEGI
// catalog; population from INEGI Censo 2020 via the Indicadores API (1002000001),
// fetched per municipio with a small concurrency pool. One-time / rebuild-on-epoch.
//
//   INEGI_TOKEN=... node build-registry.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REF = path.join(__dirname, 'reference', 'municipios.cvegeo.json');
const OUT = path.join(__dirname, '..', 'data', 'meta', 'municipios.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

// load token from pipeline/.env if not in env
if (!process.env.INEGI_TOKEN && fs.existsSync(path.join(__dirname, '.env'))) {
  for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l); if (m) process.env[m[1]] ||= m[2];
  }
}
const TOKEN = process.env.INEGI_TOKEN;
if (!TOKEN) throw new Error('need INEGI_TOKEN');

const cat = JSON.parse(fs.readFileSync(REF, 'utf8'));
const list = (Array.isArray(cat) ? cat : cat.list).map((r) => ({ cvegeo: String(r.cvegeo).padStart(5, '0'), nom: r.nom_mun, ent: r.nom_ent }));

async function pop(cvegeo) {
  const url = `https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR/1002000001/es/${cvegeo}/false/BISE/2.0/${TOKEN}?type=json`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const j = await res.json();
    const obs = j?.Series?.[0]?.OBSERVATIONS;
    if (!obs?.length) return null;
    // ORDER-PROOF: INEGI returns observations newest-first (grabbing the last
    // entry silently yields the 1995 census — a real bug we shipped once).
    // Select by max TIME_PERIOD explicitly, never by array position.
    let best = null;
    for (const o of obs) {
      const v = Number(o.OBS_VALUE);
      if (!Number.isFinite(v) || v <= 0) continue;
      if (!best || String(o.TIME_PERIOD) > String(best.t)) best = { t: o.TIME_PERIOD, v };
    }
    return best ? { pob: Math.round(best.v), vintage: String(best.t) } : null;
  } catch { return null; }
}

// concurrency pool
const CONC = 6;
const out = {};
let done = 0, missing = 0;
let i = 0;
async function worker() {
  while (i < list.length) {
    const item = list[i++];
    const p = await pop(item.cvegeo);
    out[item.cvegeo] = { nom: item.nom, ent: item.ent, pob: p ? p.pob : null, pv: p ? p.vintage : null };
    if (p == null) missing++;
    if (++done % 250 === 0) console.log(`  ${done}/${list.length} (missing pop: ${missing})`);
  }
}
console.log(`\nBuilding municipio registry for ${list.length} municipios via INEGI…`);
await Promise.all(Array.from({ length: CONC }, worker));

// ---- HARD SANITY GATE (accuracy-first: refuse to write garbage) ----
// National sum must look like modern Mexico (Censo 2020 = 126.0M), and known
// municipios must be near their 2020 figures. If the API order/IDs ever change
// again, this gate fails the build instead of silently corrupting per-capita math.
const total = Object.values(out).reduce((s, r) => s + (r.pob || 0), 0);
const checks = [
  ['19039', 'Monterrey', 1_100_000, 1_200_000],
  ['19041', 'Pesquería', 100_000, 250_000],
  ['09007', 'Iztapalapa', 1_700_000, 2_000_000],
];
const failures = [];
if (total < 120_000_000 || total > 135_000_000) failures.push(`national sum ${(total / 1e6).toFixed(1)}M outside [120M,135M]`);
for (const [cve, name, lo, hi] of checks) {
  const p = out[cve]?.pob || 0;
  if (p < lo || p > hi) failures.push(`${name} (${cve}) pob ${p.toLocaleString()} outside [${lo.toLocaleString()},${hi.toLocaleString()}]`);
}
if (failures.length) {
  console.error(`\n✗ SANITY GATE FAILED — registry NOT written:\n  - ${failures.join('\n  - ')}\n`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ meta: { source: 'INEGI (catálogo + Censo 2020)', count: list.length, missingPob: missing, nationalPob: total }, m: out }));
console.log(`\n✓ wrote data/meta/municipios.json — ${list.length} municipios, national pob ${(total / 1e6).toFixed(1)}M, ${missing} without population\n`);
