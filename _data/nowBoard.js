// nowBoard.js — the "Mexico now" board FLOOR, computed at build time (Fable audit #4).
//
// The board hydrates client-side into rich interactive cards. With no JS / a crawler /
// a slow first paint it used to show "Loading the latest readings…" — degrading to
// empty, which the floor doctrine forbids. This renders the last-known dated value of
// each headline metric into the static HTML, so the page is a complete, honest, dated
// answer on its own. The client script replaces it with the full cards on hydration,
// and now LEAVES it in place if the series fail to load (degrade to floor, never worse).

const fs = require('node:fs');
const path = require('node:path');

const read = (id) => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'series', id + '.json'), 'utf8')); }
  catch { return null; }
};
const last = (id) => {
  const s = read(id);
  const d = s && Array.isArray(s.data) ? s.data.filter((x) => x && x.value != null) : [];
  return d.length ? { value: +d[d.length - 1].value, date: d[d.length - 1].date, source: (s.meta && s.meta.source) || '' } : null;
};
const tile = (id, label, fmt) => {
  const p = last(id);
  return p ? { label, display: fmt(p.value), date: p.date, source: p.source, href: '/chart.html?v=' + id } : null;
};

module.exports = function () {
  return [
    tile('banxico-usdmxn-fix', 'Peso', (v) => v.toFixed(2) + ' MXN/US$'),
    tile('banxico-bmv-ipc', 'S&P/BMV IPC', (v) => Math.round(v).toLocaleString('en-US')),
    tile('banxico-cetes-28d', 'Cetes · 28 days', (v) => v.toFixed(2) + '%'),
    tile('fred-ust10', 'U.S. 10-year', (v) => v.toFixed(2) + '%'),
  ].filter(Boolean);
};
