// build-analysis.js — the deterministic FACTS PACK behind "The Read" (Fable's analysis architecture).
//
// Reads data/series/*.json (each carries full history) and computes, in code, every fact the analysis
// section is allowed to state: latest values, native-cadence moves, z-scores, streaks, records, trends,
// and the handful of cross-metric relationships Fable 2 blessed as real (real rate, rate spread, peso
// remittances). Writes data/analysis/facts.json. This is the trust boundary: The Read (and, later, the
// LLM layer) may only surface facts that appear here, and every fact carries the metric ids it came from.
// No LLM, no fabrication, no numbers that didn't come from an official series. Run after the connectors.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERIES = path.join(__dirname, '..', 'data', 'series');
const OUT_DIR = path.join(__dirname, '..', 'data', 'analysis');
const nowIso = new Date().toISOString();

const S = {};
if (fs.existsSync(SERIES)) {
  for (const f of fs.readdirSync(SERIES).filter((x) => x.endsWith('.json'))) {
    try { S[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(SERIES, f), 'utf8')); } catch { /* skip */ }
  }
}
const data = (id) => (S[id] && Array.isArray(S[id].data) ? S[id].data : null);
const meta = (id) => (S[id] ? S[id].meta || {} : {});
const round = (v, n = 2) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(n));

// stats for one series: latest, change on its own cadence, z vs trailing window, streak, record, trend
function stat(id) {
  const d = data(id);
  if (!d || d.length < 2) return null;
  const vals = d.map((p) => p.value);
  const last = d[d.length - 1], prev = d[d.length - 2];
  const change = last.value - prev.value;
  const changePct = prev.value !== 0 ? (change / Math.abs(prev.value)) * 100 : null;
  // z-score of the latest change vs the trailing 24 period-over-period changes
  const win = Math.min(24, d.length - 1);
  const diffs = [];
  for (let i = d.length - win; i < d.length; i++) diffs.push(d[i].value - d[i - 1].value);
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const sd = Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / diffs.length) || 1;
  const z = round((change - mean) / sd, 2);
  // streak: consecutive same-direction moves ending now
  let streak = 0; const dir = Math.sign(change);
  if (dir !== 0) { for (let i = d.length - 1; i > 0; i--) { if (Math.sign(d[i].value - d[i - 1].value) === dir) streak++; else break; } }
  // records over the full series
  const max = Math.max(...vals), min = Math.min(...vals);
  const isHigh = last.value === max, isLow = last.value === min;
  // trends: change vs ~3 and ~12 periods ago
  const at = (back) => (d.length > back ? d[d.length - 1 - back].value : null);
  const trend = (back) => { const b = at(back); return b != null && b !== 0 ? round(((last.value - b) / Math.abs(b)) * 100, 1) : null; };
  return {
    id, source: meta(id).source, sid: (String(meta(id).sourceUrl || '').match(/series\/([A-Za-z]{2,4}\d+)/) || [])[1] || null,
    cadence: String(meta(id).cadence || ''), units: meta(id).units || '', vintage: meta(id).vintage,
    date: last.date, value: round(last.value, 4), prev: round(prev.value, 4),
    change: round(change, 4), changePct: round(changePct, 2), dir, z, streak,
    isRecordHigh: isHigh, isRecordLow: isLow, trend3: trend(3), trend12: trend(12),
  };
}

// ---- per-series stats for everything ----
const metrics = {};
for (const id of Object.keys(S)) { const s = stat(id); if (s) metrics[id] = s; }

// ---- "What Moved": triage. Score by |z|, flag the event kinds, keep the meaningful ones. ----
// growth series where "record high" is vanity (every month is a record) — flag rate anomalies, not records.
const GROWTH = /spei|codi|ecommerce|circulante|tarjetas|consumo|exports|imports|remes|salario|gasolina|diesel/;
const WATCH = ['banxico-usdmxn-fix','banxico-tasa-objetivo','banxico-inflacion','banxico-inflacion-subyacente',
  'banxico-reservas','banxico-remesas','banxico-exports-total','banxico-imports-total','banxico-trade-balance',
  'banxico-igae','banxico-salario-minimo','banxico-circulante','banxico-spei-operaciones','fred-fedfunds','cre-gasolina-regular'];

const LABEL = {
  'banxico-usdmxn-fix':'Peso (MXN/USD)','banxico-tasa-objetivo':'Banxico policy rate','banxico-inflacion':'Headline inflation',
  'banxico-inflacion-subyacente':'Core inflation','banxico-reservas':'International reserves','banxico-remesas':'Remittances',
  'banxico-exports-total':'Exports','banxico-imports-total':'Imports','banxico-trade-balance':'Trade balance',
  'banxico-igae':'Economic activity (IGAE)','banxico-salario-minimo':'Minimum wage','banxico-circulante':'Currency in circulation',
  'banxico-spei-operaciones':'SPEI transfers','fred-fedfunds':'US fed funds rate','cre-gasolina-regular':'Gasoline (regular)',
};

const moved = [];
for (const id of WATCH) {
  const m = metrics[id]; if (!m) continue;
  const flags = [];
  // threshold crossings
  if (id === 'banxico-inflacion' || id === 'banxico-inflacion-subyacente') {
    const inBand = m.value > 2 && m.value < 4, prevIn = m.prev > 2 && m.prev < 4;
    if (inBand && !prevIn) flags.push('entered the 2–4% target band');
    if (!inBand && prevIn) flags.push('left the 2–4% target band');
  }
  if (id === 'banxico-usdmxn-fix') { const d = data(id).slice(-252).map((p) => p.value); if (m.value === Math.max(...d)) flags.push('52-week weak extreme'); if (m.value === Math.min(...d)) flags.push('52-week strong extreme'); }
  // streaks (>=3 meaningful)
  if (m.streak >= 3) flags.push(`${m.streak} ${m.dir > 0 ? 'rises' : 'declines'} in a row`);
  // records — not for growth series, not for the held policy rate, and only when the latest move is real
  // (a rate merely held at an extreme is not news) and the series is long enough for "record" to mean something
  if (!GROWTH.test(id) && id !== 'banxico-tasa-objetivo' && (data(id) || []).length >= 40 && Math.abs(m.z || 0) >= 0.8) {
    if (m.isRecordHigh) flags.push('record high'); if (m.isRecordLow) flags.push('record low');
  }
  moved.push({ id, label: LABEL[id] || id, value: m.value, units: m.units, changePct: m.changePct, z: m.z, dir: m.dir, cadence: m.cadence, date: m.date, flags });
}
// rank by |z|; a move is "notable" if |z|>=1.5 or it carries a flag
moved.sort((a, b) => Math.abs(b.z || 0) - Math.abs(a.z || 0));
const notable = moved.filter((x) => Math.abs(x.z || 0) >= 1.5 || x.flags.length);
const whatMoved = { quiet: notable.length === 0, items: (notable.length ? notable : moved).slice(0, 6) };

// ---- cross-metrics Fable 2 blessed (each has a real mechanism) ----
function pairSeries(aId, bId, fn) {
  const a = data(aId), b = data(bId); if (!a || !b) return null;
  const bMap = new Map(b.map((p) => [p.date.slice(0, 7), p.value]));
  const out = [];
  for (const p of a) { const bv = bMap.get(p.date.slice(0, 7)); if (bv != null) out.push({ date: p.date, value: round(fn(p.value, bv), 3) }); }
  return out.length ? out : null;
}
const cross = {};
// real ex-post policy rate = policy rate − core inflation
if (metrics['banxico-tasa-objetivo'] && metrics['banxico-inflacion-subyacente'])
  cross.realRate = { label: 'Real policy rate (policy − core inflation)', value: round(metrics['banxico-tasa-objetivo'].value - metrics['banxico-inflacion-subyacente'].value, 2), unit: '%', from: ['banxico-tasa-objetivo','banxico-inflacion-subyacente'], neutralLow: 2.6, neutralHigh: 3.3 };
// MX−US policy rate spread (carry)
if (metrics['banxico-tasa-objetivo'] && metrics['fred-fedfunds'])
  cross.rateSpread = { label: 'Mexico − US policy-rate spread', value: round(metrics['banxico-tasa-objetivo'].value - metrics['fred-fedfunds'].value, 2), unit: 'pp', from: ['banxico-tasa-objetivo','fred-fedfunds'], series: pairSeries('banxico-tasa-objetivo','fred-fedfunds',(a,b)=>a-b) };
// remittances in pesos (USD × FX) — the super-peso story
if (data('banxico-remesas') && data('banxico-usdmxn-fix')) {
  const s = pairSeries('banxico-remesas','banxico-usdmxn-fix',(usd,fx)=>usd*fx/1000); // → billion pesos (remesas in mn USD)
  if (s) cross.pesoRemittances = { label: 'Remittances converted to pesos (bn)', unit: 'bn MXN', from: ['banxico-remesas','banxico-usdmxn-fix'], series: s, latest: s[s.length-1] };
}
// 90-day realized peso volatility (annualized, from daily log returns)
if (data('banxico-usdmxn-fix')) {
  const d = data('banxico-usdmxn-fix').slice(-90).map((p) => p.value); const r = [];
  for (let i = 1; i < d.length; i++) r.push(Math.log(d[i] / d[i - 1]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length; const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length);
  cross.pesoVol = { label: 'Peso 90-day realized volatility (annualized)', value: round(sd * Math.sqrt(252) * 100, 1), unit: '%', from: ['banxico-usdmxn-fix'] };
}

const facts = { generatedAt: nowIso, whatMoved, metrics, cross,
  note: 'Every figure is computed by code from an official series in data/series/. The Read may state only what appears here.' };

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'facts.json'), JSON.stringify(facts, null, 2));
console.log(`\n▶ facts pack — ${Object.keys(metrics).length} metrics, ${whatMoved.items.length} in What Moved${whatMoved.quiet ? ' (quiet)' : ''}, ${Object.keys(cross).length} cross-metrics\n  -> data/analysis/facts.json\n`);
