// paymentsBoard.js — the "How Mexico pays" data section (Fable ruling 2026-07-17: Payments
// is a FIRST-PARTY DATA surface, not a news tab). Computed at build time from the existing
// Banxico payments-pillar series, so the section is a complete, dated answer on its own and
// can never go empty. Each tile shows the latest reading + year-over-year change — payments
// is a GROWTH story (SPEI's rise, CoDi's flatline), so the trend is the point.

const fs = require('node:fs');
const path = require('node:path');

const read = (id) => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'series', id + '.json'), 'utf8')); }
  catch { return null; }
};
const series = (id) => { const s = read(id); return s && Array.isArray(s.data) ? s.data.filter((x) => x && x.value != null) : []; };

// Year-over-year vs the reading closest to 12 months before the latest (works for monthly
// and quarterly), within a 45-day tolerance so we never compare against the wrong period.
const yoy = (data) => {
  if (data.length < 4) return null;
  const latest = data[data.length - 1];
  const target = Date.parse(latest.date) - 31536e6;
  let prior = null, best = Infinity;
  for (const d of data) { if (d === latest) continue; const diff = Math.abs(Date.parse(d.date) - target); if (diff < best) { best = diff; prior = d; } }
  if (!prior || +prior.value === 0 || best > 45 * 864e5) return null;
  return (+latest.value / +prior.value - 1) * 100;
};

const tile = (id, label, fmt, note) => {
  const data = series(id);
  if (!data.length) return null;
  const latest = data[data.length - 1];
  const g = yoy(data);
  const meta = (read(id) || {}).meta || {};
  return {
    label, display: fmt(+latest.value), note,
    change: g == null ? '' : (g >= 0 ? '+' : '') + Math.round(g) + '% vs a year ago',
    up: g == null ? null : g >= 0,
    date: latest.date, source: meta.source || 'Banco de México', href: '/chart.html?v=' + id,
  };
};

// Compact count formatter: 406,000,000 -> "406M", 2,100,000,000 -> "2.1B".
const compact = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return Math.round(v / 1e6) + 'M';
  if (a >= 1e3) return Math.round(v / 1e3) + 'K';
  return String(Math.round(v));
};

module.exports = function () {
  return [
    tile('banxico-spei-operaciones', 'SPEI transfers', (v) => compact(v) + '/mo', 'Instant bank-to-bank transfers — the rail Mexico actually runs on.'),
    tile('banxico-codi-operaciones', 'CoDi payments', (v) => compact(v) + '/mo', 'Banxico’s free QR request-to-pay — the rail that never caught on.'),
    tile('banxico-tpv-debito-ops', 'Debit-card purchases', (v) => compact(v) + '/qtr', 'Card taps at the point of sale.'),
    tile('banxico-remesas', 'Remittances', (v) => '$' + (v / 1000).toFixed(1) + 'B/mo', 'Dollars sent home by workers abroad — one of Mexico’s largest inflows.'),
  ].filter(Boolean);
};
