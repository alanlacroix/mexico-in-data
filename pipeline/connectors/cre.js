// CRE — retail fuel prices. Keyless XML, refreshed ~every 4h, ~13k geocoded
// stations. UNICORN #3 and the most viscerally felt number in Mexico. Here we
// emit the NATIONAL AVERAGE pulse series (per fuel type), accruing one point per
// run so history builds itself. (A municipio-level fuel layer needs a spatial
// point-in-polygon join to CVEGEO — that's a Wave-3 additive layer.)

import { getText } from '../lib/http.js';

const PRICES_URL = 'https://publicacionexterna.azurewebsites.net/publicaciones/prices';

async function fetchRaw(ctx) {
  return getText(PRICES_URL, { expect: 'xml', timeoutMs: 90_000 });
}

// Regex-parse this specific, stable CRE schema (avoids an XML dependency):
//   <place ...><gas_price type="regular">22.9</gas_price>...</place>
function avgByType(xml, type) {
  const re = new RegExp(`<gas_price[^>]*type="${type}"[^>]*>\\s*([\\d.]+)\\s*</gas_price>`, 'gi');
  let sum = 0, n = 0, match;
  while ((match = re.exec(xml)) !== null) {
    const v = parseFloat(match[1]);
    if (Number.isFinite(v) && v > 0 && v < 100) { sum += v; n++; } // sanity band: MXN/L
  }
  return n ? { mean: +(sum / n).toFixed(2), stations: n } : null;
}

function makeNormalize(type) {
  return (xml, ctx, prior) => {
    const agg = avgByType(xml, type);
    if (!agg) throw new Error(`CRE: no ${type} prices parsed (schema drift or WAF page?)`);
    const date = ctx.now.slice(0, 10); // YYYY-MM-DD — live snapshot, today's vintage
    const history = Array.isArray(prior?.data) ? prior.data.filter((p) => p.date !== date) : [];
    const data = [...history, { date, value: agg.mean }].slice(-400); // keep ~1y of daily points
    return { vintage: date, data, notes: `national mean of ${agg.stations} stations` };
  };
}

const base = {
  // CRE was extinguished in the 2024–25 energy reform; its functions passed to the
  // Comisión Nacional de Energía (CNE) / Sener. The open fuel-price feed lives on.
  source: 'CNE / Sener (ex-CRE), precios de combustibles',
  sourceUrl: 'https://publicacionexterna.azurewebsites.net/publicaciones/prices',
  license: 'Términos de Libre Uso MX',
  cadence: '4-hourly',
  units: 'MXN per liter',
  track: 'pulse',
  kind: 'series',
  granularity: 'national',
  thresholds: { maxPctChange: 15, minRows: 1 },
};

export const connectors = [
  { manifest: { ...base, id: 'cre-gasolina-regular', title: 'Gasolina regular (precio nacional)', metric: 'fuel_regular', canonicalSource: true }, fetchRaw, normalize: makeNormalize('regular') },
  { manifest: { ...base, id: 'cre-gasolina-premium', title: 'Gasolina premium (precio nacional)', metric: 'fuel_premium', canonicalSource: true }, fetchRaw, normalize: makeNormalize('premium') },
  { manifest: { ...base, id: 'cre-diesel', title: 'Diésel (precio nacional)', metric: 'fuel_diesel', canonicalSource: true }, fetchRaw, normalize: makeNormalize('diesel') },
];
