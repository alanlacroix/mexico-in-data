// World Bank Indicators API — keyless, wildcard-CORS, the broadest national
// context series. Annual, so these are "latest annual", not high-frequency —
// good for headline context tiles + international comparison. Canonical source
// for cross-country comparison; NOT canonical for MX-native metrics that INEGI
// owns (INEGI wins those — one-canonical-source-per-metric).

import { getJson } from '../lib/http.js';

const api = (ind) =>
  `https://api.worldbank.org/v2/country/MEX/indicator/${ind}?format=json&per_page=300`;

function makeConnector({ id, title, metric, indicator, units }) {
  return {
    manifest: {
      id,
      title,
      metric,
      canonicalSource: false, // WB is the comparison lane, not the MX-native truth
      source: 'Banco Mundial (Indicators API)',
      sourceUrl: api(indicator),
      license: 'CC BY 4.0',
      cadence: 'annual',
      units,
      track: 'context',
      kind: 'series',
      granularity: 'national',
      thresholds: { maxPctChange: 40, minRows: 5 },
    },
    async fetchRaw() {
      return getJson(api(indicator));
    },
    normalize(raw) {
      if (!Array.isArray(raw) || !Array.isArray(raw[1]))
        throw new Error(`World Bank ${indicator}: unexpected response shape`);
      const rows = raw[1]
        .filter((r) => r && r.value != null)
        .map((r) => ({ date: r.date, value: Number(r.value) }))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!rows.length) throw new Error(`World Bank ${indicator}: no non-null observations`);
      return { vintage: rows[rows.length - 1].date, data: rows };
    },
  };
}

export const connectors = [
  makeConnector({ id: 'wb-gdp-usd', title: 'PIB (GDP, US$ corrientes)', metric: 'gdp_usd', indicator: 'NY.GDP.MKTP.CD', units: 'current US$' }),
  makeConnector({ id: 'wb-gdp-per-capita', title: 'PIB per cápita (US$)', metric: 'gdp_per_capita_usd', indicator: 'NY.GDP.PCAP.CD', units: 'current US$' }),
  makeConnector({ id: 'wb-inflation', title: 'Inflación anual (World Bank)', metric: 'inflation_annual_wb', indicator: 'FP.CPI.TOTL.ZG', units: '% annual' }),
  makeConnector({ id: 'wb-population', title: 'Población total', metric: 'population', indicator: 'SP.POP.TOTL', units: 'people' }),
  makeConnector({ id: 'wb-unemployment', title: 'Desempleo (World Bank est.)', metric: 'unemployment_wb', indicator: 'SL.UEM.TOTL.ZS', units: '% labor force' }),
];
