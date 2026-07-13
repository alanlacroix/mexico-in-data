// build-trade.js — US–Mexico goods trade, monthly, from the U.S. Census Bureau
// International Trade API (the US side's official record of the relationship).
// The HS dataset has no country-total row, so we sum HS2 chapters per month to
// get the monthly total, and use the trailing 12 months to rank what the US
// actually buys from and sells to Mexico. Free key (CENSUS_API_KEY). No LLM,
// nothing invented. Writes data/trade-us.json.
//
//   CENSUS_API_KEY=... node build-trade.js   (or set it in pipeline/.env)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJson } from './lib/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data', 'trade-us.json');

// Load pipeline/.env for local runs (CI passes the secret as a real env var).
(function loadEnv() {
  if (process.env.CENSUS_API_KEY) return;
  const f = path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const KEY = process.env.CENSUS_API_KEY;
const MX = '2010';        // Census country code for Mexico
const SINCE = '2019-01';  // ~7 years of monthly history

const url = (flow, valvar, commvar) =>
  `https://api.census.gov/data/timeseries/intltrade/${flow}/hs` +
  `?get=${valvar},${commvar}&CTY_CODE=${MX}&COMM_LVL=HS2&time=from+${SINCE}&key=${KEY}`;

// HS2 chapter names for the chapters that carry US–Mexico trade. Anything not
// listed falls back to "HS NN" — a code is never dropped, never guessed a name.
const HS2 = {
  '27': 'Mineral fuels & oil', '84': 'Machinery & computers', '85': 'Electrical & electronics',
  '87': 'Vehicles & parts', '90': 'Optical & medical', '39': 'Plastics', '94': 'Furniture & bedding',
  '08': 'Fruit & nuts', '07': 'Vegetables', '22': 'Beverages & spirits', '71': 'Gems & precious metals',
  '72': 'Iron & steel', '73': 'Iron & steel articles', '76': 'Aluminum', '40': 'Rubber', '48': 'Paper',
  '29': 'Organic chemicals', '30': 'Pharmaceuticals', '38': 'Chemical products', '02': 'Meat', '20': 'Prepared food',
  '21': 'Edible preparations', '62': 'Apparel (woven)', '61': 'Apparel (knit)', '94_': '', '15': 'Fats & oils',
  '17': 'Sugar', '19': 'Baked goods', '33': 'Cosmetics', '64': 'Footwear', '70': 'Glass', '83': 'Base-metal articles',
  '95': 'Toys & sports', '96': 'Misc. manufactures', '98': 'Special classification', '99': 'Low-value shipments',
};
const nameOf = (hs) => HS2[hs] || `HS ${hs}`;

async function fetchFlow(flow, valvar, commvar) {
  const u = url(flow, valvar, commvar);
  let raw;
  try { raw = await getJson(u, { retries: 1, timeoutMs: 30_000 }); }
  catch (e) {
    const { execFileSync } = await import('node:child_process');
    try {
      raw = JSON.parse(execFileSync('curl', ['-s', '--compressed', '--max-time', '45', u], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }));
    } catch {
      // Never let child_process include the credential-bearing URL in an error.
      throw new Error(`${flow}: Census API unavailable after retries`);
    }
  }
  if (!Array.isArray(raw) || raw.length < 2) throw new Error(`${flow}: unexpected response`);
  const hdr = raw[0], vi = hdr.indexOf(valvar), ci = hdr.indexOf(commvar), ti = hdr.indexOf('time');
  const byMonth = {}, byChap = {};                 // month -> total$, chapter -> trailing-12mo $
  const months = new Set();
  for (const r of raw.slice(1)) {
    const v = Number(r[vi]); if (!Number.isFinite(v)) continue;
    const t = r[ti], hs = r[ci];
    byMonth[t] = (byMonth[t] || 0) + v;
    months.add(t);
  }
  const sortedMonths = [...months].sort();
  const last12 = new Set(sortedMonths.slice(-12));
  for (const r of raw.slice(1)) {
    const v = Number(r[vi]); if (!Number.isFinite(v)) continue;
    if (!last12.has(r[ti])) continue;
    const hs = r[ci]; byChap[hs] = (byChap[hs] || 0) + v;
  }
  const series = sortedMonths.map((m) => ({ month: m, value: +(byMonth[m] / 1e9).toFixed(2) }));
  const top = Object.entries(byChap)
    .filter(([hs]) => !['98', '99'].includes(hs))   // drop non-substantive special chapters from the "what" list
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([hs, v]) => ({ hs, name: nameOf(hs), value_bn: +(v / 1e9).toFixed(1) }));
  return { series, top };
}

async function main() {
  if (!KEY) throw new Error('CENSUS_API_KEY not set (pipeline/.env or CI secret)');
  const [imp, exp] = await Promise.all([
    fetchFlow('imports', 'GEN_VAL_MO', 'I_COMMODITY'),   // US imports from Mexico
    fetchFlow('exports', 'ALL_VAL_MO', 'E_COMMODITY'),   // US exports to Mexico
  ]);
  const im = imp.series, ex = exp.series;
  const last = im[im.length - 1].month;
  const exLast = ex.find((p) => p.month === last) || ex[ex.length - 1];
  const iv = im[im.length - 1].value, ev = exLast.value;

  const out = {
    meta: {
      source: 'U.S. Census Bureau, International Trade',
      sourceUrl: 'https://www.census.gov/foreign-trade/',
      note: 'US–Mexico goods trade, the US side of the ledger. Monthly totals are the sum of HS2 chapters; the "what" lists rank the trailing 12 months. Imports are general customs value; exports are total exports value.',
      unit: 'US$ billions',
      cadence: 'monthly',
      window: `since ${SINCE}`,
      fetchedAt: new Date().toISOString(),
      latestMonth: last,
    },
    latest: {
      month: last,
      imports_bn: iv,                       // US buys from Mexico
      exports_bn: ev,                       // US sells to Mexico
      twoway_bn: +(iv + ev).toFixed(1),
      balance_bn: +(ev - iv).toFixed(1),    // US goods balance with Mexico (negative = US deficit)
    },
    series: { imports: im, exports: ex },
    topImports: imp.top,                    // what the US buys from Mexico
    topExports: exp.top,                    // what the US sells to Mexico
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`trade-us -> data/trade-us.json  (${im.length} months, latest ${last})`);
  console.log(`  latest ${last}: US buys $${iv}bn, sells $${ev}bn, two-way $${out.latest.twoway_bn}bn, US balance $${out.latest.balance_bn}bn`);
  console.log('  top US imports from Mexico (12mo):');
  for (const t of imp.top) console.log(`    · ${t.name}  $${t.value_bn}bn`);
}

main().catch((e) => { console.error('trade build failed:', e.message); process.exit(1); });
