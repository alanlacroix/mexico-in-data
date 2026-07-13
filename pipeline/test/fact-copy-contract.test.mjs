import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyForCensusMexicoBalance, reconcileHappeningFactCopy } from '../lib/fact-copy.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const happening = read('data/happening.json');
const tradeUS = read('data/trade-us.json');
const areas = read('data/areas.json');
const event = happening.events.find((item) => item.id === 'us-deficit-may-2026-07-07');

assert.ok(event, 'the May Census balance event must remain in the curated event log');
assert.deepEqual(event.dataRef, {
  dataset: 'trade-us',
  metric: 'us-goods-balance',
  month: '2026-05',
}, 'the public claim must stay attached to its source month and metric');

const expected = copyForCensusMexicoBalance(tradeUS, event.dataRef.month);
assert.deepEqual(
  { title: event.title, context: event.context, why: event.why },
  expected,
  'the curated Census copy must match the values stored in trade-us.json',
);
assert.equal(expected.title, 'May U.S. goods deficit with Mexico widens to US$21.1bn');
assert.equal(expected.context, 'The U.S. goods deficit with Mexico was US$21.13bn in May, up from US$15.35bn in April.');
assert.equal(expected.why, 'The monthly U.S. Census ledger shows the bilateral goods gap widening by US$5.78bn from April.');

const reconciled = reconcileHappeningFactCopy([{ ...event, title: 'stale', context: 'stale', why: 'stale' }], { tradeUS });
assert.deepEqual(
  { title: reconciled[0].title, context: reconciled[0].context, why: reconciled[0].why },
  expected,
  'the happening build must replace stale referenced values before publication',
);

const publicHeadline = areas.areas
  .find((area) => area.key === 'usmexico')
  ?.headlines.find((item) => item.url === event.url);
assert.equal(publicHeadline?.title, expected.title, 'the homepage topic area must use the reconciled Census headline');

console.log('fact-copy-contract: ok');
