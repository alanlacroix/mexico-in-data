import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { contextDigest, headlineDigest, isHeadlineOnly } = require('../lib/brief-summary.cjs');

const stories = [
  {
    title: 'Mexico will buy US drones and anti-drone systems for security operations',
    context: 'The United States said Mexico will be able to buy the equipment at competitive prices.',
  },
  {
    title: 'Manufacturing employment edges up after four monthly declines',
    context: 'Factory employment remained below a year earlier for a 40th consecutive month.',
  },
];

const headlines = headlineDigest(stories);
const digest = contextDigest(stories);
assert.equal(isHeadlineOnly(headlines, stories), true);
assert.equal(isHeadlineOnly(digest, stories), false);
assert.match(digest, /competitive prices/);
assert.match(digest, /40th consecutive month/);
assert.ok(digest.split(/\s+/).length <= 105);

const capped = contextDigest(stories, { maxWords: headlineDigest(stories).split(/\s+/).length });
assert.equal(capped, headlines, 'the fallback must never truncate a sourced sentence to hit the cap');

console.log('brief-summary tests: ok');
