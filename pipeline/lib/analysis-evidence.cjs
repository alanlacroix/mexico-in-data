'use strict';

// Auxiliary evidence is eligible only when it shares a named subject-matter concept
// with the story. Broad sections and ordinary prose overlap may rank a real connection,
// but they can never create one. This prevents an "economy" card from inheriting the
// federal budget, a political calendar, or another unrelated economy story.
const GENERIC = new Set([
  'about', 'after', 'against', 'also', 'before', 'between', 'could', 'during',
  'from', 'government', 'into', 'market', 'mexican', 'mexico', 'more', 'most',
  'private', 'report', 'sector', 'said', 'says', 'than', 'that', 'their', 'them', 'these', 'this',
  'through', 'under', 'were', 'while', 'with', 'would', 'year', 'years',
]);

const clean = (value) => String(value || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function meaningfulTokens(value) {
  return new Set(clean(value).split(' ')
    .filter((word) => word.length > 3 && !/^\d/.test(word) && !GENERIC.has(word)));
}

function tokenOverlap(left, right) {
  const a = meaningfulTokens(left);
  const b = meaningfulTokens(right);
  let score = 0;
  for (const word of a) if (b.has(word)) score++;
  return score;
}

const recordText = (record) => (record && typeof record === 'object')
  ? `${record.title || record.label || ''} ${record.why || record.mechanism || record.fact || ''} ${record.kind || ''}`
  : String(record || '');

const CONCEPT_RULES = [
  ['electricity-grid', /\b(?:cfe|electricity|electr(?:ic|ical) (?:utility|grid|system|power|generation)|power (?:grid|system|utility)|grid (?:capacity|connection)|generation capacity)\b/i],
  ['goods-exports', /\b(?:goods|merchandise|mexican) exports?\b|\bexportaciones mexicanas\b/i],
  ['trade-agreement', /\b(?:usmca|t-?mec|trade agreement|rules? of origin)\b/i],
  ['auto-tariff', /\b(?:auto|automotive|automotriz|cars?|vehicles?|suzuki)\b[\s\S]{0,80}\b(?:tariff|arancel|duty)\b|\b(?:tariff|arancel|duty)\b[\s\S]{0,80}\b(?:auto|automotive|automotriz|cars?|vehicles?|suzuki)\b/i],
  ['china-inputs', /\bchina\b[\s\S]{0,80}\b(?:imports?|inputs?|components?)\b/i],
  ['foreign-direct-investment', /\b(?:foreign direct investment|fdi|inversion extranjera directa)\b/i],
  // A company's physical investment announcement can use the official fixed-
  // investment series as context. A financial fund or portfolio cannot: both an
  // investment verb and a physical operating purpose are required.
  ['physical-investment', /\b(?:invest(?:s|ed|ing|ment)|inversion(?:es)?)\b[\s\S]{0,120}\b(?:plant|factory|facilit|capacity|cement|circular economy|economia circular)\w*\b|\b(?:plant|factory|facilit|capacity|cement|circular economy|economia circular)\w*\b[\s\S]{0,120}\b(?:invest(?:s|ed|ing|ment)|inversion(?:es)?)\b/i],
  ['economic-growth', /\b(?:gdp|economic (?:growth|activity)|growth forecast|producto interno bruto|igae)\b/i],
  ['fixed-investment', /\b(?:fixed investment|gross fixed capital|inversion fija)\b/i],
  ['private-credit', /\b(?:bank credit|private credit|business lending|credito bancario)\b/i],
  ['stock-market', /\b(?:stock market|listed market|equity market|bmv|ipc index)\b/i],
  ['cetes', /\b(?:cetes?|mexican treasury bills?|28 day yield)\b/i],
  ['us-treasury-yield', /\b(?:us 10 year|u s 10 year|treasury yield|rate gap)\b/i],
  ['inflation', /\b(?:inflation|consumer prices?|headline prices?|core prices?|inpc)\b/i],
  ['policy-rate', /\b(?:policy rate|overnight rate|interest-rate decision|banxico (?:decision|holds?|cuts?|raises?))\b/i],
  ['peso-exchange', /\b(?:peso|exchange rate|mxn)\b/i],
  ['remittances', /\b(?:remittances?|remesas)\b/i],
  ['public-debt', /\b(?:public debt|sovereign debt|debt ceiling|deficit)\b/i],
  ['federal-budget', /\b(?:federal budget|budget package|paquete economico|revenue and spending|presupuesto de egresos|ley de ingresos)\b/i],
  ['pemex-support', /\bpemex\b[\s\S]{0,100}\b(?:support|debt|refinanc|tax relief|sovereign)\b/i],
  ['pemex-operations', /\bpemex\b[\s\S]{0,100}\b(?:production|processing|refin|flaring|operating)\b/i],
  ['telecom-spectrum', /\b(?:spectrum|telecommunications regulator|telecom auction)\b/i],
  ['constitutional-power', /\b(?:constitutional reform|amend the constitution|two thirds congress)\b/i],
  ['presidential-informe', /\b(?:informe de gobierno|state of the nation|presidential report)\b/i],
  ['judiciary', /\b(?:judicial reform|judiciary|supreme court|court election)\b/i],
  ['security', /\b(?:homicides?|extortion|cargo theft|violent crime|cartel|security strategy)\b/i],
  ['labor-informality', /\b(?:informal employment|informality|informal workers?)\b/i],
  ['labor-market', /\b(?:employment|unemployment|labor market|enoe)\b/i],
  ['wages', /\b(?:minimum wage|real wages?)\b/i],
  ['poverty', /\b(?:poverty|social security access|health service access)\b/i],
  ['demographics', /\b(?:fertility|births per woman|aging|ageing)\b/i],
  ['migration', /\b(?:migration|migrants?|emigration|deportation|border enforcement)\b/i],
  ['regional-economy', /\b(?:regional divide|north south|bajio|gdp per resident)\b/i],
  ['economic-structure', /\b(?:services economy|manufacturing share|economic structure)\b/i],
  ['payments', /\b(?:(?:digital|card|bank|interbank|instant|qr|contactless) payments?|payment (?:system|rail|network)|spei|codi|fintech|cashless)\b/i],
  ['water', /\b(?:water system|water supply|water plan|conagua)\b/i],
];

const ID_CONCEPTS = {
  'std-us-dependence': ['goods-exports'],
  'std-usmca-review': ['trade-agreement'],
  'std-trade-volume': ['goods-exports'],
  'std-china-inputs': ['china-inputs'],
  'std-fdi-composition': ['foreign-direct-investment'],
  'std-weak-growth': ['economic-growth'],
  'std-investment-rate': ['fixed-investment', 'physical-investment'],
  'std-bank-credit': ['private-credit'],
  'std-stock-market': ['stock-market'],
  'std-inflation-target': ['inflation', 'policy-rate'],
  'std-peso-mechanics': ['peso-exchange'],
  'std-remittances': ['remittances'],
  'std-fiscal-path': ['public-debt', 'federal-budget'],
  'std-fiscal-pemex': ['pemex-support'],
  'std-pemex-filings': ['pemex-operations'],
  'std-spectrum-auctions': ['telecom-spectrum'],
  'std-energy-constraint': ['electricity-grid'],
  'std-political-system': ['constitutional-power', 'presidential-informe'],
  'std-judicial-reform': ['judiciary'],
  'std-security-measures': ['security'],
  'std-informal-economy': ['labor-informality'],
  'std-wages-poverty': ['wages', 'poverty'],
  'std-demographics': ['demographics'],
  'std-migration': ['migration'],
  'std-regional-divide': ['regional-economy'],
  'std-economy-shape': ['economic-structure'],
  'std-payments-system': ['payments'],
  'number:banxico-usdmxn-fix': ['peso-exchange'],
  'number:banxico-cetes-28d': ['cetes'],
  'number:banxico-bmv-ipc': ['stock-market'],
  'number:fred-ust10': ['us-treasury-yield'],
  'number:banxico-exports-total': ['goods-exports'],
  'number:banxico-inflacion': ['inflation'],
  'number:banxico-tasa-objetivo': ['policy-rate'],
  'number:banxico-remesas': ['remittances'],
};

function concepts(record = {}) {
  const mapped = ID_CONCEPTS[String(record.id || '')];
  // Standing facts are curated records with one declared purpose. Incidental words in
  // their prose (for example, "electricity" inside the fiscal-path fact) must not give
  // them a second identity and route them into an unrelated story.
  if (mapped) return new Set(mapped);
  const found = new Set();
  const text = recordText(record);
  for (const [name, match] of CONCEPT_RULES) if (match.test(text)) found.add(name);
  return found;
}

function connection(left, right) {
  const leftConcepts = concepts(left);
  const rightConcepts = concepts(right);
  const shared = [...leftConcepts].filter((name) => rightConcepts.has(name));
  return { eligible: shared.length > 0, shared, overlap: tokenOverlap(recordText(left), recordText(right)) };
}

function standingScore(event, fact) {
  const match = connection(event, fact);
  return match.eligible ? match.shared.length * 10 + match.overlap : 0;
}

function calendarScore(event, item) {
  const match = connection(event, item);
  return match.eligible ? match.shared.length * 5 + match.overlap : 0;
}

function relatedEventScore(event, related) {
  const match = connection(event, related);
  // Prior events are safe context only for a repeatable named series/institutional
  // thread. A generic tariff concept is directional (who imposed it on whose goods),
  // so it cannot connect two stories by itself.
  const repeatable = new Set(['electricity-grid', 'goods-exports', 'trade-agreement',
    'foreign-direct-investment', 'economic-growth', 'fixed-investment', 'private-credit',
    'stock-market', 'inflation', 'policy-rate', 'peso-exchange', 'remittances', 'public-debt',
    'federal-budget', 'pemex-support', 'pemex-operations', 'telecom-spectrum', 'judiciary',
    'labor-informality', 'labor-market', 'wages', 'poverty', 'demographics', 'migration',
    'regional-economy', 'payments', 'water']);
  const shared = match.shared.filter((concept) => repeatable.has(concept));
  if (!shared.length) return 0;
  return shared.length * 5 + match.overlap + (event.section === related.section ? 1 : 0);
}

module.exports = {
  calendarScore,
  concepts,
  meaningfulTokens,
  relatedEventScore,
  standingScore,
  tokenOverlap,
};
