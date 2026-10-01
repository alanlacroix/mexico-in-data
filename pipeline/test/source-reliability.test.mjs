import assert from 'node:assert/strict';
import registry from '../news-sources.json' with { type: 'json' };
import {
  cleanNewsText, editorialSourceTier, eventCandidateEligible, mexicoRelevant,
  normalizeSourceTier, registeredSourceFor, stripNewsBoilerplate,
} from '../lib/news-trust.js';

assert.equal(normalizeSourceTier('1'), 1);
assert.equal(normalizeSourceTier('2'), 2);
assert.equal(normalizeSourceTier(1), 1);
assert.equal(normalizeSourceTier('specialist'), 'specialist');
assert.equal(editorialSourceTier('2'), true, 'legacy string-number tiers remain eligible');
assert.equal(editorialSourceTier('aggregator'), false, 'aggregation is discovery-only');
assert.equal(editorialSourceTier('unknown'), false, 'unknown metadata never becomes eligible');

const direct = registeredSourceFor({
  sourceId: 'el-economista', sourceName: 'El Economista', url: 'https://www.eleconomista.com.mx/mercados/x',
}, registry.sources);
assert.equal(direct?.id, 'el-economista');
const legacyDirect = registeredSourceFor({
  sourceName: 'El Economista', url: 'https://www.eleconomista.com.mx/mercados/x',
}, registry.sources);
assert.equal(legacyDirect?.id, 'el-economista', 'legacy direct articles resolve by configured publisher host');
const legacyAggregator = registeredSourceFor({
  sourceName: 'El Economista', url: 'https://news.google.com/rss/articles/x',
}, registry.sources);
assert.equal(legacyAggregator?.id, 'gnews-eleconomista', 'duplicate publisher names do not collapse to the direct feed');
assert.equal(eventCandidateEligible({
  sourceId: 'el-economista', sourceName: 'El Economista', url: 'https://www.eleconomista.com.mx/opinion/x',
}, registry.sources), false, 'stable IDs do not weaken the opinion exclusion');

// Oct 1's top candidate was entirely about Brazil. Its finance ministry must
// not supply the Mexico connection just because it is called Hacienda.
const brazilBlocking = 'Brasil pide bloquear 5,200 sitios tras prohibir las casas de apuestas. La prohibición de las casas de apuestas en Brasil ya se convirtió en una operación de bloqueo masivo en Internet. El Ministerio de Justicia y Seguridad Pública y el Ministerio de Hacienda habían solicitado el bloqueo de 5,209 dominios.';
assert.equal(mexicoRelevant(brazilBlocking), false);
for (const text of [
  'El Ministerio de Hacienda de Colombia aprueba una reforma.',
  'Remittances to Guatemala grew after a strong quarter.',
  'Costa Rica attracts nearshoring investment.',
  'El peso argentino sube frente al dólar. El tipo de cambio mejora.',
  'The minister sat with business leaders in Brazil.',
]) assert.equal(mexicoRelevant(text), false, `generic topic words must not imply Mexico: ${text}`);

for (const text of [
  `${brazilBlocking} La medida también afectará a operadores mexicanos.`,
  'Brasil firma un acuerdo comercial con México.',
  'China abre su mercado a las exportaciones mexicanas.',
  'Estados Unidos modifica las reglas del T-MEC.',
  'Hacienda ve manejable el nivel de deuda de México.',
  'La SHCP presenta el paquete económico.',
  'La Secretaría de Hacienda y Crédito Público publica el informe.',
  'SAT deja de recaudar por estímulos al IEPS.',
  'Banxico mantiene su tasa de interés.',
  'Pemex reduce compras de diésel.',
  'El tipo de cambio USD/MXN registra una caída.',
  'Las remesas recibidas en México aumentan.',
]) assert.equal(mexicoRelevant(text), true, `retain a genuine Mexico connection: ${text}`);

const cfeDek = 'Trabajadores de CFE denuncian usurpación de plazas y nepotismo.';
for (const footer of [
  'La publicación CFE: plazas pirata apareció primero en EL CEO .',
  'El artículo CFE: plazas pirata apareció primero en EL CEO .',
  'La entrada CFE: plazas pirata apareció primero en EL CEO .',
  'The post CFE: plazas pirata appeared first on EL CEO .',
]) assert.equal(stripNewsBoilerplate(`${cfeDek} ${footer}`), cfeDek);
assert.equal(cleanNewsText(`<p>${cfeDek}</p><p>La publicaci&oacute;n CFE: plazas pirata apareci&oacute; primero en EL CEO .</p>`), cfeDek,
  'collection removes decoded HTML boilerplate before truncating the dek');
assert.equal(stripNewsBoilerplate('La publicación del decreto fija nuevas reglas.'), 'La publicación del decreto fija nuevas reglas.',
  'actual reporting about a publication is preserved');
assert.equal(mexicoRelevant('Brasil aprueba una regla. The post Brasil aprueba una regla appeared first on Mexico Business News.'), false,
  'publisher branding in a footer must not create a Mexico connection');

console.log('source reliability: ok');
