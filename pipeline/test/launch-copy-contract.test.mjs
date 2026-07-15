import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const text = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(text(file));
const home = text('index.njk');
const topics = text('topic-pages.njk');
const model = text('model.njk');
const brief = json('data/brief.json');
const latestSeriesValue = (id) => json(`data/series/${id}.json`).data
  .filter((row) => row?.value != null && Number.isFinite(Number(row.value)))
  .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  .at(-1).value;

assert.doesNotMatch(home, /New to Mexico: the basics/i,
  'homepage should not restore the removed introductory primer');
assert.match(home, /#tablero \.tile \.tb\{min-height:1\.4em;visibility:hidden\}/,
  'number cards should reserve the benchmark row so their dividers align');
assert.doesNotMatch(home, /the real policy rate/i, 'current inflation subtraction must not be labeled a real policy rate');
assert.match(home, /policy rate is .* percentage points above current core inflation/i,
  'homepage should name the rate-minus-core comparison directly');

assert.match(topics, /general minimum wage is MX\$\$\{fmt\(W\.value,2\)\} a day/i,
  'minimum-wage copy must identify Mexican pesos');
assert.match(topics, /Part of the reason both lines rise together/i,
  'trade copy must not claim one complete cause for co-movement');
for (const phrase of [/local source registry/i, /event registry/i, /local feed/i, /fails closed/i, /automatically colored as good/i]) {
  assert.doesNotMatch(topics, phrase, `topic pages must not expose internal QA language: ${phrase}`);
}

assert.doesNotMatch(model, /causal map/i, 'directional rules must not be presented as identified causality');
assert.match(model, /directional scenario map, not a forecast/i,
  'model must state what the tool actually does');

const expectedStanding = `The peso trades at ${Number(latestSeriesValue('banxico-usdmxn-fix')).toFixed(2)} pesos to the dollar; inflation is ${Number(latestSeriesValue('banxico-inflacion')).toFixed(2)}%; the policy rate is ${Number(latestSeriesValue('banxico-tasa-objetivo')).toFixed(2)}%.`;
assert.equal(brief.standing.text, expectedStanding,
  'standing line must match the latest feeds, state the peso unit, and separate the three readings clearly');
assert.equal(brief.standing.live[0].tmpl, 'the peso trades at {v} pesos to the dollar',
  'live standing copy must preserve the peso unit when the number updates');

console.log('launch-copy-contract: ok');
