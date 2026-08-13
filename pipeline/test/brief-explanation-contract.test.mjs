import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { extractText } from '../lib/fetch-article.js';
import { reportContextDistinct, slopFlags } from '../lib/lint.js';

const require = createRequire(import.meta.url);
const { briefReadiness } = require('../lib/brief-readiness.cjs');
const { evidenceInputs } = require('../lib/report-evidence.cjs');
const { mergeApprovedAttempt } = require('../lib/analysis-attempts.cjs');
const interests = require('../../data/interests.json');

const story = (id, ready = false) => ({
  refs: [id],
  headline: id,
  analysisV: ready ? 8 : 0,
  background: ready ? 'A structural fact.' : '',
  view: ready ? 'A view because the mechanism is clear.' : '',
  prediction: ready ? 'The result is likely if the next release confirms it.' : '',
  analysisRefs: ready ? { background: ['article'], view: ['article'], prediction: ['article'] } : {},
  analysisSources: ready ? [{ source: 'Example News', url: `https://example.com/${id}` }] : [],
});
const brief = (states) => ({ lead: story('lead', states[0]), items: states.slice(1).map((ready, index) => story(`item-${index + 2}`, ready)) });

assert.equal(briefReadiness(brief([false, false, false, true, true])).targetMet, false,
  'analysis on lower-ranked stories must not disguise any unexplained selected story');
assert.deepEqual(briefReadiness(brief([false, false, false, false, false])).missingTarget,
  ['lead', 'item-2', 'item-3', 'item-4', 'item-5']);
assert.equal(briefReadiness(brief([false, false, false])).publicationBlocking, true,
  'missing analysis must stop a nonquiet edition');
assert.equal(briefReadiness(brief([true, true, false, false, false])).targetMet, false,
  'two complete explanations cannot certify a five-story edition');
assert.deepEqual(briefReadiness(brief([true, true, false])).missingTarget, ['item-3'],
  'the receipt must disclose every selected story without an approved explanation');
assert.equal(briefReadiness(brief([true, false, false])).targetMet, false,
  'one explanation cannot satisfy a normal three-story edition');
assert.equal(briefReadiness(brief([false, true, true])).targetMet, false,
  'analysis availability must not let the edition publish around an unexplained lead');
assert.equal(briefReadiness(brief([true, true, true, true, true])).targetMet, true,
  'every selected story with complete evidence-linked analysis certifies the edition');
const missingLink = brief([true]);
missingLink.lead.analysisSources = [];
assert.equal(briefReadiness(missingLink).targetMet, false,
  'three polished paragraphs without a reader-accessible evidence link are not ready');
assert.equal(briefReadiness({ lead: null, items: [] }).targetMet, true, 'a genuinely quiet edition is a clean no-op');

assert.deepEqual(
  mergeApprovedAttempt(
    { background: 'Approved background.', prediction: 'Approved prediction.' },
    { view: 'Approved view because the mechanism is clear.' },
    ['background', 'view', 'prediction'],
  ),
  {
    background: 'Approved background.',
    view: 'Approved view because the mechanism is clear.',
    prediction: 'Approved prediction.',
  },
  'a bounded retry may complete the same evidence-locked analysis unit without reviving a rejected field',
);

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
assert.equal(slopFlags({
  title: 'Mexico updates its governmental accounting rules',
  why: 'The Manual de Contabilidad Gubernamental de México sets the reporting structure.',
  url: 'https://example.com/manual', date: '2026-08-13',
}).includes('non-English context'), false, 'Spanish proper names inside English analysis must not trigger the language gate');
assert.equal(slopFlags({
  title: 'Mexico updates its governmental accounting rules',
  why: 'El manual establece las reglas para que los gobiernos presenten sus cuentas.',
  url: 'https://example.com/manual', date: '2026-08-13',
}).includes('non-English context'), true, 'untranslated Spanish prose must still fail the language gate');

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
