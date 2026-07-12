// fetch-hs4.js — the HS4 product detail behind the export treemap's drill-down (Fable: one level, HS2 -> HS4).
// Pulls Mexico's HS4 export lines from UN COMTRADE (preview, keyless), names them from the H6 reference,
// groups them under their parent HS2 chapter, and ties every share to the ALREADY-RECONCILED HS2 totals in
// exports-by-product.json. COMTRADE preview caps at 500 rows, so a chapter's children may not sum to its
// parent; the residual is written as an explicit "Other in <chapter>" line, never silently dropped.
// Writes data/trade/exports-hs4.json (small, lazy-loaded on the first treemap click). Run occasionally.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data', 'trade');
const YEAR = 2024;
const AG4 = `https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=484&period=${YEAR}&partnerCode=0&flowCode=X&cmdCode=AG4&motCode=0`;
const H6 = 'https://comtradeapi.un.org/files/v1/app/reference/H6.json';

// short display names for the lines big enough to earn a label; the rest derive from the H6 text
const OVERRIDE = {
  '8703': 'Cars', '8704': 'Trucks & goods vehicles', '8708': 'Auto parts', '8701': 'Tractors',
  '8471': 'Computers', '8517': 'Phones & telecom gear', '8528': 'Monitors & projectors', '8544': 'Wire & cable',
  '8536': 'Electrical switching', '8542': 'Semiconductors', '8541': 'Semiconductors', '8407': 'Engines',
  '8408': 'Diesel engines', '8409': 'Engine parts', '8414': 'Pumps & compressors', '8415': 'Air conditioners',
  '8418': 'Refrigerators', '8481': 'Valves & taps', '8443': 'Printing machinery', '9018': 'Medical instruments',
  '9401': 'Seats', '9403': 'Furniture', '2709': 'Crude oil', '2710': 'Refined fuels', '7108': 'Gold',
  '2203': 'Beer', '2207': 'Ethyl alcohol', '0803': 'Bananas', '0804': 'Avocados & tropical fruit',
  '0702': 'Tomatoes', '3004': 'Medicines', '9999': 'Unclassified', '7202': 'Ferroalloys', '2601': 'Iron ore',
  '7403': 'Copper', '7601': 'Aluminium', '3901': 'Plastics (ethylene)', '4011': 'Tyres',
  '8501': 'Electric motors', '8504': 'Transformers', '8507': 'Batteries', '8512': 'Vehicle lighting',
  '8516': 'Electric heaters', '8518': 'Speakers & mics', '8525': 'Cameras & transmitters', '8529': 'Broadcast parts',
  '8537': 'Control panels', '8473': 'Computer parts', '8479': 'Special machines', '8477': 'Plastics machinery',
  '8422': 'Packing machinery', '9013': 'Optical devices', '9031': 'Measuring instruments', '9032': 'Auto regulators',
  '8302': 'Mountings & fittings', '8483': 'Gears & transmissions', '8413': 'Liquid pumps', '8421': 'Filters & centrifuges',
};
function shortName(code, h6) {
  if (OVERRIDE[code]) return OVERRIDE[code];
  let s = String(h6 || '').replace(/^\d+\s*-\s*/, '').split(';')[0].trim();
  if (s.length > 34) s = s.split(',')[0].trim();
  return s || ('HS ' + code);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, tries = 4) {
  for (let t = 0; t < tries; t++) {
    const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && t < tries - 1) { await sleep(1500 * (t + 1)); continue; } // COMTRADE preview rate-limits; back off
    throw new Error('HTTP ' + r.status);
  }
}

(async () => {
  let parents;
  try { parents = JSON.parse(fs.readFileSync(path.join(OUT, 'exports-by-product.json'), 'utf8')); }
  catch (e) { console.error('hs4: need exports-by-product.json first; abort'); process.exit(0); }
  const hs2val = {}; for (const p of parents.items) hs2val[String(p.code).padStart(2, '0')] = p.value;
  const grandTotal = parents.total;

  let rows, names = {};
  try {
    const j = await getJson(AG4);
    rows = (j.data || []).filter((r) => Number(r.motCode) === 0 && r.primaryValue > 0);
  } catch (e) { console.error('hs4: COMTRADE AG4 fetch failed (keeping last-good):', e.message); process.exit(0); }
  if (rows.length < 100) { console.error('hs4: only', rows.length, 'rows; abort'); process.exit(0); }
  // The preview returns only the global top-500 HS4 lines, which DROPS big products that rank below the
  // cut — auto parts (8708, ~$41bn, Mexico's #3 export) is missing, and would otherwise disappear into an
  // "Other in chapter" block. An explicit code list is NOT subject to that truncation, so re-request every
  // curated code we didn't already get and merge, guaranteeing no named product ever hides inside "Other".
  const have = new Set(rows.map((r) => String(r.cmdCode).padStart(4, '0')));
  const want = Object.keys(OVERRIDE).filter((c) => !have.has(c));
  for (let i = 0; i < want.length; i += 20) {
    const batch = want.slice(i, i + 20);
    try {
      const j = await getJson(AG4.replace('cmdCode=AG4', 'cmdCode=' + batch.join(',')));
      for (const r of (j.data || [])) {
        const c = String(r.cmdCode).padStart(4, '0');
        if (Number(r.motCode) === 0 && r.primaryValue > 0 && !have.has(c)) { rows.push(r); have.add(c); }
      }
    } catch (e) { console.error('hs4: supplemental fetch failed (batch', i + '):', e.message); }
  }
  try { const h = await getJson(H6); for (const x of (h.results || h.data || h)) names[String(x.id)] = x.text; }
  catch (e) { console.error('hs4: H6 names unavailable, deriving from codes only'); }

  const byChapter = {};
  for (const r of rows) {
    const code = String(r.cmdCode).padStart(4, '0'); const chap = code.slice(0, 2);
    (byChapter[chap] = byChapter[chap] || []).push({ code, name: shortName(code, names[code]), full: (names[code] || '').replace(/^\d+\s*-\s*/, ''), value: r.primaryValue });
  }
  const out = {};
  for (const chap of Object.keys(byChapter)) {
    const parentVal = hs2val[chap]; if (!parentVal) continue;
    const kids = byChapter[chap].sort((a, b) => b.value - a.value);
    const sum = kids.reduce((s, k) => s + k.value, 0);
    const children = kids.map((k) => ({ code: k.code, name: k.name, full: k.full, value: k.value,
      shareTotal: +((k.value / grandTotal) * 100).toFixed(2), shareParent: +((k.value / parentVal) * 100).toFixed(1) }));
    const resid = parentVal - sum;
    if (resid > parentVal * 0.005) children.push({ code: chap + 'xx', name: 'Other in chapter', full: 'Smaller lines not itemized by COMTRADE preview', value: resid,
      shareTotal: +((resid / grandTotal) * 100).toFixed(2), shareParent: +((resid / parentVal) * 100).toFixed(1) });
    out[chap] = children;
  }
  const payload = { asOf: new Date().toISOString(), year: YEAR, source: 'UN COMTRADE (HS 4-digit), names from the H6 reference',
    reconciliation: 'shares tied to the HS2 totals reconciled to Banxico CE125; COMTRADE preview caps at 500 lines, residual per chapter shown as "Other in chapter"',
    total: grandTotal, byChapter: out };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'exports-hs4.json'), JSON.stringify(payload));
  console.log('hs4:', Object.keys(out).length, 'chapters ·', rows.length, 'HS4 lines · e.g. 87 ->', (out['87'] || []).slice(0, 3).map((k) => k.name + ' ' + k.shareParent + '%').join(', '));
})().catch((e) => { console.error('hs4 error (non-fatal):', e.message); process.exit(0); });
