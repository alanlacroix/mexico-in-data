// The three wired fuel series, read at build time so the Energy section can carry
// real dated numbers without a client-side chart. Twelve daily points is too thin
// to plot honestly, so this feeds a table: latest price, the change across the
// window the series actually covers, and the period it belongs to.
const fs = require('node:fs');
const path = require('node:path');

const SERIES = [
  { id: 'cre-gasolina-regular', label: 'Regular gasoline' },
  { id: 'cre-gasolina-premium', label: 'Premium gasoline' },
  { id: 'cre-diesel', label: 'Diesel' },
];
const money = (v) => 'MX$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

module.exports = function () {
  const rows = [];
  let source = '', sourceUrl = '', from = '', to = '';
  for (const s of SERIES) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'series', s.id + '.json'), 'utf8')); }
    catch { continue; }
    const data = (j.data || []).filter((p) => Number.isFinite(Number(p.value)));
    if (!data.length) continue;
    const last = data.at(-1), first = data[0];
    const delta = Number(last.value) - Number(first.value);
    rows.push({
      label: s.label,
      value: money(last.value),
      date: day(last.date),
      change: Math.abs(delta) < 0.005 ? 'unchanged' : `${delta < 0 ? '−' : '+'}${Math.abs(delta).toFixed(2)}`,
      moved: Math.abs(delta) >= 0.005,
    });
    source = j.meta?.source || source;
    sourceUrl = j.meta?.sourceUrl || sourceUrl;
    from = from || day(first.date); to = day(last.date);
  }
  return { rows, source, sourceUrl, window: from && to ? `${from} – ${to}` : '' };
};
