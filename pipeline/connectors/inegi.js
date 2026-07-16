// INEGI Indicadores API — the ENOE labour-market feed. Free email token (INEGI_TOKEN),
// server-side only. Adds the OFFICIAL monthly/quarterly unemployment rate, replacing the
// World Bank ANNUAL proxy the site fell back on (Fable audit 2026-07-16: an accuracy gap).
//
// Bank code is BIE-BISE (plain "BIE" 404s), national area = 00. Verified live 2026-07-16:
// indicator 447564 = Tasa de Desocupación nacional, trimestral (Q1 2026 = 2.55%). The
// response returns OBSERVATIONS newest-first as { TIME_PERIOD: "YYYY/PP", OBS_VALUE }.
// Fail-closed without the token, exactly like the Banxico connector.

import { getJson } from '../lib/http.js';

const TOKEN = () => process.env.INEGI_TOKEN || '';
const BASE = 'https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR';

function makeInegi({ id, title, metric, indicator, units, cadence, quarterly = false, maxPct = 40, canonical = true }) {
  const url = `${BASE}/${indicator}/es/00/false/BIE-BISE/2.0`;
  return {
    manifest: {
      id, title, metric,
      canonicalSource: canonical,
      source: 'INEGI (ENOE)',
      sourceUrl: `${url.replace(/\/BIE-BISE.*/, '')}`,   // token-free reference URL for the sources page
      license: 'INEGI Términos de Libre Uso (attribution + commercial OK)',
      cadence, units, track: 'pulse', kind: 'series', granularity: 'national',
      thresholds: { maxPctChange: maxPct, minRows: 3 },
    },
    async fetchRaw() {
      const token = TOKEN();
      if (!token) throw new Error('missing INEGI_TOKEN (fail-closed)');
      return getJson(`${url}/${token}?type=json`);
    },
    normalize(raw) {
      const obs = raw && raw.Series && raw.Series[0] && raw.Series[0].OBSERVATIONS;
      if (!Array.isArray(obs)) throw new Error(`INEGI ${indicator}: no OBSERVATIONS`);
      const data = obs
        .map((o) => {
          const m = /^(\d{4})\/(\d{2})$/.exec(String(o.TIME_PERIOD || ''));
          if (!m) return null;
          const year = m[1], pp = Number(m[2]);
          // Quarterly periods are 01-04 → place at the quarter-end month; monthly are 01-12 as-is.
          const month = quarterly ? pp * 3 : pp;
          if (!(month >= 1 && month <= 12)) return null;
          const value = Number(o.OBS_VALUE);
          return Number.isFinite(value) ? { date: `${year}-${String(month).padStart(2, '0')}-01`, value: +value.toFixed(2) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!data.length) throw new Error(`INEGI ${indicator}: no usable observations`);
      return { vintage: data[data.length - 1].date, data, notes: `INEGI indicador ${indicator} (BIE-BISE, área 00)` };
    },
  };
}

export const connectors = [
  makeInegi({ id: 'inegi-desempleo', title: 'Tasa de desocupación nacional (ENOE)', metric: 'unemployment_enoe', indicator: '447564', units: '% de la PEA', cadence: 'quarterly', quarterly: true, maxPct: 60 }),
];
