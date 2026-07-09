// IMSS formal employment — the crown-jewel wedge: monthly, municipio-level jobs
// + wage bill. ~400MB/month behind an Imperva WAF that 403s node fetch, so we
// stream it through curl (lib/stream.js). Keyed on IMSS's INTERNAL alphanumeric
// municipio catalog (A01, Y45…) — mapped to CVEGEO through the frozen crosswalk
// (exact-or-fail). Codes we knowingly can't split (e.g. a CDMX aggregate) live
// in an explicit, reviewed EXCLUDE table and are skipped-with-reason, never
// silently dropped. Any OTHER unmapped code hard-fails the layer.
//
// Gated behind ENABLE_IMSS=1 (heavy, monthly). Streamed line-by-line so the
// 400MB never lands in memory or git — only the slim municipio JSON is emitted.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { curlHead, curlLines } from '../lib/stream.js';
import { toCvegeo } from '../lib/crosswalk.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = 'http://datos.imss.gob.mx/sites/default/files';

const lastDay = (y, m) => new Date(y, m, 0).getDate();
const fileFor = (y, m) => `asg-${y}-${String(m).padStart(2, '0')}-${String(lastDay(y, m)).padStart(2, '0')}.csv`;

function loadExcludes() {
  const f = path.join(__dirname, '..', 'crosswalks', 'overrides', 'imss.exclude.json');
  if (!fs.existsSync(f)) return {};
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; }
}

async function resolveLatest(nowIso) {
  const d = new Date(nowIso);
  for (let back = 1; back <= 4; back++) {
    const t = new Date(d.getFullYear(), d.getMonth() - back, 1);
    const name = fileFor(t.getFullYear(), t.getMonth() + 1);
    const url = `${HOST}/${name}`;
    const { status } = await curlHead(url);
    if (status === 200) return { url, vintage: name.slice(4, 11) }; // YYYY-MM
  }
  throw new Error('IMSS: no recent monthly file resolved (checked last 4 months)');
}

// Heavy work happens in fetchRaw (which the harness awaits); normalize stays sync.
async function fetchRaw(ctx) {
  if (process.env.ENABLE_IMSS !== '1') throw new Error('IMSS disabled this cycle (set ENABLE_IMSS=1)');
  const { url, vintage } = await resolveLatest(ctx.now);
  const excl = loadExcludes();

  let header = null, iEnt = -1, iMun = -1, iTa = -1, rows = 0, excluded = 0;
  const sums = new Map();
  const unmapped = new Map();

  await curlLines(url, (l) => {
    if (!l) return;
    const c = l.split('|');
    if (!header) {
      header = c.map((x) => x.trim().toLowerCase());
      iEnt = header.indexOf('cve_entidad');
      iMun = header.indexOf('cve_municipio');
      iTa = header.indexOf('ta'); // puestos de trabajo afiliados (total)
      if (iEnt < 0 || iMun < 0 || iTa < 0) throw new Error(`IMSS: expected cve_entidad|cve_municipio|ta, got ${header.join(',')}`);
      return;
    }
    rows++;
    const ent = String(c[iEnt] || '').trim().padStart(2, '0');
    const code = String(c[iMun] || '').trim();
    const ta = Number(c[iTa]);
    if (!code || !Number.isFinite(ta)) return;
    let cvegeo;
    try {
      cvegeo = toCvegeo('imss', code, { cve_ent: ent });
    } catch {
      const key = `${ent}:${code}`;
      if (excl[key]) { excluded += 1; return; } // reviewed exclusion (documented), not a silent drop
      unmapped.set(key, (unmapped.get(key) || 0) + 1);
      return;
    }
    sums.set(cvegeo, (sums.get(cvegeo) || 0) + ta);
  });

  return { vintage, sums, unmapped, excluded, rows };
}

function normalize(raw) {
  if (raw.unmapped.size) {
    const eg = [...raw.unmapped.keys()].slice(0, 12).join(', ');
    throw new Error(`IMSS: ${raw.unmapped.size} unmapped municipio codes — add to crosswalk override or exclude table (e.g. ${eg})`);
  }
  const values = {};
  for (const [cvegeo, v] of raw.sums) values[cvegeo] = v;
  const excludedNote = raw.excluded ? `; ${raw.excluded} rows in reviewed-excluded codes` : '';
  return { vintage: raw.vintage, values, notes: `puestos de trabajo afiliados (ta) summed to municipio; jobs at employer registration muni${excludedNote}` };
}

export const connectors = [
  {
    manifest: {
      id: 'imss-empleo',
      title: 'Empleo formal (puestos IMSS)',
      metric: 'formal_jobs',
      canonicalSource: true,
      source: 'IMSS (Datos Abiertos)',
      sourceUrl: 'http://datos.imss.gob.mx/group/asegurados',
      license: 'Términos de Libre Uso MX',
      cadence: 'monthly',
      units: 'puestos de trabajo afiliados',
      track: 'map',
      kind: 'layer',
      granularity: 'municipio',
      canonicalKey: 'cvegeo',
      gatedBy: 'ENABLE_IMSS',
      thresholds: { minCovered: 800, maxRowDrop: 0.3 },
    },
    fetchRaw,
    normalize,
  },
];
