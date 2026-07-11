// Banxico SIE API — the rate/FX heartbeat. Free token (one-time captcha at
// banxico.org.mx), passed via env BANXICO_TOKEN. Without it the connector fails
// CLOSED and the data-health page honestly shows "awaiting token" — never a
// fabricated number.
//
// LICENSE NOTE (Fable): Banxico is NOT an open license. Clause 1 permits
// reproduction with attribution; Clause 8 bars implying endorsement or selling
// the data AS data. Fine for a free public site with "Fuente: Banco de México
// (SIE)". If the feed is ever monetized directly -> that is a strategy trigger.

import { getJson } from '../lib/http.js';

const TOKEN = () => process.env.BANXICO_TOKEN || '';

function isoFrom(ddmmyyyy) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ddmmyyyy;
}

function yearAgo(nowIso) {
  const d = new Date(nowIso);
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function makeConnector({ id, title, metric, serie, units, cadence, maxPct }) {
  return {
    manifest: {
      id,
      title,
      metric,
      canonicalSource: true, // Banxico is canonical for MX rates/FX
      source: 'Banco de México (SIE)',
      sourceUrl: `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${serie}/datos`,
      license: 'Banxico Términos de Uso (attribution; not open — Clause 8)',
      cadence,
      units,
      track: 'pulse',
      kind: 'series',
      granularity: 'national',
      thresholds: { maxPctChange: maxPct, minRows: 3 },
    },
    async fetchRaw(ctx) {
      const token = TOKEN();
      if (!token) throw new Error('missing BANXICO_TOKEN (fail-closed)');
      const start = yearAgo(ctx.now);
      const end = ctx.now.slice(0, 10);
      const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${serie}/datos/${start}/${end}?token=${token}`;
      return getJson(url);
    },
    normalize(raw) {
      const s = raw?.bmx?.series?.[0];
      if (!s || !Array.isArray(s.datos)) throw new Error(`Banxico ${serie}: no series datos`);
      const data = s.datos
        .filter((d) => d.dato && d.dato !== 'N/E')
        .map((d) => ({ date: isoFrom(d.fecha), value: Number(String(d.dato).replace(/,/g, '')) }))
        .filter((p) => Number.isFinite(p.value))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!data.length) throw new Error(`Banxico ${serie}: no usable observations`);
      return { vintage: data[data.length - 1].date, data };
    },
  };
}

export const connectors = [
  makeConnector({ id: 'banxico-tasa-objetivo', title: 'Tasa objetivo (política monetaria)', metric: 'policy_rate', serie: 'SF61745', units: '%', cadence: 'daily', maxPct: 30 }),
  makeConnector({ id: 'banxico-usdmxn-fix', title: 'Tipo de cambio USD/MXN (FIX)', metric: 'usdmxn', serie: 'SF43718', units: 'MXN per USD', cadence: 'business-daily', maxPct: 15 }),
  makeConnector({ id: 'banxico-reservas', title: 'Reservas internacionales', metric: 'reserves', serie: 'SF43707', units: 'million US$', cadence: 'weekly', maxPct: 20 }),
  // Remittances — ~4% of GDP, the most-felt first-party number. Verified SE27803.
  makeConnector({ id: 'banxico-remesas', title: 'Remesas familiares (total)', metric: 'remittances', serie: 'SE27803', units: 'million US$', cadence: 'monthly', maxPct: 25 }),

  // ---- PAYMENTS PILLAR (Fable 2026-07-11): the country's payment rails + system aggregates only,
  // never a private company. Series ids found + cross-verified against the SIE catalog. All fail-closed:
  // a wrong id shows "awaiting", never a fabricated number, and each carries its cadence for the freshness gate.
  makeConnector({ id: 'banxico-spei-operaciones', title: 'SPEI — número de operaciones (tercero a tercero)', metric: 'spei_ops', serie: 'SF273317', units: 'operaciones', cadence: 'monthly', maxPct: 40 }),
  makeConnector({ id: 'banxico-spei-monto', title: 'SPEI — monto total operado', metric: 'spei_value', serie: 'SF273318', units: 'MXN', cadence: 'monthly', maxPct: 40 }),
  // card-POS (SF62272) did NOT resolve on the SIE API (fail-closed, went dark) — disabled so it isn't a
  // permanently-failed feed. Re-add for v1.1 once the correct card-terminal series id is pinned.
  // makeConnector({ id: 'banxico-tpv-operaciones', title: 'Pagos con tarjeta en TPV — número de operaciones', metric: 'card_pos_ops', serie: 'SF62272', units: 'operaciones', cadence: 'quarterly', maxPct: 45 }),
  makeConnector({ id: 'banxico-remesas-electronicas', title: 'Remesas — transferencias electrónicas', metric: 'remittances_electronic', serie: 'SE27806', units: 'million US$', cadence: 'monthly', maxPct: 25 }),
  // CoDi is published DAILY (SF335701). Aggregate to monthly totals; drop the trailing partial month so a
  // half-summed current month never reads as a crash.
  {
    manifest: {
      id: 'banxico-codi-operaciones', title: 'CoDi — operaciones (mensual)', metric: 'codi_ops', canonicalSource: true,
      source: 'Banco de México (SIE)', sourceUrl: 'https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF335701/datos',
      license: 'Banxico Términos de Uso (attribution; not open — Clause 8)', cadence: 'monthly', units: 'operaciones',
      track: 'pulse', kind: 'series', granularity: 'national', thresholds: { maxPctChange: 120, minRows: 3 },
    },
    async fetchRaw(ctx) {
      const token = TOKEN(); if (!token) throw new Error('missing BANXICO_TOKEN (fail-closed)');
      const d = new Date(ctx.now); d.setFullYear(d.getFullYear() - 2);
      const start = d.toISOString().slice(0, 10), end = ctx.now.slice(0, 10);
      return getJson(`https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF335701/datos/${start}/${end}?token=${token}`);
    },
    normalize(raw) {
      const s = raw?.bmx?.series?.[0]; if (!s || !Array.isArray(s.datos)) throw new Error('SF335701: no datos');
      const daily = s.datos.filter((d) => d.dato && d.dato !== 'N/E')
        .map((d) => ({ date: isoFrom(d.fecha), v: Number(String(d.dato).replace(/,/g, '')) })).filter((p) => Number.isFinite(p.v));
      const byMonth = new Map(); for (const p of daily) { const m = p.date.slice(0, 7); byMonth.set(m, (byMonth.get(m) || 0) + p.v); }
      const months = [...byMonth.entries()].map(([m, v]) => ({ date: m + '-01', value: v })).sort((a, b) => a.date.localeCompare(b.date));
      const data = months.length > 3 ? months.slice(0, -1) : months;
      if (!data.length) throw new Error('CoDi: no monthly totals');
      return { vintage: data[data.length - 1].date, data, notes: 'Suma mensual de operaciones diarias CoDi (SF335701)' };
    },
  },

  // Inflation — Banxico republishes INEGI's INPC (SP1 = índice general). We emit
  // headline ANNUAL inflation, computed the standard way (YoY on the official
  // index). First-party (central bank + INEGI), and it dodges INEGI's flaky API.
  {
    manifest: {
      id: 'banxico-inflacion', title: 'Inflación anual (INPC)', metric: 'inflation', canonicalSource: true,
      source: 'Banco de México / INEGI — INPC', sourceUrl: 'https://www.banxico.org.mx/SieAPIRest/service/v1/series/SP1/datos',
      license: 'Banxico Términos de Uso (INPC de INEGI)', cadence: 'monthly', units: '% anual', track: 'pulse',
      kind: 'series', granularity: 'national', thresholds: { maxPctChange: 80, minRows: 6 },
    },
    async fetchRaw(ctx) {
      const token = TOKEN();
      if (!token) throw new Error('missing BANXICO_TOKEN (fail-closed)');
      const d = new Date(ctx.now); d.setFullYear(d.getFullYear() - 3);
      const start = d.toISOString().slice(0, 10), end = ctx.now.slice(0, 10);
      return getJson(`https://www.banxico.org.mx/SieAPIRest/service/v1/series/SP1/datos/${start}/${end}?token=${token}`);
    },
    normalize(raw) {
      const s = raw?.bmx?.series?.[0];
      if (!s || !Array.isArray(s.datos)) throw new Error('SP1: no datos');
      const idx = s.datos.filter((d) => d.dato && d.dato !== 'N/E')
        .map((d) => ({ date: isoFrom(d.fecha), v: Number(String(d.dato).replace(/,/g, '')) }))
        .filter((p) => Number.isFinite(p.v)).sort((a, b) => a.date.localeCompare(b.date));
      const byMonth = new Map(idx.map((p) => [p.date.slice(0, 7), p.v]));
      const data = [];
      for (const p of idx) {
        const [y, m] = p.date.split('-');
        const prior = byMonth.get(`${+y - 1}-${m}`);
        if (prior) data.push({ date: p.date, value: +(((p.v / prior) - 1) * 100).toFixed(2) });
      }
      if (!data.length) throw new Error('inflation: no YoY points computed');
      return { vintage: data[data.length - 1].date, data, notes: 'YoY del INPC general (SP1)' };
    },
  },
];
