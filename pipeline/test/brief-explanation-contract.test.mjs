import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { extractText } from '../lib/fetch-article.js';
import { reportContextDistinct } from '../lib/lint.js';

const require = createRequire(import.meta.url);
const { briefReadiness } = require('../lib/brief-readiness.cjs');
const { evidenceInputs } = require('../lib/report-evidence.cjs');
const interests = require('../../data/interests.json');

const story = (id, ready = false) => ({
  refs: [id],
  headline: id,
  analysisV: ready ? 7 : 0,
  background: ready ? 'A structural fact.' : '',
  view: ready ? 'A view because the mechanism is clear.' : '',
  prediction: ready ? 'The result is likely if the next release confirms it.' : '',
});
const brief = (states) => ({ lead: story('lead', states[0]), items: states.slice(1).map((ready, index) => story(`item-${index + 2}`, ready)) });

assert.equal(briefReadiness(brief([false, false, false, true, true])).ok, false,
  'analysis on lower-ranked stories must not disguise an unexplained lead and top three');
assert.deepEqual(briefReadiness(brief([false, false, false])).missingRequired, ['lead', 'item-2', 'item-3']);
assert.equal(briefReadiness(brief([true, true, true, false, false])).ok, true,
  'the top three define publication readiness; lower cards remain quick to scan');
assert.equal(briefReadiness({ lead: null, items: [] }).ok, true, 'a genuinely quiet edition is a clean no-op');

const retained = evidenceInputs({
  date: '2026-08-07',
  title: 'Rewritten headline',
  why: 'Unsupported generated judgment proves itself.',
  reportEvidence: { title: 'Raw source title', dek: 'Raw source dek' },
});
assert.deepEqual(retained, ['2026-08-07', 'Raw source title', 'Raw source dek']);
assert.equal(retained.includes('Unsupported generated judgment proves itself.'), false,
  'the factual copy gate must never validate generated context against itself');

assert.equal(reportContextDistinct({
  headline: "Mexico's annual inflation slows to 3.12 percent in July, lowest since 2020",
  context: 'Annual price growth eased to 3.12 percent in July, the lowest reading since 2020.',
}), false, 'a synonym-heavy restatement must not count as context');
assert.equal(reportContextDistinct({
  headline: "Mexico's annual inflation falls to 3.12 percent in July, its lowest rate since 2020",
  context: "The headline rate is close to Banxico's target, but underlying inflation remained more persistent.",
}), true, 'a sourced caveat should earn the context line');

const extracted = extractText(`
  <html><body>
    <div class="content-inner"><p>The actual story body explains the power constraint in enough detail for analysis.</p></div>
    <div class="jeg_post_tags">energy</div>
    <article><p>Related story card one.</p></article>
    <article><p>Related story card two.</p></article>
  </body></html>
`);
assert.match(extracted, /actual story body/);
assert.doesNotMatch(extracted, /Related story card/,
  'multiple related-card article tags must not hide a div-based story body');

const usRelationship = new RegExp(interests.interests.find((item) => item.tag === 'us-relationship').pattern, 'i');
assert.equal(usRelationship.test('high-consumption industries'), false,
  'the USTR interest must not match the middle of the word industries');
assert.equal(usRelationship.test('US trade representative opens the North American trade agreement review'), true);

console.log('brief-explanation-contract tests: ok');
