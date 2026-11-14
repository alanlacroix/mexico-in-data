// Narrow source-to-subject checks for the verified monthly INEGI bulletin.
// Numeric-token presence and bilingual equality do not establish which item a
// percentage describes. These checks supplement, never replace, the full audit.
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const NUMBER = '-?\\d+(?:[.,]\\d+)?';
const numeric = value => Number(value.replace(',', '.'));
const products = [
  { name: 'jitomate', source: 'jitomate', aliases: 'jitomates?|red tomatoes?' },
  { name: 'tomate verde', source: 'tomate verde', aliases: 'tomates? verdes?|green tomatoes?|tomatillos?' },
];
// Called only after the adapter validates the complete official document. The
// builder receives these facts through its private item binding, not from model
// output, URL resemblance, or a serialized evidence record.
export function extractMonthlyProductRates(text, period) {
  const source = fold(text);
  const table = source.match(/cuadro 2 variacion de productos genericos con mayor incidencia en el indice nacional de precios al consumidor ([a-z]+ de \d{4}) \(variacion y puntos porcentuales\)([\s\S]*?)(?:1\/ la incidencia|boletin de indicador)/);
  const body = table && table[1] === period && /variacion % mensual incidencia mensual/.test(table[2]) ? table[2] : '';
  return Object.freeze(Object.fromEntries(products.map(product => {
    const rates = [...new Set([...body.matchAll(new RegExp(`\\b${product.source}\\s+(${NUMBER})\\s+${NUMBER}\\b`, 'g'))].map(match => numeric(match[1])))];
    return [product.name, rates.length === 1 ? rates[0] : null];
  })));
}
export function inegiCpiClaimFlags(text, facts) {
  if (!facts) return [];
  const claim = fold(text);
  const flags = [];
  for (const product of products) {
    const rate = facts.productMonthlyRates[product.name];
    // Check only explicit product -> movement -> percentage statements. Do not
    // attach a percentage across another named product or a coordinated clause.
    const movement = '(?:rose|rise|risen|fell|fall|increase[ds]?|decrease[ds]?|soared|jumped|climbed|subi[oae]|subieron|aumento|aumentaron|crecio|crecieron|dispararon|cayo|cayeron|bajo|bajaron)';
    // Only an adjacent rate complement, never arbitrary intervening prose. This
    // deliberately leaves other grammar to independent review rather than bind
    // another clause's subject/rate ("rose as annual inflation reached 3.75%").
    const pattern = new RegExp(`\\b(?:${product.aliases})\\b(?:\\s+(?:prices?|frescos?))?\\s+(?:se\\s+)?${movement}\\s+(?:(?:by|un|en|en un)\\s+)?(${NUMBER})\\s*(?:%|por ciento|percent\\b)`, 'g');
    for (const match of claim.matchAll(pattern)) {
      const prefix = claim.slice(Math.max(0, match.index - 80), match.index);
      if (/\b(?:jitomates?|red tomatoes?|tomates? verdes?|green tomatoes?|tomatillos?)\s+(?:and|y|or|o)\s+(?:(?:el|los|the)\s+)?$/.test(prefix)) continue;
      if (!Number.isFinite(rate) || numeric(match[1]) !== rate) {
        flags.push(`${product.name} percentage does not match its source table row`);
      }
    }
  }
  return [...new Set(flags)];
}
