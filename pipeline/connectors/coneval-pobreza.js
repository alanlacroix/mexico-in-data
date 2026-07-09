// CONEVAL municipal poverty 2020 — the opening "two economies" story layer for
// the hero map. CVEGEO-native (clave_entidad + clave_municipio), CC-BY/Libre Uso,
// direct CSV on coneval.org.mx (clean TLS). Static 2020 vintage -> the frontend
// MUST render "2020 snapshot"; it is the opening frame, not a live layer.

import { getText } from '../lib/http.js';
import { parseCsv, findCol } from '../lib/csv.js';

// Discovery-resistant: CONEVAL migrated into INEGI (Jul 2025), so pin the known
// direct file but tolerate a path change by failing closed (never guessing).
const URL =
  'https://www.coneval.org.mx/Informes/Pobreza/Datos_abiertos/pobreza_municipal_2010-2020/indicadores%20de%20pobreza%20municipal_2020.csv';

async function fetchRaw() {
  return getText(URL, { expect: 'csv', timeoutMs: 90_000 });
}

function normalize(text) {
  const { header, rows } = parseCsv(text);
  const iEnt = findCol(header, [/clave.?ent/, 'cve_ent', 'clave_entidad', 'entidad_federativa_clave']);
  const iMun = findCol(header, [/clave.?mun/, 'cve_mun', 'clave_municipio']);
  // "pobreza" as a percentage of population (prefer an explicit %/porcentaje col).
  const iVal = findCol(header, [/pobreza.*porcentaje/, /porcentaje.*pobreza/, 'pobreza', /^pobreza_?p?$/]);
  if (iEnt < 0 || iMun < 0 || iVal < 0)
    throw new Error(`CONEVAL: could not locate ent/mun/pobreza columns in [${header.slice(0, 12).join(', ')}...]`);

  const values = {};
  for (const cols of rows) {
    // clave_municipio already encodes ent(1-2)+mun(3); pad to the 5-digit CVEGEO.
    const munCode = String(cols[iMun] || '').trim();
    if (!/^\d{4,5}$/.test(munCode)) continue;
    const cvegeo = munCode.padStart(5, '0');
    const ent = String(cols[iEnt] || '').trim().padStart(2, '0');
    if (cvegeo.slice(0, 2) !== ent) continue; // consistency guard
    const v = Number(String(cols[iVal]).replace(/[%,]/g, '').trim());
    if (!Number.isFinite(v)) continue;
    values[cvegeo] = +v.toFixed(1);
  }
  if (Object.keys(values).length < 500)
    throw new Error(`CONEVAL: only ${Object.keys(values).length} municipios parsed — schema drift?`);
  return { vintage: '2020', values, notes: 'share of population in poverty (%), CONEVAL 2020' };
}

export const connectors = [
  {
    manifest: {
      id: 'coneval-pobreza',
      title: 'Pobreza municipal',
      metric: 'poverty_rate',
      canonicalSource: true,
      source: 'CONEVAL (via INEGI)',
      sourceUrl: URL,
      license: 'Términos de Libre Uso MX',
      cadence: '~5-yearly',
      units: '% of population',
      track: 'map',
      kind: 'layer',
      granularity: 'municipio',
      canonicalKey: 'cvegeo',
      thresholds: { minCovered: 2000, maxRowDrop: 0.2 },
    },
    fetchRaw,
    normalize,
  },
];
