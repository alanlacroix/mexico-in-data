import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { contextDigest, headlineDigest, isHeadlineOnly } = require('../lib/brief-summary.cjs');

// Production has ANTHROPIC_API_KEY set even when the monthly budget is exhausted.
// That key-present path must have every symbol it touches imported; on 2026-08-22 an
// undeclared `models` crashed the final Brief build while local no-key runs passed.
const builder = fs.readFileSync(new URL('../build-brief.js', import.meta.url), 'utf8');
assert.match(builder, /import\s*\{[^}]*\bmodels\b[^}]*\}\s*from\s*['"]\.\/lib\/anthropic\.js['"]/,
  'the key-present summary path must import the model registry');

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

const usefulDigest = contextDigest([
  {
    title: 'Investigation finds Morena sent MX$134.9 million through a state financial service in 2024',
    context: "Records show 252,901 payments, but the money does not appear in Morena's campaign filings.",
  },
  {
    title: "Mexico's farm council challenges preliminary US strawberry duties",
    context: 'The preliminary dumping margin is 4.83%, and a final decision is due January 8, 2027.',
  },
]);
assert.match(usefulDigest, /MX\$134\.9 million/,
  'the fallback must retain the main amount instead of opening with a secondary count');
assert.match(usefulDigest, /campaign filings/,
  'the fallback must explain the unresolved issue, not merely attribute a number to a source');
assert.match(usefulDigest, /final decision is due January 8, 2027/,
  'the fallback must tell the reader what happens next');

console.log('brief-summary tests: ok');
