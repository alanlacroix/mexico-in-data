import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inegiCpiClaimFlags, extractMonthlyProductRates } from '../lib/inegi-cpi-claims.mjs';
import { extractInegiPdf, createInegiMonthlyLoader, INEGI_NEWS_URL, validatedInegiClaimFacts } from '../lib/inegi-monthly-cpi.mjs';
import { deterministicDraftCheck } from '../build-edition.mjs';
const pages = await extractInegiPdf(new Uint8Array(fs.readFileSync(new URL('fixtures/inegi-inpc-october-2026.pdf', import.meta.url))));
const article = { id: 'article', kind: 'article-body', url: 'https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2026/inpc/inpc_2q2026_11.pdf', text: pages.join('\n\n') };
const row = JSON.parse(fs.readFileSync(new URL('../../data/events.json', import.meta.url))).events.find(row => row.id === 'inegi-cpi-2026-11-09');
const item = await createInegiMonthlyLoader({ now: new Date('2026-11-14T12:00:00Z'),
  fetchBytes: async url => ({url, body: new Uint8Array(fs.readFileSync(new URL(`fixtures/${url === INEGI_NEWS_URL ? 'inegi-inpc-october-2026.json' : 'inegi-inpc-october-2026.pdf'}`, import.meta.url)))}),
  extractPdf: async () => pages,
})(row);
assert.ok(item);
const facts = validatedInegiClaimFacts(item);
assert.deepEqual(facts.productMonthlyRates, {jitomate: 9.68, 'tomate verde': 35.58});
assert.equal(validatedInegiClaimFacts({...item}), null, 'serialized or forged item cannot supply trusted facts');
const flags = text => inegiCpiClaimFlags(text, facts);
const fromText = text => ({productMonthlyRates: extractMonthlyProductRates(text, 'octubre de 2026')});
const rejected = 'Los consumidores enfrentan costos crecientes de electricidad, transporte y algunos productos frescos. Los precios de jitomate fresco se dispararon 35.58% y el jitomate subió 9.68%, compensados por caídas en paquetes de internet, papas y cítricos.';
assert.deepEqual(flags(rejected), ['jitomate percentage does not match its source table row']);
for (const text of [
  'Jitomate rose 9.68%.', 'Los precios de jitomate subieron 9,68 por ciento.',
  'Tomate verde rose 35.58%.', 'Tomatillos increased 35.58 percent.',
  'Red tomatoes rose 9.68% and green tomatoes rose 35.58%.',
  'Los precios de jitomate subieron 9.68% y el tomate verde subió 35.58%.',
  'Jitomate prices rose as annual inflation reached 3.75%.',
  'Los precios de jitomate subieron cuando la inflación anual alcanzó 3.75%.',
  'Jitomate prices rose, with headline inflation at 3.75%.',
  'Jitomate did not rise 35.58%.', 'El jitomate no subió 35.58%.',
  'Jitomate and tomatillos rose 9.68% and 35.58%, respectively.',
  'El jitomate y el tomate verde subieron 9.68% y 35.58%, respectivamente.',
]) assert.deepEqual(flags(text), [], text);
for (const text of ['Jitomate rose 35.58%.', 'Tomatillos increased 9.68%.', 'El tomate verde subió 9.68%.', 'Red tomatoes rose 35.58%.']) assert.equal(flags(text).length, 1, text);
// Different monthly rows derive different rates; no November value is hardcoded.
const changed = { ...article, text: article.text.replace('Jitomate 9.68', 'Jitomate 8.10') };
assert.equal(inegiCpiClaimFlags('Jitomate rose 9.68%.', fromText(changed.text)).length, 1);
assert.deepEqual(inegiCpiClaimFlags('Jitomate rose 8.10%.', fromText(changed.text)), []);
// A missing or conflicting table row cannot substantiate a named-rate assertion.
for (const text of [article.text.replace('Jitomate 9.68', 'Otro producto 9.68'), article.text.replace('Jitomate 9.68', 'Jitomate 1.00 0.100 Jitomate 9.68')]) assert.equal(inegiCpiClaimFlags('Jitomate rose 9.68%.', fromText(text)).length, 1);
assert.deepEqual(inegiCpiClaimFlags(rejected, null), []);
assert.deepEqual(extractMonthlyProductRates(article.text, 'septiembre de 2026'), {jitomate:null, 'tomate verde':null}, 'wrong reference period cannot supply rates');
assert.deepEqual(extractMonthlyProductRates(article.text.replaceAll('Variación % mensual', 'Variación % anual'), 'octubre de 2026'), {jitomate:null, 'tomate verde':null}, 'wrong metric header cannot supply monthly rates');
assert.ok(Object.isFrozen(facts) && Object.isFrozen(facts.productMonthlyRates));
// The real deterministic boundary rejects the retained field even if a later
// model would return a blanket true. All ordinary gates remain in force.
const draft = { view: 'Fresh tomato prices soared 35.58% and jitomate rose 9.68%.', viewRefs: ['article'], es: { view: rejected } };
assert.ok(deterministicDraftCheck({ item, evidence: [article] }, draft).includes('view: jitomate percentage does not match its source table row'));
item.url += '?forged=1';
assert.equal(validatedInegiClaimFacts(item), null, 'identity mutation invalidates trusted facts');
console.log('INEGI CPI named-rate binding: ok');
