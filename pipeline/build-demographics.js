// build-demographics.js — the CONAPO demographic base for the Society page (Fable-verified source).
//
// Downloads CONAPO's official population projection (1950–2070, base 2023) and aggregates it to the
// national trajectory, median age, and dependency ratio. These are a PROJECTION (computed in 2023),
// so the site labels them exactly that — never "live". The census count (126.0M, 2020) is kept as a
// separate anchor and NEVER mixed into the projection series (their base years differ by ~2M — Fable's
// trap #1). Writes data/demographics.json (small). Run occasionally; CONAPO re-bases every ~5–6 years.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data');
const URL = 'https://repodatos.atdt.gob.mx/CONAPO/proyecciones/00_Pob_Mitad_1950_2070.csv';

(async () => {
  let text;
  try { const r = await fetch(URL, { signal: AbortSignal.timeout(120000) }); if (!r.ok) throw new Error('HTTP ' + r.status); text = await r.text(); }
  catch (e) { console.error('demographics: CONAPO fetch failed (keeping last-good):', e.message); process.exit(0); }

  const lines = text.split('\n');
  const h = lines[0].split(',');
  const iYear = h.indexOf('ANIO'), iCve = h.indexOf('CVE_GEO'), iEdad = h.indexOf('EDAD'), iPob = h.indexOf('POBLACION');
  if (iYear < 0 || iPob < 0) { console.error('demographics: unexpected CONAPO columns; aborting (last-good kept).'); process.exit(0); }

  const popByYear = {}; const ageByYear = {};
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length <= iPob) continue;
    const cve = parseInt(c[iCve], 10);
    if (!(cve >= 1 && cve <= 32)) continue;            // 32 states only — skip any national aggregate row to avoid double-count
    const y = parseInt(c[iYear], 10), age = parseInt(c[iEdad], 10), pob = Number(c[iPob]);
    if (!Number.isFinite(y) || !Number.isFinite(pob)) continue;
    popByYear[y] = (popByYear[y] || 0) + pob;
    (ageByYear[y] = ageByYear[y] || {})[age] = ((ageByYear[y] || {})[age] || 0) + pob;
  }
  const years = Object.keys(popByYear).map(Number).sort((a, b) => a - b);
  if (!years.length) { console.error('demographics: no rows parsed; aborting.'); process.exit(0); }
  const cur = new Date().getUTCFullYear();
  const latestY = years.includes(cur) ? cur : years[years.length - 1];

  // median age + dependency from the single-year age distribution
  const ages = ageByYear[latestY], total = popByYear[latestY];
  let cum = 0, median = null;
  for (let a = 0; a <= 130; a++) { cum += ages[a] || 0; if (median == null && cum >= total / 2) { median = a; break; } }
  let young = 0, old = 0, work = 0;
  for (let a = 0; a <= 130; a++) { const v = ages[a] || 0; if (a < 15) young += v; else if (a >= 65) old += v; else work += v; }
  const dependency = work ? +(((young + old) / work) * 100).toFixed(1) : null;

  const out = {
    generatedAt: new Date().toISOString(),
    source: 'CONAPO — Proyecciones de la Población de México 2020–2070 (base 2023)',
    sourceUrl: 'https://www.gob.mx/conapo',
    tier: 'projection',
    latestYear: latestY,
    population: { latest: popByYear[latestY], series: years.filter((y) => y >= 1970).map((y) => ({ year: y, value: popByYear[y] })) },
    medianAge: median,
    dependencyRatio: dependency,
    censusAnchor: { population: 126014024, year: 2020, source: 'INEGI, Censo de Población y Vivienda 2020' },
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'demographics.json'), JSON.stringify(out, null, 2));
  console.log(`demographics: ${latestY} population ${popByYear[latestY].toLocaleString('en-US')} · median age ${median} · dependency ${dependency}`);
})().catch((e) => { console.error('demographics error (non-fatal):', e.message); process.exit(0); });
