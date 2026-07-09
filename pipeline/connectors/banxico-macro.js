// Banxico SIE — the domestic macro spine, pulled from Banxico (proven token)
// instead of INEGI's flaky Indicadores API. Same first-party data (Banxico
// republishes INEGI's national series), one working auth path. Verified live
// 2026-07-09: SR17622 (PIB real), SR17693 (IGAE desest.), SP74625 (INPC
// subyacente), SL11298 (salario mínimo general).
//
// Growth/activity/core are emitted as ANNUAL % change (YoY), computed the
// standard way on the official index/level — no invented precision.

import { getJson } from '../lib/http.js';

const TOKEN = () => process.env.BANXICO_TOKEN || '';
const isoFrom = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s); return m ? `${m[3]}-${m[2]}-${m[1]}` : s; };

function fetchRawFor(serie, yearsBack) {
  return async (ctx) => {
    const t = TOKEN();
    if (!t) throw new Error('missing BANXICO_TOKEN (fail-closed)');
    const d = new Date(ctx.now); d.setFullYear(d.getFullYear() - yearsBack);
    const start = d.toISOString().slice(0, 10), end = ctx.now.slice(0, 10);
    return getJson(`https://www.banxico.org.mx/SieAPIRest/service/v1/series/${serie}/datos/${start}/${end}?token=${t}`);
  };
}
function parseDatos(raw, serie) {
  const s = raw?.bmx?.series?.[0];
  if (!s || !Array.isArray(s.datos)) throw new Error(`Banxico ${serie}: no datos`);
  return s.datos
    .filter((d) => d.dato && d.dato !== 'N/E')
    .map((d) => ({ date: isoFrom(d.fecha), v: Number(String(d.dato).replace(/,/g, '')) }))
    .filter((p) => Number.isFinite(p.v))
    .sort((a, b) => a.date.localeCompare(b.date));
}
// YoY % change on an index/level, matching the same month/quarter one year prior.
function yoy(idx) {
  const byKey = new Map(idx.map((p) => [p.date.slice(0, 7), p.v]));
  const out = [];
  for (const p of idx) {
    const [y, m] = p.date.split('-');
    const prior = byKey.get(`${+y - 1}-${m}`);
    if (prior) out.push({ date: p.date, value: +(((p.v / prior) - 1) * 100).toFixed(2) });
  }
  return out;
}

// A YoY-transformed macro series (growth, activity, core inflation).
function yoyConnector({ id, title, metric, serie, cadence, notes }) {
  return {
    manifest: {
      id, title, metric, canonicalSource: true,
      source: `Banco de México / INEGI (SIE ${serie})`,
      sourceUrl: `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${serie}/datos`,
      license: 'Banxico Términos de Uso (dato de INEGI)',
      cadence, units: '% anual', track: 'pulse', kind: 'series', granularity: 'national',
      thresholds: { maxPctChange: 100000, minRows: 4 }, // YoY near zero -> % change meaningless; don't gate on it
    },
    fetchRaw: fetchRawFor(serie, 6),
    normalize(raw) {
      const data = yoy(parseDatos(raw, serie));
      if (!data.length) throw new Error(`${serie}: no YoY points`);
      return { vintage: data[data.length - 1].date, data, notes };
    },
  };
}

// A level series emitted as-is (minimum wage).
function levelConnector({ id, title, metric, serie, units, cadence, maxPct }) {
  return {
    manifest: {
      id, title, metric, canonicalSource: true,
      source: `Banco de México (SIE ${serie})`,
      sourceUrl: `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${serie}/datos`,
      license: 'Banxico Términos de Uso', cadence, units, track: 'pulse', kind: 'series',
      granularity: 'national', thresholds: { maxPctChange: maxPct, minRows: 3 },
    },
    fetchRaw: fetchRawFor(serie, 6),
    normalize(raw) {
      const data = parseDatos(raw, serie).map((p) => ({ date: p.date, value: p.v }));
      if (!data.length) throw new Error(`${serie}: no observations`);
      return { vintage: data[data.length - 1].date, data };
    },
  };
}

export const connectors = [
  yoyConnector({ id: 'banxico-pib-crecimiento', title: 'Crecimiento del PIB (anual, real)', metric: 'gdp_growth', serie: 'SR17622', cadence: 'quarterly', notes: 'Variación anual del PIB a precios constantes (base 2018), SR17622.' }),
  yoyConnector({ id: 'banxico-igae', title: 'IGAE — actividad económica (anual)', metric: 'igae', serie: 'SR17693', cadence: 'monthly', notes: 'Variación anual del IGAE desestacionalizado, base 2018.' }),
  yoyConnector({ id: 'banxico-inflacion-subyacente', title: 'Inflación subyacente (anual)', metric: 'core_inflation', serie: 'SP74625', cadence: 'monthly', notes: 'Variación anual del INPC subyacente.' }),
  levelConnector({ id: 'banxico-salario-minimo', title: 'Salario mínimo general', metric: 'min_wage', serie: 'SL11298', units: 'MXN per day', cadence: 'annual', maxPct: 60 }),
];
