import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import dailyBrief from '../../_data/dailyBrief.js';

const candidate = JSON.parse(fs.readFileSync(new URL('../../docs/pilot/candidate-2026-09-22.json', import.meta.url), 'utf8'));
const spanish = dailyBrief(new Date(candidate.generatedAt), { edition: candidate }, 'es');
assert.equal(spanish.stories[0].title, candidate.stories[0].es.headline);
assert.equal(spanish.stories[0].bg, candidate.stories[0].es.background);
assert.equal(spanish.stories[0].prediction, candidate.stories[0].es.watch);
assert.doesNotMatch(spanish.stories[0].prediction, /Mexico's statistics agency|monthly economic activity index/);

const html = fs.readFileSync(new URL('../../_site/index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1])
  .find(value => value.includes('var published ='));
assert.ok(script, 'built page must include a reader-clock freshness check');
function isDelayed(editionDate, now) {
  const alertBox = { hidden: false };
  const published = { getAttribute: () => `${editionDate}T13:00:00Z`, textContent: '' };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  vm.runInNewContext(script.replace(/alertBox.hidden = "[\d-]+" >=/, `alertBox.hidden = "${editionDate}" >=`), {
    Date: Clock, Intl, document: {
      querySelector: () => published, getElementById: () => alertBox,
    },
  });
  return !alertBox.hidden;
}
assert.equal(isDelayed('2026-09-18', '2026-09-20T18:00:00Z'), false, 'Friday remains valid over weekend');
assert.equal(isDelayed('2026-09-18', '2026-09-21T12:59:00Z'), false, 'Monday before Mexico City deadline');
assert.equal(isDelayed('2026-09-18', '2026-09-21T13:00:00Z'), true, 'Monday deadline marks old edition delayed');
assert.equal(isDelayed('2026-09-21', '2026-09-21T18:00:00Z'), false);
assert.equal(isDelayed('2026-09-07', '2026-09-22T18:00:00Z'), true, 'frozen page still reveals staleness');
console.log('brief presentation: ok');
