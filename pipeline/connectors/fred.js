// FRED — Federal Reserve Bank of St. Louis. The US-side series that actually move
// the peso and Mexican exports: US Treasury yields, the Fed funds rate, the broad
// dollar index, and two US-demand proxies (vehicle sales, industrial production).
// Free key (FRED_API_KEY). These are the "US pull" — canonical for US data, context
// for Mexico (the causal model's external levers). Keyless-parse, fail-closed.

import { getJson } from '../lib/http.js';

const KEY = () => process.env.FRED_API_KEY;
const api = (series) =>
  `https://api.stlouisfed.org/fred/series/observations` +
  `?series_id=${series}&api_key=${KEY()}&file_type=json&observation_start=2015-01-01&sort_order=asc`;

function makeConnector({ id, title, metric, series, units, cadence }) {
  return {
    manifest: {
      id, title, metric,
      canonicalSource: true,           // FRED is canonical for US-side series
      source: 'FRED, Federal Reserve Bank of St. Louis',
      sourceUrl: `https://fred.stlouisfed.org/series/${series}`,
      license: 'FRED terms; underlying US federal data is public domain',
      cadence, units,
      track: 'context',                // US context that drives Mexico
      kind: 'series',
      granularity: 'national',         // US national
      thresholds: { maxPctChange: 300, minRows: 12 },
    },
    async fetchRaw() {
      if (!KEY()) throw new Error('missing FRED_API_KEY');
      return getJson(api(series));
    },
    normalize(raw) {
      const obs = raw && raw.observations;
      if (!Array.isArray(obs)) throw new Error(`FRED ${series}: unexpected response`);
      const rows = obs
        .filter((o) => o.value != null && o.value !== '.' && o.value !== '')
        .map((o) => ({ date: o.date, value: Number(o.value) }))
        .filter((p) => Number.isFinite(p.value))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!rows.length) throw new Error(`FRED ${series}: no observations`);
      return { vintage: rows[rows.length - 1].date, data: rows, notes: `FRED series ${series}.` };
    },
  };
}

export const connectors = [
  makeConnector({ id: 'fred-ust10', title: 'US 10-year Treasury yield', metric: 'us_10y', series: 'DGS10', units: '%', cadence: 'daily' }),
  makeConnector({ id: 'fred-ust2', title: 'US 2-year Treasury yield', metric: 'us_2y', series: 'DGS2', units: '%', cadence: 'daily' }),
  makeConnector({ id: 'fred-fedfunds', title: 'US federal funds rate', metric: 'us_fed_funds', series: 'FEDFUNDS', units: '%', cadence: 'monthly' }),
  makeConnector({ id: 'fred-usd-broad', title: 'US dollar index (broad, nominal)', metric: 'usd_broad_index', series: 'DTWEXBGS', units: 'index (Jan 2006 = 100)', cadence: 'weekly' }),
  makeConnector({ id: 'fred-us-autosales', title: 'US total vehicle sales', metric: 'us_vehicle_sales', series: 'TOTALSA', units: 'million units (SAAR)', cadence: 'monthly' }),
  makeConnector({ id: 'fred-us-indpro', title: 'US industrial production', metric: 'us_industrial_production', series: 'INDPRO', units: 'index (2017 = 100)', cadence: 'monthly' }),
];
