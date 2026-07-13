// fetch-trade.js — Trade-section data (COMTRADE product/partner + World Bank regional).
//
// Why a separate script (not a connector): these are CATEGORICAL / multi-country datasets, not the
// date-value time series the connector contract models. Both APIs are keyless (UN COMTRADE preview +
// World Bank Indicators), so we fetch SERVER-SIDE and do the thing the trust bar demands: RECONCILE
// every foreign-sourced total to the Mexican-official figure (Banxico CE125 annual sum) and FAIL
// CLOSED — if an API is down, the shape is wrong, or the reconciliation drifts past Fable's 2%
// tripwire, we keep the last-good file and never publish an unvalidated number.
//
// Writes: data/trade/exports-by-product.json, exports-by-partner.json, regional.json
// Run in CI right after run.js. No token required.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data', 'trade');
const SERIES = path.join(__dirname, '..', 'data', 'series');
const RECONCILE_TOL = 0.02; // Fable's tripwire: foreign totals must land within 2% of the official number

// Standard WCO HS2 chapter names (we control the labels — no dependency on the API's cmdDesc, which the
// preview endpoint leaves blank). Short, readable, display-safe.
const HS2 = {
  '01':'Live animals','02':'Meat','03':'Fish & seafood','04':'Dairy & eggs','05':'Animal products',
  '06':'Live plants & flowers','07':'Vegetables','08':'Fruit & nuts','09':'Coffee, tea & spices','10':'Cereals',
  '11':'Milling products','12':'Oil seeds','13':'Gums & resins','14':'Vegetable plaiting','15':'Fats & oils',
  '16':'Prepared meat & fish','17':'Sugars','18':'Cocoa','19':'Cereal preparations','20':'Preserved food',
  '21':'Food preparations','22':'Beverages & spirits','23':'Animal feed','24':'Tobacco','25':'Salt, stone & cement',
  '26':'Ores & ash','27':'Mineral fuels & oil','28':'Inorganic chemicals','29':'Organic chemicals','30':'Pharmaceuticals',
  '31':'Fertilizers','32':'Dyes & pigments','33':'Cosmetics & perfume','34':'Soaps & waxes','35':'Glues & enzymes',
  '36':'Explosives','37':'Photographic goods','38':'Chemical products','39':'Plastics','40':'Rubber',
  '41':'Raw hides & leather','42':'Leather goods','43':'Furs','44':'Wood','45':'Cork',
  '46':'Straw articles','47':'Wood pulp','48':'Paper','49':'Printed books','50':'Silk',
  '51':'Wool','52':'Cotton','53':'Vegetable fibres','54':'Man-made filaments','55':'Man-made fibres',
  '56':'Nonwovens','57':'Carpets','58':'Special fabrics','59':'Coated textiles','60':'Knitted fabrics',
  '61':'Apparel (knitted)','62':'Apparel (woven)','63':'Textile articles','64':'Footwear','65':'Headgear',
  '66':'Umbrellas','67':'Feathers','68':'Stone articles','69':'Ceramics','70':'Glass',
  '71':'Precious metals & gems','72':'Iron & steel','73':'Iron & steel articles','74':'Copper','75':'Nickel',
  '76':'Aluminium','78':'Lead','79':'Zinc','80':'Tin','81':'Other base metals',
  '82':'Tools & cutlery','83':'Metal articles','84':'Machinery & computers','85':'Electronics & electrical','86':'Railway',
  '87':'Vehicles & parts','88':'Aircraft','89':'Ships','90':'Optical, medical & precision','91':'Clocks & watches',
  '92':'Musical instruments','93':'Arms','94':'Furniture & bedding','95':'Toys & games','96':'Misc manufactures',
  '97':'Art & antiques','99':'Unclassified',
};

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 30000);
      const r = await fetch(url, { signal: ctl.signal, headers: { 'accept': 'application/json' } });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
  }
}

// Sum a Banxico CE125 series (thousand US$) for a calendar year → US dollars. The reconciliation control.
function officialAnnual(seriesId, year) {
  const f = path.join(SERIES, `${seriesId}.json`);
  if (!fs.existsSync(f)) return null;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const rows = (d.data || []).filter((p) => String(p.date).slice(0, 4) === String(year));
  if (rows.length < 12) return null; // only reconcile against a COMPLETE year
  return rows.reduce((s, p) => s + p.value, 0) * 1000; // thousand US$ -> US$
}

// Fail-closed writer: only overwrite when the payload passed its checks; else keep last-good.
function safeWrite(name, payload, ok, reason) {
  const f = path.join(OUT, name);
  if (ok) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(payload, null, 2));
    console.log(`  ✓ ${name} — ${payload.reconciliation ? 'Δ ' + payload.reconciliation.deltaPct + '% (' + (payload.reconciliation.pass ? 'PASS' : 'FAIL') + ')' : 'written'}`);
    return true;
  }
  console.log(`  ✗ ${name} — NOT written (${reason}); keeping last-good${fs.existsSync(f) ? '' : ' (none exists yet)'}`);
  return false;
}

const COMTRADE = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';

// The annual composition must advance without someone remembering to edit a constant. Use the latest
// complete calendar year present in BOTH Banxico export and import ledgers (and never the current,
// incomplete year). COMTRADE is then accepted only if it reconciles to that same official-year control.
function completeYears(seriesId) {
  const f = path.join(SERIES, `${seriesId}.json`);
  if (!fs.existsSync(f)) return [];
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const months = new Map();
  for (const p of d.data || []) {
    const y = Number(String(p.date).slice(0, 4));
    const m = String(p.date).slice(0, 7);
    if (!Number.isInteger(y) || y >= new Date().getUTCFullYear()) continue;
    if (!months.has(y)) months.set(y, new Set());
    months.get(y).add(m);
  }
  return [...months].filter(([, ms]) => ms.size === 12).map(([y]) => y).sort((a, b) => b - a);
}
function latestCommonCompleteYear(ids) {
  const lists = ids.map(completeYears);
  return lists[0]?.find((y) => lists.every((ys) => ys.includes(y))) || null;
}

const YEAR = latestCommonCompleteYear(['banxico-exports-total', 'banxico-imports-total']) || (new Date().getUTCFullYear() - 1);
const nowIso = new Date().toISOString();

// ---- 1. Exports by product (HS2 treemap) ----
async function exportsByProduct() {
  let rows;
  try {
    const j = await getJson(`${COMTRADE}?reporterCode=484&period=${YEAR}&partnerCode=0&flowCode=X&cmdCode=AG2&motCode=0`);
    rows = (j.data || []).filter((r) => Number(r.motCode) === 0);
  } catch (e) { return safeWrite('exports-by-product.json', null, false, 'COMTRADE fetch failed: ' + e.message); }
  if (rows.length < 50) return safeWrite('exports-by-product.json', null, false, `only ${rows.length} chapters`);

  const byCmd = {};
  for (const r of rows) { const c = String(r.cmdCode).padStart(2, '0'); byCmd[c] = (byCmd[c] || 0) + (r.primaryValue || 0); }
  const total = Object.values(byCmd).reduce((s, v) => s + v, 0);
  const official = officialAnnual('banxico-exports-total', YEAR);
  const deltaPct = official ? +(((total - official) / official) * 100).toFixed(1) : null;
  const pass = official != null && Math.abs(deltaPct) <= RECONCILE_TOL * 100;

  const items = Object.entries(byCmd)
    .map(([code, value]) => ({ code, name: HS2[code] || `HS ${code}`, value, share: +((value / total) * 100).toFixed(2) }))
    .sort((a, b) => b.value - a.value);

  const payload = {
    schemaVersion: 1, asOf: nowIso, fetchedAt: nowIso, referenceYear: YEAR, year: YEAR,
    flow: 'exports', unit: 'current US$', dataKind: 'annual goods export composition',
    source: 'UN COMTRADE', sourceNote: 'HS 2-digit chapters, all modes of transport (motCode 0)',
    total,
    reconciliation: { against: 'Banxico CE125 exports (SE36593) ' + YEAR + ' sum', official, deltaPct, pass, tolerancePct: RECONCILE_TOL * 100 },
    items,
  };
  return safeWrite('exports-by-product.json', payload, pass, official == null ? 'no official control for ' + YEAR : `Δ ${deltaPct}% > 2%`);
}

// COMTRADE's preview leaves partnerDesc null, so we map the numeric M49 code via COMTRADE's own
// authoritative reference table (fail closed if it's unavailable — never guess a country name).
async function loadPartnerNames() {
  try {
    const j = await getJson('https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json');
    const rows = j.results || j.data || j;
    const map = {};
    for (const r of rows || []) map[String(r.id ?? r.PartnerCode)] = r.text || r.PartnerDesc;
    return Object.keys(map).length > 50 ? map : null;
  } catch { return null; }
}

// ---- 2. Trade by partner (exports + imports, top partners) ----
async function partnerFlow(flowCode, controlSeries, name, names) {
  let rows;
  try {
    const j = await getJson(`${COMTRADE}?reporterCode=484&period=${YEAR}&flowCode=${flowCode}&cmdCode=TOTAL&motCode=0`);
    rows = (j.data || []).filter((r) => Number(r.motCode) === 0 && Number(r.partner2Code) === 0 && Number(r.partnerCode) !== 0);
  } catch (e) { return { ok: false, reason: 'fetch failed: ' + e.message, name }; }
  if (rows.length < 20) return { ok: false, reason: `only ${rows.length} partners`, name };

  const items = rows
    .map((r) => ({ code: r.partnerCode, name: names[String(r.partnerCode)] || null, value: r.primaryValue || 0 }))
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = items.reduce((s, p) => s + p.value, 0);
  items.forEach((p) => { p.share = +((p.value / total) * 100).toFixed(2); });

  const official = officialAnnual(controlSeries, YEAR);
  const deltaPct = official ? +(((total - official) / official) * 100).toFixed(1) : null;
  const pass = official != null && Math.abs(deltaPct) <= RECONCILE_TOL * 100;
  return { ok: pass, reason: official == null ? 'no control' : `Δ ${deltaPct}%`, name, total, official, deltaPct, pass, items };
}

async function tradeByPartner() {
  const names = await loadPartnerNames();
  if (!names) return safeWrite('exports-by-partner.json', null, false, 'partner reference table unavailable — refusing to publish unlabeled partners');
  const x = await partnerFlow('X', 'banxico-exports-total', 'exports', names);
  const m = await partnerFlow('M', 'banxico-imports-total', 'imports', names);
  const both = x.ok && m.ok;
  const payload = {
    schemaVersion: 1, asOf: nowIso, fetchedAt: nowIso, referenceYear: YEAR, year: YEAR,
    unit: 'current US$', dataKind: 'annual bilateral goods trade',
    source: 'UN COMTRADE', sourceNote: 'Bilateral totals, all modes (motCode 0)',
    exports: x.ok ? { total: x.total, reconciliation: { official: x.official, deltaPct: x.deltaPct, pass: x.pass, tolerancePct: RECONCILE_TOL * 100 }, items: x.items.slice(0, 15) } : null,
    imports: m.ok ? { total: m.total, reconciliation: { official: m.official, deltaPct: m.deltaPct, pass: m.pass, tolerancePct: RECONCILE_TOL * 100 }, items: m.items.slice(0, 15) } : null,
  };
  return safeWrite('exports-by-partner.json', payload, both, `exports:${x.reason} imports:${m.reason}`);
}

// ---- 3. Regional comparison (World Bank, one methodology across peers) ----
async function regional() {
  const COUNTRIES = 'MEX;BRA;COL;CHL;USA';
  const IND = [
    { key: 'exportsPctGdp', code: 'NE.EXP.GNFS.ZS', label: 'Exports, % of GDP', unit: '%' },
    { key: 'highTechPct',   code: 'TX.VAL.TECH.MF.ZS', label: 'High-tech, % of manufactured exports', unit: '%' },
  ];
  const out = { schemaVersion: 1, asOf: nowIso, fetchedAt: nowIso, throughYear: YEAR, source: 'World Bank (World Development Indicators)', countries: COUNTRIES.split(';'), metrics: {} };
  try {
    for (const ind of IND) {
      // full history (1995→) so the section can chart the post-NAFTA divergence, plus the latest value per country.
      const j = await getJson(`https://api.worldbank.org/v2/country/${COUNTRIES}/indicator/${ind.code}?format=json&per_page=2000&date=1995:${YEAR}`);
      const rows = (j[1] || []).filter((r) => r && r.value != null);
      if (!rows.length) throw new Error('no data for ' + ind.code);
      const byC = {};
      for (const r of rows) {
        const c = r.countryiso3code;
        (byC[c] = byC[c] || { iso: c, country: r.country?.value, pts: [] }).pts.push({ date: r.date + '-01-01', value: +Number(r.value).toFixed(2) });
      }
      const series = Object.values(byC).map((s) => ({ ...s, pts: s.pts.sort((a, b) => a.date.localeCompare(b.date)) }));
      const latest = {};
      for (const s of series) { const last = s.pts[s.pts.length - 1]; latest[s.iso] = { iso: s.iso, country: s.country, year: last.date.slice(0, 4), value: last.value }; }
      out.metrics[ind.key] = { label: ind.label, unit: ind.unit, indicator: ind.code, series, values: Object.values(latest).sort((a, b) => b.value - a.value) };
    }
  } catch (e) { return safeWrite('regional.json', null, false, 'World Bank fetch failed: ' + e.message); }
  const ok = Object.keys(out.metrics).length === IND.length;
  return safeWrite('regional.json', out, ok, 'incomplete metrics');
}

(async () => {
  console.log('\n▶ Trade data (COMTRADE + World Bank) — reconcile-or-drop\n');
  await exportsByProduct();
  await tradeByPartner();
  await regional();
  console.log('\n  trade data -> data/trade/*.json\n');
})();
