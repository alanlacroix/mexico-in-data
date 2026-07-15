// publication-contract.js — deterministic contracts for every data-backed public page.
// The connector contract protects one fetch. This file protects the assembled product:
// every page has the files it needs, every served observation is internally coherent,
// and a bad derived artifact cannot reach the browser just because its fetch succeeded.

import path from 'node:path';

// Canonical public topic taxonomy. The homepage, navigation, topic pages, and
// generated area summaries must use this exact order and destination set.
// Keeping this next to the publication gate means an old generated areas file
// cannot quietly restore a retired topic after a successful site build.
export const PUBLIC_TOPIC_AREAS = Object.freeze([
  Object.freeze({ key: 'economy', label: 'Economy & money', href: '/economy.html' }),
  Object.freeze({ key: 'payments', label: 'Payments', href: '/payments.html' }),
  Object.freeze({ key: 'trade', label: 'Trade', href: '/trade.html' }),
  Object.freeze({ key: 'politics', label: 'Politics', href: '/politics.html' }),
  Object.freeze({ key: 'society', label: 'Society & security', href: '/society.html' }),
  Object.freeze({ key: 'usmexico', label: 'U.S.–Mexico', href: '/us-mexico.html' }),
]);

const SERIES = (id) => `data/series/${id}.json`;

const MONEY = [
  'banxico-usdmxn-fix', 'banxico-inflacion', 'banxico-inflacion-subyacente',
  'banxico-tasa-objetivo', 'banxico-reservas', 'banxico-remesas',
].map(SERIES);

const PAYMENTS = [
  'banxico-spei-operaciones', 'banxico-spei-monto', 'banxico-codi-operaciones',
  'banxico-tpv-debito-ops', 'banxico-tpv-debito-monto', 'banxico-tpv-credito-ops',
  'banxico-tpv-credito-monto', 'banxico-ecommerce-ops', 'banxico-ecommerce-monto',
  'banxico-cajeros-ops', 'banxico-cajeros-monto', 'banxico-circulante',
  'banxico-consumo-privado', 'banxico-remesas-electronicas',
  'banxico-tarjetas-credito', 'banxico-tarjetas-debito',
].map(SERIES);

const CHARTS = [
  'banxico-usdmxn-fix', 'banxico-tasa-objetivo', 'fred-fedfunds', 'fred-ust10',
  'banxico-reservas', 'fred-usd-broad', 'banxico-inflacion',
  'banxico-inflacion-subyacente', 'banxico-salario-minimo', 'banxico-inpc',
  'cre-gasolina-regular', 'banxico-pib-crecimiento', 'banxico-igae',
  'banxico-remesas', 'banxico-exports-total', 'banxico-imports-total',
  'banxico-imports-intermediate', 'banxico-trade-balance', 'fred-us-indpro',
  'banxico-spei-operaciones', 'banxico-spei-monto', 'banxico-codi-operaciones',
  'banxico-tpv-debito-ops', 'banxico-tpv-credito-ops', 'banxico-cajeros-ops',
  'banxico-ecommerce-ops', 'banxico-tarjetas-debito', 'banxico-tarjetas-credito',
  'banxico-circulante', 'banxico-ecommerce-monto',
].map(SERIES);

const CONTEXT = ['data/events.json', 'data/happening.json'];

// A required asset may still contain an old official observation. It may not be
// missing or malformed. Freshness is shown separately, never used to replace a
// valid last-good value with zero or a made-up fallback.
export const PAGE_DATA_CONTRACTS = {
  'Brief': [
    'data/health.json', 'data/brief.json', 'data/areas.json',
    'data/analysis/facts.json', ...CONTEXT, ...MONEY,
    SERIES('banxico-pib-crecimiento'), SERIES('banxico-igae'),
    SERIES('wb-gdp-usd'), SERIES('wb-population'), SERIES('wb-gdp-per-capita'),
  ],
  'Charts': CHARTS,
  'Economy & money': [
    'data/economy.json', ...CONTEXT, ...MONEY,
    SERIES('banxico-exports-total'), SERIES('banxico-imports-total'),
    'data/trade/exports-by-partner.json',
  ],
  'Payments': [...CONTEXT, ...PAYMENTS],
  'Trade': [
    ...CONTEXT,
    SERIES('banxico-exports-total'), SERIES('banxico-imports-total'),
    SERIES('banxico-trade-balance'), SERIES('banxico-exports-oil'),
    SERIES('banxico-exports-nonoil'), SERIES('banxico-exports-manufactures'),
    SERIES('banxico-imports-consumer'), SERIES('banxico-imports-intermediate'),
    SERIES('banxico-imports-capital'),
    'data/trade/exports-by-product.json', 'data/trade/exports-by-partner.json',
    'data/trade/exports-hs4.json', 'data/trade/regional.json',
  ],
  'Politics': CONTEXT,
  'Society & security': [
    ...CONTEXT, SERIES('banxico-salario-minimo'), SERIES('banxico-remesas'),
    SERIES('cre-gasolina-regular'), SERIES('wb-unemployment'),
    SERIES('wb-gdp-per-capita'), SERIES('wb-population'),
    'data/demographics.json', 'data/vitals.json',
  ],
  'U.S.–Mexico': [...CONTEXT, ...MONEY, 'data/trade-us.json', 'data/trade/exports-by-partner.json'],
  'Atlas': [
    'data/geo/estados.geojson', 'data/atlas-states.json',
    'data/meta/municipios.json', 'data/geo/municipios.topojson',
    'data/layers/coneval-pobreza.json',
  ],
  'Model': [
    SERIES('banxico-usdmxn-fix'), SERIES('banxico-inflacion'),
    SERIES('banxico-tasa-objetivo'), SERIES('banxico-pib-crecimiento'),
  ],
  'Sources': ['data/health.json'],
};

// These files are built by fetch-trade.js rather than the connector harness. They
// still carry provenance and are checked below, but do not appear in health.json.
export const BUILDER_OWNED_SERIES = new Set([
  'banxico-exports-manufactures', 'banxico-exports-nonoil', 'banxico-exports-oil',
  'banxico-exports-total', 'banxico-imports-capital', 'banxico-imports-consumer',
  'banxico-imports-intermediate', 'banxico-imports-total', 'banxico-trade-balance',
]);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const present = (value) => value !== undefined && value !== null && value !== '';
export const isSafeHttpUrl = (value) => {
  if (!present(value)) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol)
      && !url.username && !url.password
      && !/(?:^|[?&])(token|apikey|api_key|key)=/i.test(value);
  } catch { return false; }
};

const entityPass = (value) => value
  .replace(/&#x([0-9a-f]{1,6});?/gi, (all, hex) => {
    const point = Number.parseInt(hex, 16);
    return point <= 0x10ffff ? String.fromCodePoint(point) : all;
  })
  .replace(/&#([0-9]{1,7});?/g, (all, decimal) => {
    const point = Number.parseInt(decimal, 10);
    return point <= 0x10ffff ? String.fromCodePoint(point) : all;
  })
  .replace(/&(lt|gt|amp|tab|newline);/gi, (all, name) => ({
    lt: '<', gt: '>', amp: '&', tab: '\t', newline: '\n',
  }[name.toLowerCase()] || all))
  .replace(/%([0-9a-f]{2})/gi, (_, byte) => String.fromCharCode(Number.parseInt(byte, 16)));

function decodedForSafety(value) {
  let decoded = String(value);
  // Repeat so double-encoded input such as &amp;lt; or %253C cannot pass the
  // publication gate and become markup after a later decode.
  for (let pass = 0; pass < 4; pass += 1) {
    const next = entityPass(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

export function validateNarrativeText(value) {
  if (typeof value !== 'string' || !value.trim()) return ['must be a non-empty string'];
  const decoded = decodedForSafety(value);
  const errors = [];
  if (/[<>]/.test(decoded)) errors.push('contains or decodes to markup');
  if (/[\u0000-\u001f\u007f-\u009f]/.test(decoded)) errors.push('contains or decodes to control characters');
  return errors;
}

export function validateTopicAreasDocument(doc) {
  const errors = [];
  if (!isObject(doc?.meta) || !Array.isArray(doc?.areas)) return ['document needs meta and areas'];
  if (doc.areas.length !== PUBLIC_TOPIC_AREAS.length) {
    errors.push(`expected ${PUBLIC_TOPIC_AREAS.length} topics, found ${doc.areas.length}`);
  }
  PUBLIC_TOPIC_AREAS.forEach((expected, index) => {
    const actual = doc.areas[index];
    if (!actual) { errors.push(`missing topic ${expected.key} at position ${index + 1}`); return; }
    for (const field of ['key', 'label', 'href']) {
      if (actual[field] !== expected[field]) errors.push(`topic ${index + 1} ${field} is ${JSON.stringify(actual[field])}, expected ${JSON.stringify(expected[field])}`);
    }
  });
  return errors;
}

export function validPeriod(value) {
  const text = String(value || '');
  let match;
  if (/^\d{4}$/.test(text)) return true;
  if ((match = /^(\d{4})-(\d{2})$/.exec(text))) return Number(match[2]) >= 1 && Number(match[2]) <= 12;
  if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text))) {
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
  return false;
}

export function validateSeriesDocument(doc, expectedId, now = new Date()) {
  const errors = [];
  if (!isObject(doc)) return ['document is not an object'];
  if (!isObject(doc.meta)) errors.push('meta is missing');
  if (!Array.isArray(doc.data) || !doc.data.length) errors.push('data must be a non-empty array');
  if (errors.length) return errors;
  const required = ['id', 'title', 'metric', 'source', 'sourceUrl', 'license', 'units', 'cadence', 'track', 'kind', 'vintage', 'fetchedAt', 'rowCount', 'flags'];
  for (const key of required) if (!present(doc.meta[key]) && key !== 'flags') errors.push(`meta.${key} is missing`);
  if (!Array.isArray(doc.meta.flags)) errors.push('meta.flags must be an array');
  if (doc.meta.id !== expectedId) errors.push(`meta.id ${doc.meta.id} does not match ${expectedId}`);
  if (doc.meta.kind !== 'series') errors.push(`meta.kind must be series, got ${doc.meta.kind}`);
  if (!isSafeHttpUrl(doc.meta.sourceUrl)) errors.push('meta.sourceUrl is missing, invalid, or contains a secret');
  if (doc.meta.rowCount !== doc.data.length) errors.push(`meta.rowCount ${doc.meta.rowCount} does not match ${doc.data.length}`);
  const fetched = Date.parse(doc.meta.fetchedAt);
  if (!Number.isFinite(fetched)) errors.push('meta.fetchedAt is not an ISO date');
  else if (fetched > now.getTime() + 3_600_000) errors.push('meta.fetchedAt is in the future');
  let previous = null;
  const seen = new Set();
  let precision = null;
  for (let index = 0; index < doc.data.length; index += 1) {
    const point = doc.data[index];
    if (!isObject(point) || !validPeriod(point.date) || !Number.isFinite(point.value)) {
      errors.push(`data[${index}] must have a valid period and finite numeric value`);
      continue;
    }
    const thisPrecision = String(point.date).length;
    if (precision === null) precision = thisPrecision;
    else if (precision !== thisPrecision) errors.push('series mixes year, month, or day date precision');
    if (seen.has(point.date)) errors.push(`duplicate period ${point.date}`);
    if (previous !== null && point.date <= previous) errors.push(`periods are not strictly increasing at ${point.date}`);
    seen.add(point.date); previous = point.date;
  }
  const last = doc.data.at(-1)?.date;
  if (String(doc.meta.vintage) !== String(last)) errors.push(`meta.vintage ${doc.meta.vintage} does not match latest period ${last}`);
  return [...new Set(errors)];
}

export function validateLayerDocument(doc, expectedId, registryIds = null) {
  const errors = [];
  if (!isObject(doc?.meta) || !isObject(doc?.values)) return ['layer needs meta and values objects'];
  const required = ['id', 'title', 'metric', 'source', 'sourceUrl', 'license', 'units', 'cadence', 'track', 'kind', 'granularity', 'canonicalKey', 'vintage', 'fetchedAt', 'rowCount', 'flags'];
  for (const key of required) if (!present(doc.meta[key]) && key !== 'flags') errors.push(`meta.${key} is missing`);
  if (!Array.isArray(doc.meta.flags)) errors.push('meta.flags must be an array');
  if (doc.meta.id !== expectedId) errors.push(`meta.id ${doc.meta.id} does not match ${expectedId}`);
  if (doc.meta.kind !== 'layer') errors.push('meta.kind must be layer');
  if (doc.meta.canonicalKey !== 'cvegeo') errors.push('layer canonicalKey must be cvegeo');
  if (!isSafeHttpUrl(doc.meta.sourceUrl)) errors.push('meta.sourceUrl is missing, invalid, or contains a secret');
  const keys = Object.keys(doc.values);
  if (doc.meta.rowCount !== keys.length) errors.push(`meta.rowCount ${doc.meta.rowCount} does not match ${keys.length}`);
  for (const key of keys) {
    if (!/^\d{5}$/.test(key)) errors.push(`invalid CVEGEO ${key}`);
    const value = doc.values[key];
    if (value !== null && !Number.isFinite(value)) errors.push(`value for ${key} is not finite or null`);
    if (registryIds && !registryIds.has(key)) errors.push(`CVEGEO ${key} is not in the municipality registry`);
  }
  return [...new Set(errors)];
}

export function validateHealthDocument(health, servedById = new Map()) {
  const errors = [];
  if (!isObject(health) || !Array.isArray(health.sources) || !isObject(health.summary)) return ['health needs summary and sources'];
  if (!Number.isFinite(Date.parse(health.generatedAt))) errors.push('generatedAt is invalid');
  const allowed = new Set(['ok', 'ok_flagged', 'failed', 'skipped']);
  const seen = new Set();
  for (const source of health.sources) {
    if (!source?.id || seen.has(source.id)) errors.push(`duplicate or missing source id ${source?.id || '?'}`);
    seen.add(source?.id);
    if (!allowed.has(source.status)) errors.push(`${source.id}: invalid status ${source.status}`);
    if (source.status === 'ok' && source.flags?.length) errors.push(`${source.id}: ok source still has flags`);
    if (source.status === 'ok_flagged' && !source.flags?.length) errors.push(`${source.id}: flagged source has no flags`);
    if (source.status === 'failed' && !source.message) errors.push(`${source.id}: failed source has no message`);
    const served = servedById.get(source.id);
    if (['ok', 'ok_flagged'].includes(source.status)) {
      if (!served) errors.push(`${source.id}: successful source has no served file`);
      else if (String(served.meta?.vintage) !== String(source.vintage)) errors.push(`${source.id}: health vintage differs from served file`);
    }
    if (source.status === 'failed' && served) {
      if (source.stale) errors.push(`${source.id}: marked dark even though last-good exists`);
      if (String(source.servingVintage) !== String(served.meta?.vintage)) errors.push(`${source.id}: servingVintage differs from last-good`);
    }
  }
  const actual = {
    ok: health.sources.filter((source) => source.status === 'ok').length,
    flagged: health.sources.filter((source) => source.status === 'ok_flagged').length,
    failed: health.sources.filter((source) => source.status === 'failed').length,
    skipped: health.sources.filter((source) => source.status === 'skipped').length,
    darkSources: health.sources.filter((source) => source.status === 'failed' && source.stale).map((source) => source.id).sort(),
  };
  for (const key of ['ok', 'flagged', 'failed', 'skipped']) if (health.summary[key] !== actual[key]) errors.push(`summary.${key} is ${health.summary[key]}, expected ${actual[key]}`);
  const reportedDark = [...(health.summary.darkSources || [])].sort();
  if (JSON.stringify(reportedDark) !== JSON.stringify(actual.darkSources)) errors.push('summary.darkSources does not match failed sources without last-good');
  return errors;
}

export function validateHs4Hierarchy(detail, parents) {
  const errors = [];
  if (!isObject(detail?.byChapter) || !Array.isArray(parents?.items)) return ['HS4 detail or HS2 parents are missing'];
  const parentValues = new Map(parents.items.map((item) => [String(item.code).padStart(2, '0'), Number(item.value)]));
  if (Number(detail.year || detail.referenceYear) !== Number(parents.year || parents.referenceYear)) errors.push('HS4 and HS2 reference years differ');
  if (Math.abs(Number(detail.total) - Number(parents.total)) / Number(parents.total) > 0.0005) errors.push('HS4 and HS2 grand totals differ');
  for (const [chapter, children] of Object.entries(detail.byChapter)) {
    const parent = parentValues.get(String(chapter).padStart(2, '0'));
    if (!Number.isFinite(parent) || parent <= 0) { errors.push(`chapter ${chapter} has no positive HS2 parent`); continue; }
    if (!Array.isArray(children) || !children.length) { errors.push(`chapter ${chapter} has no children`); continue; }
    const total = children.reduce((sum, child) => sum + Number(child.value || 0), 0);
    if (children.some((child) => !Number.isFinite(child.value) || child.value < 0)) errors.push(`chapter ${chapter} has an invalid child value`);
    if (total > parent * 1.005) errors.push(`chapter ${chapter} children exceed parent by ${((total / parent - 1) * 100).toFixed(1)}%`);
    for (const child of children) {
      const expected = child.value / parent * 100;
      if (!Number.isFinite(child.shareParent) || Math.abs(child.shareParent - expected) > 0.11) errors.push(`chapter ${chapter} child ${child.code} has an incorrect parent share`);
    }
  }
  return errors;
}

export function assetId(file) { return path.basename(file, '.json'); }
