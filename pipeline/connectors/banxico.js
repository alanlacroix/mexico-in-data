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

function makeConnector({ id, title, metric, serie, units, cadence, maxPct, years = 1 }) {
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
      // Window scales with cadence: monthly needs ~1yr for a trend, quarterly needs several
      // years to clear the 3-row completeness floor. `years` overrides the default.
      const d = new Date(ctx.now); d.setFullYear(d.getFullYear() - years);
      const start = d.toISOString().slice(0, 10);
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
  makeConnector({ id: 'banxico-bmv-ipc', title: 'S&P/BMV IPC — índice de cierre', metric: 'bmv_ipc', serie: 'SF43716', units: 'index points', cadence: 'business-daily', maxPct: 20 }),
  makeConnector({ id: 'banxico-cetes-28d', title: 'Cetes a 28 días — tasa de rendimiento', metric: 'cetes_28d', serie: 'SF45470', units: '% annual', cadence: 'business-daily', maxPct: 50 }),
  makeConnector({ id: 'banxico-reservas', title: 'Reservas internacionales', metric: 'reserves', serie: 'SF43707', units: 'million US$', cadence: 'weekly', maxPct: 20 }),
  // Remittances — ~4% of GDP, the most-felt first-party number. Verified SE27803.
  makeConnector({ id: 'banxico-remesas', title: 'Remesas familiares (total)', metric: 'remittances', serie: 'SE27803', units: 'million US$', cadence: 'monthly', maxPct: 25, years: 2 }),

  // ---- PAYMENTS PILLAR (Fable 2026-07-11): the country's payment rails + system aggregates only,
  // never a private company. Series ids found + cross-verified against the SIE catalog. All fail-closed:
  // a wrong id shows "awaiting", never a fabricated number, and each carries its cadence for the freshness gate.
  makeConnector({ id: 'banxico-spei-operaciones', title: 'SPEI — número de operaciones (tercero a tercero)', metric: 'spei_ops', serie: 'SF273317', units: 'operaciones', cadence: 'monthly', maxPct: 40 }),
  makeConnector({ id: 'banxico-spei-monto', title: 'SPEI — monto total operado', metric: 'spei_value', serie: 'SF273318', units: 'MXN', cadence: 'monthly', maxPct: 40 }),
  // Cards + ATM (Fable's merchant frontier). Quarterly, Banxico SIE — switch-sourced SYSTEM aggregates,
  // never a named private company. Debit-at-POS + ATM cash confirmed; credit + e-commerce added once
  // their specific series ids are pinned. (SF62272 total-TPV went dark, so we use the debit series.)
  makeConnector({ id: 'banxico-tpv-debito-ops',   title: 'TPV — operaciones con tarjeta de débito', metric: 'debit_pos_ops',   serie: 'SF62273', units: 'operaciones',  cadence: 'quarterly', maxPct: 45, years: 6 }),
  makeConnector({ id: 'banxico-tpv-debito-monto', title: 'TPV — importe con tarjeta de débito',     metric: 'debit_pos_value', serie: 'SF62279', units: 'million MXN', cadence: 'quarterly', maxPct: 45, years: 6 }),
  makeConnector({ id: 'banxico-cajeros-ops',      title: 'Cajeros — retiros de efectivo (operaciones)', metric: 'atm_ops',    serie: 'SF62269', units: 'operaciones',  cadence: 'quarterly', maxPct: 40, years: 6 }),
  makeConnector({ id: 'banxico-cajeros-monto',    title: 'Cajeros — retiros de efectivo (importe)',     metric: 'atm_value',  serie: 'SF62275', units: 'million MXN', cadence: 'quarterly', maxPct: 40, years: 6 }),
  // Credit-card at POS (CF268 credit rows), e-commerce (CF621), and cards in circulation (CF256).
  // All quarterly SYSTEM aggregates — no named private company. Cards total = credit + debit (CF256 has
  // no single combined row), summed on the page.
  makeConnector({ id: 'banxico-tpv-credito-ops',   title: 'TPV — operaciones con tarjeta de crédito', metric: 'credit_pos_ops',   serie: 'SF62274',  units: 'operaciones',  cadence: 'quarterly', maxPct: 45, years: 6 }),
  makeConnector({ id: 'banxico-tpv-credito-monto', title: 'TPV — importe con tarjeta de crédito',     metric: 'credit_pos_value', serie: 'SF62280',  units: 'million MXN', cadence: 'quarterly', maxPct: 45, years: 6 }),
  makeConnector({ id: 'banxico-ecommerce-ops',     title: 'Comercio electrónico — operaciones con tarjeta', metric: 'ecom_ops',   serie: 'SF273475', units: 'operaciones',  cadence: 'quarterly', maxPct: 55, years: 6 }),
  makeConnector({ id: 'banxico-ecommerce-monto',   title: 'Comercio electrónico — importe con tarjeta',     metric: 'ecom_value', serie: 'SF273476', units: 'million MXN', cadence: 'quarterly', maxPct: 55, years: 6 }),
  makeConnector({ id: 'banxico-tarjetas-credito',  title: 'Tarjetas de crédito vigentes (todas las marcas)', metric: 'cards_credit', serie: 'SF61870', units: 'tarjetas', cadence: 'quarterly', maxPct: 25, years: 6 }),
  makeConnector({ id: 'banxico-tarjetas-debito',   title: 'Tarjetas de débito vigentes (todas las marcas)',  metric: 'cards_debit',  serie: 'SF61871', units: 'tarjetas', cadence: 'quarterly', maxPct: 25, years: 6 }),
  makeConnector({ id: 'banxico-consumo-privado',   title: 'Consumo privado — índice mensual (desest.)', metric: 'private_consumption', serie: 'SR17449', units: 'index 2018=100', cadence: 'monthly', maxPct: 20, years: 6 }), // base-2018 IMCPMI (SR16563 was base-2013, discontinued May 2023)
  makeConnector({ id: 'banxico-remesas-electronicas', title: 'Remesas — transferencias electrónicas', metric: 'remittances_electronic', serie: 'SE27806', units: 'million US$', cadence: 'monthly', maxPct: 25, years: 2 }),
  // Currency in circulation (SF1, monthly). Native unit is MILES de pesos → convert to millones (÷1000)
  // so it matches every other importe series on the page. The cash half of the paradox.
  {
    manifest: {
      id: 'banxico-circulante', title: 'Billetes y monedas en circulación', metric: 'currency_circulation', canonicalSource: true,
      source: 'Banco de México (SIE)', sourceUrl: 'https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF1/datos',
      license: 'Banxico Términos de Uso (attribution; not open — Clause 8)', cadence: 'monthly', units: 'million MXN',
      track: 'pulse', kind: 'series', granularity: 'national', thresholds: { maxPctChange: 20, minRows: 3 },
    },
    async fetchRaw(ctx) {
      const token = TOKEN(); if (!token) throw new Error('missing BANXICO_TOKEN (fail-closed)');
      const d = new Date(ctx.now); d.setFullYear(d.getFullYear() - 6);
      const start = d.toISOString().slice(0, 10), end = ctx.now.slice(0, 10);
      return getJson(`https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF1/datos/${start}/${end}?token=${token}`);
    },
    normalize(raw) {
      const s = raw?.bmx?.series?.[0]; if (!s || !Array.isArray(s.datos)) throw new Error('SF1: no datos');
      const data = s.datos.filter((d) => d.dato && d.dato !== 'N/E')
        .map((d) => ({ date: isoFrom(d.fecha), value: Number(String(d.dato).replace(/,/g, '')) / 1000 })) // miles → millones
        .filter((p) => Number.isFinite(p.value)).sort((a, b) => a.date.localeCompare(b.date));
      if (!data.length) throw new Error('SF1: no usable observations');
      return { vintage: data[data.length - 1].date, data, notes: 'Billetes y monedas en circulación (SF1), de miles a millones de pesos' };
    },
  },
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

  // ---- TRADE PILLAR (Banxico SIE cuadro CE125 — Balanza comercial de mercancías, monthly, thousands US$).
  // Mexican-official, validates dollar-for-dollar against INEGI's BCMM boletín. The trade-over-time
  // backbone; treemap/partner detail comes from UN COMTRADE (context-tier, reconciled to these totals).
  makeConnector({ id: 'banxico-exports-total',       title: 'Exportaciones totales de mercancías',        metric: 'exports_total',       serie: 'SE36593', units: 'thousand US$', cadence: 'monthly', maxPct: 40, years: 27 }), // long window → the two-decade arc
  makeConnector({ id: 'banxico-imports-total',       title: 'Importaciones totales de mercancías',        metric: 'imports_total',       serie: 'SE36595', units: 'thousand US$', cadence: 'monthly', maxPct: 40, years: 27 }),
  makeConnector({ id: 'banxico-trade-balance',       title: 'Balanza comercial (saldo)',                  metric: 'trade_balance',       serie: 'SE28294', units: 'thousand US$', cadence: 'monthly', maxPct: 400, years: 3 }),
  makeConnector({ id: 'banxico-exports-nonoil',      title: 'Exportaciones no petroleras',                metric: 'exports_nonoil',      serie: 'SE35397', units: 'thousand US$', cadence: 'monthly', maxPct: 40, years: 3 }),
  makeConnector({ id: 'banxico-exports-oil',         title: 'Exportaciones petroleras',                   metric: 'exports_oil',         serie: 'SE32150', units: 'thousand US$', cadence: 'monthly', maxPct: 70, years: 3 }),
  makeConnector({ id: 'banxico-exports-manufactures',title: 'Exportaciones manufactureras',               metric: 'exports_manuf',       serie: 'SE35398', units: 'thousand US$', cadence: 'monthly', maxPct: 40, years: 3 }),
  makeConnector({ id: 'banxico-imports-consumer',    title: 'Importaciones de bienes de consumo',         metric: 'imports_consumer',    serie: 'SE36597', units: 'thousand US$', cadence: 'monthly', maxPct: 40, years: 27 }),
  makeConnector({ id: 'banxico-imports-intermediate',title: 'Importaciones de bienes intermedios',        metric: 'imports_intermediate',serie: 'SE36598', units: 'thousand US$', cadence: 'monthly', maxPct: 40, years: 27 }),
  makeConnector({ id: 'banxico-imports-capital',     title: 'Importaciones de bienes de capital',         metric: 'imports_capital',     serie: 'SE36599', units: 'thousand US$', cadence: 'monthly', maxPct: 40, years: 27 }),

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

  // INPC index LEVEL (SP1, base 2Q Jul 2018 = 100). Same series the inflation connector reads, but kept
  // as the raw price index so the site can deflate nominal series (e.g. the minimum wage) into real terms.
  // A 12-year window covers the "since 2018" real-wage comparison. makeConnector emits d.dato as-is, and
  // for SP1 that IS the index level — no custom normalize needed.
  makeConnector({ id: 'banxico-inpc', title: 'INPC — índice general (nivel)', metric: 'cpi_index', serie: 'SP1', units: 'index (2Q Jul 2018 = 100)', cadence: 'monthly', maxPct: 20, years: 12 }),
];
