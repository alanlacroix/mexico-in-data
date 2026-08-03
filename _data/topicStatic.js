// topicStatic.js — the server-rendered core of each topic room.
//
// topic-pages.njk is a client-side application: it fetches ~30 series files at
// runtime and builds the page in JavaScript. That left five rooms shipping
// "Loading the latest data…" as their entire HTML — blank to a crawler, blank to
// a reader without JS, on a site whose whole promise is sourced, checkable
// numbers (Fable's audit, 2026-08-02: a correctness defect, not a design choice).
//
// This renders a real core at build time — the room's scope, its headline
// readings straight from the same series files, and the method note — so the page
// is substantive before a line of JavaScript runs. The app then replaces
// #topicApp with the full interactive version for readers who have it. Classic
// progressive enhancement: the static core is the floor, never the ceiling.
const fs = require('node:fs');
const path = require('node:path');

const DATA = path.join(__dirname, '..', 'data');
const read = (rel, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8')); } catch { return fallback; }
};

// Latest finite observation of a series, with its own observation date.
const latest = (id) => {
  const rows = (read(`series/${id}.json`, {}).data || []).filter((r) => r && Number.isFinite(Number(r.value)));
  const row = rows[rows.length - 1];
  return row ? { value: Number(row.value), date: String(row.date).slice(0, 10) } : null;
};

const fmt = (n, digits = 2) => Number(n).toLocaleString('en-US', {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
});

// The connectors store trade in thousands of dollars and remittances and cash in
// millions. Printed raw that reads as "72,551,015 thousand US$", which is accurate
// and unreadable. `scale` divides and renames, so the number a reader sees is the
// same reading at the scale a publication would print it.
const SCALES = {
  'thousand US$': [1e6, 'US$ billion', 2],
  'million US$': [1e3, 'US$ billion', 2],
  'million MXN': [1e6, 'MXN trillion', 2],
};
const monthDay = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
};

// Per room: the scope sentence a reader needs, and the readings that room leads on.
// Each entry names its series id, so a number here can only ever be a number the
// site already publishes — the closed world holds in the static core too.
const ROOMS = {
  economy: {
    scope: 'Growth, inflation, the policy rate and the peso, each on its own observation date, with the underlying series behind every reading.',
    rows: [
      ['Headline inflation', 'banxico-inflacion', '% y/y', 2],
      ['Policy rate', 'banxico-tasa-objetivo', '%', 2],
      ['Economic activity (IGAE)', 'banxico-igae', '% y/y', 2],
      ['Peso', 'banxico-usdmxn-fix', 'MXN/US$', 2],
      ['Minimum wage', 'banxico-salario-minimo', 'MXN/day', 2],
    ],
  },
  payments: {
    scope: 'Mexico’s payment rails: transfers, cards, e-commerce and cash. Counted in operations first, because peso totals are dominated by a handful of very large transfers.',
    rows: [
      ['SPEI transfers', 'banxico-spei-operaciones', 'operations', 0],
      ['CoDi payments', 'banxico-codi-operaciones', 'operations', 0],
      ['Debit card purchases', 'banxico-tpv-debito-ops', 'operations', 0],
      ['Credit card purchases', 'banxico-tpv-credito-ops', 'operations', 0],
      ['Cash in circulation', 'banxico-circulante', 'million MXN', 0],
    ],
  },
  society: {
    scope: 'Population, wages and the household flows that carry them, with each official measure kept on its own clock rather than blended into one date.',
    rows: [
      ['Remittances', 'banxico-remesas', 'million US$', 0],
      ['Minimum wage', 'banxico-salario-minimo', 'MXN/day', 2],
      ['Population', 'wb-population', 'people', 0],
      ['Unemployment', 'wb-unemployment', '% of labor force', 2],
    ],
  },
  usmexico: {
    scope: 'The bilateral goods ledger and Mexico’s export exposure, read from the trade series rather than from announcements.',
    rows: [
      ['Goods exports', 'banxico-exports-total', 'thousand US$', 0],
      ['Goods imports', 'banxico-imports-total', 'thousand US$', 0],
      ['Trade balance', 'banxico-trade-balance', 'thousand US$', 0],
      ['Intermediate imports', 'banxico-imports-intermediate', 'thousand US$', 0],
    ],
  },
  politics: {
    // Politics carries no series of its own: its substance is the dated decision
    // log and the official calendar. Saying so is more honest than padding it
    // with numbers that belong to another room.
    scope: 'The dated political decisions and the official calendar that move money and rules. This room follows the decision log rather than a data series.',
    rows: [],
  },
};

module.exports = function () {
  const out = {};
  for (const [key, room] of Object.entries(ROOMS)) {
    out[key] = {
      scope: room.scope,
      readings: room.rows.map(([label, id, unit, digits]) => {
        const point = latest(id);
        if (!point) return null;
        const scale = SCALES[unit];
        const value = scale ? point.value / scale[0] : point.value;
        return {
          label,
          unit: scale ? scale[1] : unit,
          value: fmt(value, scale ? scale[2] : digits),
          asOf: monthDay(point.date),
        };
      }).filter(Boolean),
    };
  }
  return out;
};
