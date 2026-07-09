// SESNSP incidencia delictiva — crime by municipio, monthly. The rarest kind of
// Atlas layer (alive + granular), and CVEGEO-NATIVE (Cve. Municipio is the INEGI
// 5-digit code) so NO crosswalk. Big file (~360MB) on repodatos behind the same
// intermittent WAF as IMSS, so we stream via curl and gate it to a monthly
// cadence. Aggregates TOTAL delitos per municipio for the latest year present
// (a per-capita rate is computed later once CONAPO population lands).

import { curlHead, curlLines } from '../lib/stream.js';

const HOST = 'https://repodatos.atdt.gob.mx/api_update/sesnsp/incidencia_delictiva';
const MONTHS_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTH_COLS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// try recent <monthabbr><yy> files newest-first (mirror currently ends ~2025)
async function resolveLatest(nowIso) {
  const d = new Date(nowIso);
  for (let back = 0; back <= 18; back++) {
    const t = new Date(d.getFullYear(), d.getMonth() - back, 1);
    const name = `IDM_NM_${MONTHS_ABBR[t.getMonth()]}${String(t.getFullYear()).slice(2)}.csv`;
    const { status } = await curlHead(`${HOST}/${name}`);
    if (status === 200 || status === 206) return { url: `${HOST}/${name}`, file: name };
  }
  throw new Error('SESNSP: no recent monthly file resolved (mirror may have moved to SharePoint)');
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

async function fetchRaw(ctx) {
  if (process.env.ENABLE_SESNSP !== '1') throw new Error('SESNSP disabled this cycle (set ENABLE_SESNSP=1)');
  const { url } = await resolveLatest(ctx.now);
  let header = null, iMun = -1, iAnio = -1, monthIdx = [];
  const perYear = new Map(); // año -> Map(cvegeo -> total delitos)

  await curlLines(url, (l) => {
    if (!l) return;
    const c = l.split(',');
    if (!header) {
      header = c.map(norm);
      iMun = header.findIndex((h) => h.includes('cve') && h.includes('municipio'));
      iAnio = header.findIndex((h) => h === 'ano' || h === 'anio');
      if (iAnio < 0) iAnio = 0; // año is the first column
      monthIdx = MONTH_COLS.map((m) => header.indexOf(m)).filter((i) => i >= 0);
      if (iMun < 0 || !monthIdx.length) throw new Error(`SESNSP: columns not found in ${header.join(',')}`);
      return;
    }
    const anio = String(c[iAnio] || '').trim();
    const munRaw = String(c[iMun] || '').trim();
    if (!/^\d{4,5}$/.test(munRaw)) return;
    const cvegeo = munRaw.padStart(5, '0');
    // SESNSP uses XX998/XX999 as "otros municipios / no especificado" buckets —
    // real state-level residuals, but not INEGI municipios. Drop with intent.
    if (/99[89]$/.test(cvegeo)) return;
    let sum = 0;
    for (const mi of monthIdx) { const v = Number(c[mi]); if (Number.isFinite(v)) sum += v; }
    if (!perYear.has(anio)) perYear.set(anio, new Map());
    const ym = perYear.get(anio);
    ym.set(cvegeo, (ym.get(cvegeo) || 0) + sum);
  }, { encoding: 'latin1' });

  const years = [...perYear.keys()].filter((y) => /^\d{4}$/.test(y)).sort();
  const maxYear = years[years.length - 1];
  if (!maxYear) throw new Error('SESNSP: no year rows parsed');
  return { vintage: maxYear, values: perYear.get(maxYear) };
}

function normalize(raw) {
  const values = {};
  for (const [cvegeo, v] of raw.values) values[cvegeo] = v;
  return { vintage: raw.vintage, values, notes: `total delitos del fuero común por municipio, año ${raw.vintage} (suma de todos los tipos; año en curso = acumulado)` };
}

export const connectors = [
  {
    manifest: {
      id: 'sesnsp-delitos',
      title: 'Incidencia delictiva (total)',
      metric: 'crime_total',
      canonicalSource: true,
      source: 'SESNSP (Secretariado Ejecutivo del SNSP)',
      sourceUrl: 'https://www.gob.mx/sesnsp/acciones-y-programas/datos-abiertos-de-incidencia-delictiva',
      license: 'CC BY 4.0',
      cadence: 'monthly',
      units: 'delitos (conteo anual)',
      track: 'map',
      kind: 'layer',
      granularity: 'municipio',
      canonicalKey: 'cvegeo',
      gatedBy: 'ENABLE_SESNSP',
      thresholds: { minCovered: 1500, maxRowDrop: 0.3 },
    },
    fetchRaw,
    normalize,
  },
];
