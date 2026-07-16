import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyForCensusMexicoBalance, reconcileHappeningFactCopy } from '../lib/fact-copy.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const tradeUS = read('data/trade-us.json');
const event = {
  id: 'us-deficit-may-2026-07-07',
  dataRef: {
    dataset: 'trade-us',
    metric: 'us-goods-balance',
    month: '2026-05',
  },
  title: 'stale',
  context: 'stale',
  why: 'stale',
};

const expected = copyForCensusMexicoBalance(tradeUS, event.dataRef.month);
assert.equal(expected.title, 'May U.S. goods deficit with Mexico widens to US$21.1bn');
assert.equal(expected.context, 'The U.S. goods deficit with Mexico was US$21.13bn in May, up from US$15.35bn in April.');
assert.equal(expected.why, 'The monthly U.S. Census ledger shows the bilateral goods gap widening by US$5.78bn from April.');

const reconciled = reconcileHappeningFactCopy([event], { tradeUS });
assert.deepEqual(
  { title: reconciled[0].title, context: reconciled[0].context, why: reconciled[0].why },
  expected,
  'the happening build must replace stale referenced values before publication',
);

console.log('fact-copy-contract: ok');
