import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { extractText } from '../lib/fetch-article.js';
import { lintAnalysisText, reportContextDistinct, slopFlags } from '../lib/lint.js';

const require = createRequire(import.meta.url);
const { briefReadiness } = require('../lib/brief-readiness.cjs');
const { ANALYSIS_VERSION } = require('../lib/analysis-contract.cjs');
const { evidenceInputs } = require('../lib/report-evidence.cjs');
const { analysisTargetSurvivesSelfHeal, mergeApprovedAttempt } = require('../lib/analysis-attempts.cjs');
const interests = require('../../data/interests.json');
const happeningBuilder = fs.readFileSync(new URL('../build-happening.js', import.meta.url), 'utf8');
const briefBuilder = fs.readFileSync(new URL('../build-brief.js', import.meta.url), 'utf8');

const attemptEvent = {
  id: 'selected', title: 'CFE plans private financing', context: 'The utility described its plan.',
  why: 'The utility described its plan.', source: 'Example', url: 'https://example.com/cfe', date: '2026-08-28',
  reportEvidence: { title: 'Raw title', dek: 'Raw dek' }, coverage: [],
  analysisSources: [{ kind: 'primary', source: 'Old wrong label', url: 'https://agency.gov/record' }],
  analysisV: 10, view: 'Stale generated prose.',
};
const healedAttemptEvent = { ...attemptEvent, analysisV: undefined, view: undefined };
const attemptTarget = { policy: 'policy-v1', ids: ['selected'], attempt: 1 };
assert.equal(analysisTargetSurvivesSelfHeal([attemptEvent], [healedAttemptEvent], attemptTarget, 'policy-v1'), true,
  'purging stale generated prose must not reset an unchanged selected story to attempt one');
assert.equal(analysisTargetSurvivesSelfHeal([attemptEvent], [{ ...healedAttemptEvent, context: 'The plan changed.' }], attemptTarget, 'policy-v1'), false,
  'a changed selected-story input must reset the bounded recovery');
assert.equal(analysisTargetSurvivesSelfHeal([attemptEvent], [{
  ...healedAttemptEvent,
  analysisSources: [{ kind: 'primary', source: 'Agency', url: 'https://agency.gov/new-record' }],
}], attemptTarget, 'policy-v1'), false, 'a changed retained primary record must reset the bounded recovery');
assert.equal(analysisTargetSurvivesSelfHeal([attemptEvent], [], attemptTarget, 'policy-v1'), false,
  'removing a selected row must reset the bounded recovery');
assert.equal(analysisTargetSurvivesSelfHeal([
  attemptEvent, { id: 'unrelated', title: 'Old row' },
], [healedAttemptEvent], attemptTarget, 'policy-v1'), true,
  'purging an unrelated row must not rebuy analysis for unchanged selected stories');
assert.equal(analysisTargetSurvivesSelfHeal([attemptEvent], [healedAttemptEvent], attemptTarget, 'policy-v2'), false,
  'a changed analysis policy must reset the bounded recovery');

const story = (id, ready = false) => ({
  refs: [id],
  headline: id,
  analysisV: ready ? ANALYSIS_VERSION : 0,
  background: ready ? 'A structural fact.' : '',
  view: ready ? 'A view because the mechanism is clear.' : '',
  prediction: ready ? 'The result is likely if the next release confirms it.' : '',
  analysisRefs: ready ? { background: ['article'], view: ['article'], prediction: ['article'] } : {},
  analysisSources: ready ? [{ kind: 'primary', source: 'Example agency', url: `https://agency.gov/${id}` }] : [],
});
const brief = (states) => ({ lead: story('lead', states[0]), items: states.slice(1).map((ready, index) => story(`item-${index + 2}`, ready)) });

assert.equal(briefReadiness(brief([false, false, false, true, true])).targetMet, false,
  'analysis on lower-ranked stories must not disguise any unexplained selected story');
assert.deepEqual(briefReadiness(brief([false, false, false, false, false])).missingTarget,
  ['lead', 'item-2', 'item-3', 'item-4', 'item-5']);
assert.equal(briefReadiness(brief([false, false, false])).publicationBlocking, true,
  'a factual card without Briefly Explained must not be certified as the finished Brief');
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
const missingPrimary = brief([true]);
missingPrimary.lead.analysisSources = [{ kind: 'article', source: 'Example News', url: 'https://example.com/story' }];
assert.equal(briefReadiness(missingPrimary).targetMet, false,
  'a news citation without a primary record and independent evidence audit is not ready');
const emptyReadiness = briefReadiness({ lead: null, items: [] });
assert.equal(emptyReadiness.targetMet, false, 'an empty Brief must never certify itself as ready');
assert.equal(emptyReadiness.publicationBlocking, true, 'an unmarked empty Brief must not certify itself');
const quietReadiness = briefReadiness({ meta: { quiet: true }, lead: null, items: [] });
assert.equal(quietReadiness.targetMet, true, 'an explicit current-day quiet state needs no explanation panels');
assert.equal(quietReadiness.publicationBlocking, false);
assert.match(happeningBuilder, /for \(const target of researchTargets\)[\s\S]*web_search_20250305[\s\S]*max_uses: 1/,
  'a selected non-official story without local context may get one bounded primary-record search');
assert.match(happeningBuilder, /const hasLocalContext[\s\S]*researchTargets = fetched\.filter[\s\S]*!hasLocalContext\(item\.e\)/,
  'stories that already have relevant official or independent context must not buy a redundant search');
assert.match(happeningBuilder, /retainedPrimary[\s\S]*source: sourceHost\(source\.url\), title: sourceHost\(source\.url\)[\s\S]*!item\.research\.length/,
  'a version migration must re-fetch a verified primary URL without rebuying search or trusting an old generated label');
assert.doesNotMatch(happeningBuilder, /retainedPrimary[\s\S]{0,500}title: stripDashWs\(source\.source\)/,
  'poisoned labels from an older analysis version must never enter retained primary evidence text');
assert.match(happeningBuilder, /searched\.find\(\(source\) => sourceKey\(source\.url\) === sourceKey\(proposed\.url\)\)/,
  'a model-returned research URL must have appeared in the provider search results');
assert.match(happeningBuilder, /primaryResearchUrl\(source\.url\)/,
  'research must resolve to a government, regulator, international body, or corporate filing page');
assert.match(happeningBuilder, /field === 'background'[\s\S]*contextualEvidence/,
  'Background must establish context from evidence beyond the original article');
assert.equal((happeningBuilder.match(/await auditCompletedOnce\(\)/g) || []).length, 1,
  'completed panels must receive exactly one semantic evidence audit after drafting and repair');
assert.match(happeningBuilder, /if \(firstReturned \|\| retryReturned\) await auditCompletedOnce\(\)/,
  'the semantic audit must run once after the bounded drafting retry, not after both drafts');
assert.doesNotMatch(happeningBuilder, /independentContext\s*:/,
  'semantic audit must receive only the exact evidence cited by each field');
assert.match(happeningBuilder, /target\.research\.push\(\{[\s\S]*source: sourceHost\(source\.url\),[\s\S]*title: sourceHost\(source\.url\)/,
  'a newly discovered primary must use its verified host as its evidence label and title');
assert.doesNotMatch(happeningBuilder, /title: stripDashWs\(proposed\.title\)/,
  'model-authored research titles must never enter the closed evidence set');
assert.match(happeningBuilder, /rejectionsThisRun = new Map\(arr\(priorOutcomes\)[\s\S]*fields: rejectedFields/,
  'field-level failures must survive into one targeted recovery instead of collapsing to field-rejected');
assert.match(happeningBuilder, /analysis reject \$\{item\.e\.id\}\.\$\{field\}: field was empty/,
  'an empty returned field must be visible in the workflow log as well as the recovery receipt');
assert.match(happeningBuilder, /const analyzableIds = new Set[\s\S]*!analyzableIds\.has\(id\)[\s\S]*thin-evidence/,
  'a selected story without relevant independent context must be recorded as thin evidence, not a generic field failure');
assert.match(happeningBuilder, /const request = \(batch, effort, maxTokens\) => askJSON\(\{[\s\S]*?model: models\.HAIKU,[\s\S]*?priority: 'core'/,
  'evidence-locked drafting must use the bounded model tier so daily all-story coverage fits the monthly cap');
assert.match(briefBuilder, /const rankedPicked = selection\.picked[\s\S]*omitUnreadyOptionalTail\(rankedPicked\)/,
  'analysis may only remove an unready optional tail from the locked ranking, never select a replacement');
assert.match(briefBuilder, /analysisTargetIds = omitUnreadyOptionalTail\(rankedPicked\)/,
  'the bounded analysis batch must exclude the same optional tail the final builder may omit');
assert.match(happeningBuilder, /selection\?\.analysisTargetIds/,
  'targeted enrichment must use the precomputed blocking explanation target');

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
assert.equal(lintAnalysisText({
  text: 'The official record shows the decision is still preliminary.',
  inputs: ['The official record says the decision remains preliminary.'],
  role: 'background',
}).ok, true, 'ordinary official-record language must not be mistaken for a record superlative');
assert.equal(lintAnalysisText({
  text: 'The regulator approved the fee cap.',
  inputs: ['The regulator published a draft that would reduce the fee cap.'],
  role: 'background',
}).ok, false, 'the shared analysis gate must not turn a draft into a completed action');
assert.equal(lintAnalysisText({
  text: 'If project delays accumulate, whether the company pivots to more borrowing.',
  inputs: ['The company announced projects financed with private partners.'],
  role: 'prediction',
}).flags.includes('watch item is grammatically incomplete'), true,
'a conditional followed by a dangling whether clause must not reach the public watch field');
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
