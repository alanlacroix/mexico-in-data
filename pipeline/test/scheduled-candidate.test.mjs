import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { linkScheduledCandidate } = require('../lib/scheduled-candidate.cjs');
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

console.log('scheduled-candidate tests: ok');
