import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { dueScheduledRows, linkScheduledCandidate, missingScheduledRows, seedScheduledCandidate } = require('../lib/scheduled-candidate.cjs');
const schedule = [{
  id: 'banxico-policy-2026-08-06',
  date: '2026-08-06',
  approx: false,
  outcomeRequired: true,
  requiredForBrief: true,
  importanceFloor: 8,
  label: 'Banxico monetary-policy decision',
  outcome: { actor: 'banxico', topic: 'policy-rate' },
}];

const hold = {
  title: 'Banxico deja la tasa de interés sin cambios en 6.50%',
  dek: 'La Junta de Gobierno mantuvo la tasa objetivo.',
  published_at: '2026-08-06T19:40:22Z',
};
assert.equal(linkScheduledCandidate(hold, schedule, '2026-08-06')?.id, schedule[0].id,
  'an exact-day rate outcome must receive the stable scheduled id');
assert.equal(linkScheduledCandidate({
  title: 'Banxico and the Federal Reserve may take different paths on interest rates',
  published_at: '2026-08-07T12:00:00Z',
}, schedule, '2026-08-07'), null, 'next-day commentary must not close the prior decision');
assert.equal(linkScheduledCandidate({
  title: 'Banxico publishes a payments report',
  published_at: '2026-08-06T15:00:00Z',
}, schedule, '2026-08-06'), null, 'the institution alone must not create a match');
assert.equal(linkScheduledCandidate({
  title: 'Analysts expect Banxico to hold its policy rate',
  published_at: '2026-08-05T15:00:00Z',
}, schedule, '2026-08-05'), null, 'a pre-decision forecast must not close the event');
assert.equal(linkScheduledCandidate({
  title: 'Analysts expect Banxico to hold its benchmark interest rate',
  published_at: '2026-08-06T13:00:00Z',
}, schedule, '2026-08-06'), null, 'an event-day forecast must not masquerade as the observed decision');
for (const title of [
  'Analysts expect Banxico will maintain its benchmark interest rate',
  'Markets forecast Banxico keeps its benchmark interest rate unchanged',
  'Banxico may cut its benchmark rate after it maintained policy in May',
]) {
  assert.equal(linkScheduledCandidate({ title, published_at: '2026-08-06T13:00:00Z' }, schedule, '2026-08-06'), null,
    `forecast language must not close the obligation: ${title}`);
}
assert.equal(linkScheduledCandidate({
  title: 'Banxico holds its benchmark interest rate unchanged, as expected',
  published_at: '2026-08-06T19:40:00Z',
}, schedule, '2026-08-06')?.id, schedule[0].id, 'a reported outcome may note afterward that it was expected');

const releases = [{
  id: 'inegi-cpi-2026-08-07',
  date: '2026-08-07',
  outcomeRequired: true,
  requiredForBrief: true,
  importanceFloor: 7,
  label: 'INEGI CPI monthly release',
  outcome: { actor: 'inegi', topic: 'inflation', actorMayBeImplicit: true },
}];
assert.equal(linkScheduledCandidate({
  title: 'La inflación en México desaceleró a 3.12% en julio',
  sourceName: 'El Economista',
  published_at: '2026-08-07T13:15:39Z',
}, releases, '2026-08-07')?.id, releases[0].id,
'a national release may use the configured implicit-actor rule when topic, outcome and exact date all match');
assert.equal(linkScheduledCandidate({
  title: 'Inflation slowed in Brazil in July',
  sourceName: 'El Economista',
  published_at: '2026-08-07T13:15:39Z',
}, releases, '2026-08-07'), null, 'implicit actor matching must remain scoped to Mexico');

const seeded = seedScheduledCandidate({ ...schedule[0], source: 'Banco de México', sourceUrl: 'https://www.banxico.org.mx/decisiones' },
  '06/08/26 | El objetivo para la tasa de interés de Banco de México se mantiene sin cambio en 6.50 por ciento Texto completo');
assert.equal(seeded?._scheduled?.id, schedule[0].id,
  'a due outcome absent from RSS must be seeded from its dated official page');
assert.equal(seedScheduledCandidate({ ...schedule[0], source: 'Banco de México', sourceUrl: 'https://www.banxico.org.mx/decisiones' },
  '25/06/26 | El objetivo para la tasa de interés de Banco de México se mantiene sin cambio en 6.50 por ciento'), null,
  'an old outcome on the same official page must not satisfy today');
assert.deepEqual(dueScheduledRows({ events: schedule }, '2026-08-06'), schedule);
assert.deepEqual(missingScheduledRows(schedule, []), schedule,
  'a failed or stale official fetch must leave the required outcome unresolved');
assert.deepEqual(missingScheduledRows(schedule, [seeded]), [],
  'a dated official seed satisfies the required outcome');

const informe = {
  id: 'presidential-informe-2026-09-01', date: '2026-09-01', outcomeRequired: true,
  requiredForBrief: true, importanceFloor: 7, label: 'Segundo Informe de Gobierno',
  source: 'Presidencia de la República', sourceUrl: 'https://www.gob.mx/presidencia/archivo/articulos',
  outcome: { actor: 'presidency', topic: 'state-of-nation' },
};
assert.equal(seedScheduledCandidate(informe,
  'martes, 01 de septiembre de 2026 Versión estenográfica. Segundo Informe de Gobierno de la presidenta Claudia Sheinbaum Pardo')?._scheduled?.id,
informe.id, 'an official dated state-of-the-nation page must seed the due outcome');
assert.equal(seedScheduledCandidate(informe,
  'martes, 01 de septiembre de 2026 ¿A qué hora es el Segundo Informe de Gobierno de la presidenta Claudia Sheinbaum Pardo?'),
null, 'an event-day preview or where-to-watch item must not satisfy the required outcome');
assert.equal(seedScheduledCandidate(informe,
  'miércoles, 02 de septiembre de 2026 conferencia. martes, 01 de septiembre de 2026 Fecha de publicación Versión estenográfica. Segundo Informe de Gobierno de la presidenta Claudia Sheinbaum Pardo Continuar leyendo. En otra nota, analistas esperan un cambio futuro.')?._scheduled?.id,
informe.id, 'un unrelated forecast elsewhere on an archive page must not hide the dated official outcome');

console.log('scheduled-candidate tests: ok');
