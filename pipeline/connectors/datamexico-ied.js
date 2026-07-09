// Inversión Extranjera Directa (IED / FDI) — national quarterly flow, US$.
// Source: Secretaría de Economía via the Data México Tesseract OLAP API
// (public, no token). Verified 2026-07-09: cube fdi_9_quarter, measure
// Investment = flujo trimestral en millones de dólares. The old
// api.datamexico.org host is dead; the API now lives under economia.gob.mx.

import { getJson } from '../lib/http.js';

const URL =
  'https://www.economia.gob.mx/apidatamexico/tesseract/data.jsonrecords' +
  '?cube=fdi_9_quarter&drilldowns=Quarter&measures=Investment';

// "2024-Q4" -> "2024-10" (quarter-start month, sortable ISO-ish)
function quarterToIso(q) {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(q).trim());
  if (!m) return String(q);
  return `${m[1]}-${['01', '04', '07', '10'][+m[2] - 1]}`;
}

export const connectors = [
  {
    manifest: {
      id: 'se-ied',
      title: 'Inversión Extranjera Directa (flujo trimestral)',
      metric: 'fdi',
      canonicalSource: true,
      source: 'Secretaría de Economía (Data México)',
      sourceUrl: 'https://www.economia.gob.mx/datamexico/',
      license: 'Datos abiertos (Data México / Secretaría de Economía)',
      cadence: 'quarterly',
      units: 'million US$',
      track: 'pulse',
      kind: 'series',
      granularity: 'national',
      thresholds: { maxPctChange: 100000, minRows: 8 }, // FDI is lumpy quarter to quarter
    },
    async fetchRaw() {
      return getJson(URL);
    },
    normalize(raw) {
      const rows = raw?.data;
      if (!Array.isArray(rows) || !rows.length) throw new Error('IED: empty data');
      const data = rows
        .filter((r) => r.Investment != null && r.Quarter)
        .map((r) => ({ date: quarterToIso(r.Quarter), value: Number(r.Investment) }))
        .filter((p) => Number.isFinite(p.value))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!data.length) throw new Error('IED: no usable rows');
      return { vintage: data[data.length - 1].date, data, notes: 'Flujo de IED por trimestre, millones de USD (cube fdi_9_quarter).' };
    },
  },
];
