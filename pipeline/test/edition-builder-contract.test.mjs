import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lintReportText, unsupportedNumericTokens } from '../lib/lint.js';
import scheduledCandidate from '../lib/scheduled-candidate.cjs';

const builder = fs.readFileSync(new URL('../build-edition.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(builder, /optionalAnalysis|analysisTarget|curation checkpoint|deferred/i);
assert.match(builder, /background: needs an independent source when one is available/);
assert.match(builder, /no exact-day story survived/);
assert.match(builder, /a required scheduled outcome failed/);
assert.match(builder, /required scheduled outcome unavailable/,
  'an unfetched required official outcome must block publication, not disappear');
assert.match(builder, /english: draft\[field\], spanish: draft\.es\[field\]/,
  'the final independent audit must review Spanish rather than generate and approve it');
assert.match(builder, /mistranslations, reversed actions, changed subjects/,
  'the independent audit must reject bilingual meaning changes');
assert.match(builder, /EDITION_REQUIRE_REVIEW === '1' && weekendDay\(editorialDate\).*EDITION_WEEKEND_RECOVERY/,
  'the human-reviewed pilot skips weekend generation before creating an attempt');
assert.match(builder, /repairing only missing or rejected story units within the existing call budget/,
  'a failed first draft must receive one bounded repair without increasing the call cap');
assert.match(builder, /weeklyBrief: buildWeeklyBrief\(passing, editorialDate\)/,
  'every generated candidate must carry the weekly presentation shape');

assert.equal(lintReportText({ text: 'The sourceTitle says the rule changed.', inputs: ['The rule changed.'] }).ok, false);
assert.equal(lintReportText({ text: 'The evidence strings show the amount.', inputs: ['The amount was 5.'] }).ok, false);
assert.equal(lintReportText({ text: 'Exports reached 81.4 billion dollars.', inputs: ['Exports reached 80 billion dollars.'] }).ok, false);
assert.deepEqual(unsupportedNumericTokens('The reform followed the 2024 election.', ['The reform was presented.']), ['2024']);
assert.deepEqual(unsupportedNumericTokens('Almost 1 million jobs.', ['casi un millón de empleos']), ['1'],
  'retain literal numeric evidence rather than accepting an incomplete written-quantity grammar');
assert.match(builder, /repairUnsupportedAnalysisNumbers/,
  'one unsupported number in analysis should remove its sentence before discarding the story');
assert.match(builder, /repairOverlongAnalysis\(repairUnsupportedAnalysisNumbers\(row, rawDraft\)\)/,
  'a style-only analysis overrun must lose whole trailing sentences before it can block publication');
assert.match(builder, /english\.pop\(\);\s*spanish\.pop\(\)/,
  'length repair must preserve aligned English and Spanish sentences when possible');
assert.doesNotMatch(builder, /slice\(0,\s*(?:55|65)\)/,
  'length repair must never cut a sentence fragment');
assert.doesNotMatch(builder, /maxItems|minItems:\s*expectedCount/,
  'unsupported Anthropic array-count keywords must not reach the live schema');
assert.match(builder, /unexpected draft index/);
assert.match(builder, /duplicate draft index/);
assert.match(builder, /model omitted the required story unit/,
  'missing model rows must be visible in the persisted failure reason');
assert.match(builder, /evidenceRows\.filter\(evidenceReady\)\.slice\(0, MAX_VISIBLE\)/,
  'the fixed top-five ranking must choose only cards that can support Briefly Explained');
assert.match(builder, /item\.kind === 'article-body' && item\.url === row\.item\.url/,
  'a one-source fallback must require a verified body from the exact selected article');
assert.match(builder, /No replacement happens after drafting/,
  'writing convenience must never rerank the selected developments');
assert.match(builder, /function draftFailureReceipt/,
  'failed drafts must retain structured rejected-copy diagnostics without source bodies');
assert.match(builder, /diagnostics: failureDiagnostics\.slice\(0, 5\)/,
  'failed drafts must retain actionable rejection diagnostics, not only a truncated summary');

const schedule = [{
  id: 'banxico-policy-test', date: '2026-09-24', outcomeRequired: true, requiredForBrief: true,
  importanceFloor: 8, outcome: { actor: 'banxico', topic: 'policy-rate' },
  label: 'Banxico monetary-policy decision', source: 'Banco de México', sourceUrl: 'https://www.banxico.org.mx/rates',
}];
const matched = scheduledCandidate.linkScheduledCandidate({
  title: 'Banxico mantiene sin cambios la tasa de interés',
  dek: 'Banco de México dejó sin cambios la tasa objetivo.',
  published_at: '2026-09-24T18:00:00Z',
}, schedule, '2026-09-24');
assert.equal(matched?.id, 'banxico-policy-test', 'a rates-unchanged outcome must be deterministically seeded');
assert.match(builder, /seedScheduledCandidate/);
assert.match(builder, /await candidateUniverse/);
assert.match(builder, /attentionSignal\(row\.item\) >= 0 && !commentaryOnlyCandidate\(row\.item\)/,
  'routine content and commentary do not substitute for factual developments');

const collector = fs.readFileSync(new URL('../collect-news.js', import.meta.url), 'utf8');
assert.match(collector, /mapLimit\(REG\.sources, 10/);
assert.doesNotMatch(collector, /execFileSync|published_at:\s*toISO\(it\.date\)\s*\|\|\s*now/,
  'collection must be bounded and must not turn fetch time into publication time');

console.log('edition-builder contract: ok');

// Abbreviations in faithful copy must not consume the sentence allowance.
for (const text of [
  'The U.S. investor filed a claim. The tribunal dismissed it.',
  'Acciones mexicanas caen ante tensiones entre EE.UU. e Irán',
  'El comercio con EE. UU. creció.',
  'The peso gained at 7:12 a.m. local time.',
  'El peso subió a las 7:12 p.m. hora local.',
]) {
  assert.equal(lintReportText({ text, inputs: [text], maxSentences: text.startsWith('The') ? 2 : 1 }).ok, true, text);
}
assert.equal(lintReportText({ text: 'One. Two. Three.', inputs: [], maxSentences: 2 }).ok, false);
assert.equal((builder.match(/system: `\$\{DRAFT_GATE_CONTRACT\}/g) || []).length, 2,
  'initial generation and bounded repair must share the actual gate contract');

// Replaying a failed slot is a read-only failure, never a misleading green no-op.
const { spawnSync } = await import('node:child_process');
const os = await import('node:os');
const path = await import('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-failed-replay-'));
try {
  fs.cpSync(new URL('../', import.meta.url), path.join(root, 'pipeline'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data'));
  const editionFile = path.join(root, 'data/edition.json');
  const attemptsFile = path.join(root, 'data/edition-attempts.json');
  fs.copyFileSync(new URL('../../data/edition.json', import.meta.url), editionFile);
  const beforeEdition = fs.readFileSync(editionFile);
  for (const state of ['failed', 'started', 'published', 'review-required']) {
    const beforeAttempts = JSON.stringify({ attempts: [{ editorialDate: '2026-09-30', slot: 'morning', state, calls: 0, costUSD: 0 }] });
    fs.writeFileSync(attemptsFile, beforeAttempts);
    const replay = spawnSync(process.execPath, ['pipeline/build-edition.mjs'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: 'false', PUBLICATION_DATE: '2026-09-30', PUBLICATION_SLOT: 'morning',
        EDITION_REQUIRE_REVIEW: '0', EDITION_RETRY_FAILED: '0', ANTHROPIC_API_KEY: '' },
    });
    const unresolved = ['failed', 'started'].includes(state);
    assert.equal(replay.status, unresolved ? 1 : 0, replay.stderr);
    assert.match(replay.stdout, unresolved ? /state=failed/ : /state=noop/);
    if (unresolved) assert.match(replay.stderr, /use explicit failed-attempt recovery after diagnosis/);
    assert.deepEqual(fs.readFileSync(editionFile), beforeEdition);
    assert.equal(fs.readFileSync(attemptsFile, 'utf8'), beforeAttempts);
  }
} finally { fs.rmSync(root, { recursive: true, force: true }); }

assert.match(builder, /model: models.SONNET/, 'draft quality uses the evidence-writing model');
assert.match(builder, /input: 3, output: 15/, 'daily cap must price the selected model conservatively');
const schemaSource = builder.slice(builder.indexOf('function draftSchema('), builder.indexOf('function auditSchema('));
const exactSchema = new Function(`${schemaSource}; return draftSchema([0, 3]);`)();
assert.equal(exactSchema.properties.stories.type, 'object');
assert.deepEqual(exactSchema.properties.stories.required, ['s0', 's3']);
assert.equal(exactSchema.properties.stories.properties.s3.$ref, '#/definitions/story');
assert.ok(exactSchema.definitions.story.required.includes('es'));
assert.equal(exactSchema.properties.stories.additionalProperties, false);
assert.ok(JSON.stringify(exactSchema).length < 1600, 'avoid compiled-grammar explosion from duplicated story objects');
assert.equal((builder.match(/model: models.SONNET, effort: 'low'/g) || []).length, 2,
  'bounded evidence-writing calls must not inherit high reasoning that consumes the whole output allowance');
assert.match(builder, /spent \+ estimate\(selectedModel\) \+ reservedAuditUSD > dayLimit/);
assert.match(builder, /selectedModel = models.HAIKU/);
assert.match(builder, /allowedNumericValues: unsupportedNumericTokens/);

assert.match(builder, /reserveUSD: auditReservation\(rows\)/);
assert.match(builder, /reserveUSD: reservedAuditUSD/);
assert.match(builder, /spent \+ projected \+ reservedAuditUSD > dayLimit/);
assert.match(builder, /exceeds the bounded audit field length/);
assert.match(builder, /evidenceRefs: draft\[/);
assert.doesNotMatch(builder, /text, position.*draft\[/, 'audit evidence IDs must not depend on reference order');

assert.match(builder, /projected \+ reservedAuditUSD > monthlyRemaining/);
const { deterministicDraftCheck } = await import('../build-edition.mjs');
const longField = 'é'.repeat(310);
const oversized = {es:{}};
for(const field of ['headline','dek','background','view','watch']) {
  oversized[field]=longField;oversized.es[field]=longField;oversized[`${field}Refs`]=['article'];
}
assert.ok(deterministicDraftCheck({evidence:[{id:'article',text:longField}]},oversized).some(flag=>flag.includes('bounded audit field length')),
  'audit bound counts actual JSON UTF-8 bytes, not character count');

const { draftSchema, auditSchema, keyedUnits, repairOverlongAnalysis, sectionOf } = await import('../build-edition.mjs');
assert.deepEqual(auditSchema([0, 3]).properties.reviews.required, ['s0', 's3']);
assert.deepEqual(keyedUnits({s0:{headline:'first'},s3:{headline:'third'}}).map(unit=>unit.i),[0,3]);
assert.deepEqual(keyedUnits([]),[],'old loose arrays cannot silently masquerade as complete output');
assert.ok(Number.isNaN(keyedUnits({wrong:{}})[0].i));
assert.equal(sectionOf({title:'Pemex reduce importaciones de diésel',beat:'fintech'}),'energy');
assert.equal(sectionOf({title:'CFE amplía la red eléctrica',beat:'fintech'}),'energy');
assert.equal(sectionOf({title:'Nuevo sistema de pagos digitales SPEI',beat:'energy'}),'payments');
const overlong={es:{}};
for(const f of ['background','view','watch']){overlong[f]='One. Two. Three. Four. Five.';overlong.es[f]='Uno. Dos. Tres. Cuatro. Cinco.';}
const bounded=repairOverlongAnalysis(overlong);
assert.equal(bounded.view,'One. Two. Three.');assert.equal(bounded.es.view,'Uno. Dos. Tres.');
assert.match(builder,/evaluated\.rejectionDiagnostics\.length && callCount/,'partial failures get the remaining repair opportunity');
assert.match(builder,/createFieldRepairPlan\(rejectedRows\.map/,'passing drafts are not regenerated');
assert.match(builder,/optionalOnBudget: publicationCoverage/);
assert.doesNotMatch(builder,/\$\{ANALYSIS_SHAPE\}/,'the daily writer must not import the contradictory return-no-analysis instruction');

const {publicationCoverage,removableBudgetRow}=await import('../build-edition.mjs');
const coverageRows=[0,1,2].map(index=>({index,item:{_scheduled:{id:`required-${index}`},_editorialDate:'2026-09-30'}}));
coverageRows.push({index:3,item:{_editorialDate:'2026-10-01'}},{index:4,item:{_editorialDate:'2026-09-30'}});
assert.equal(removableBudgetRow(coverageRows,'2026-10-01'),4);
assert.equal(removableBudgetRow(coverageRows.slice(0,4),'2026-10-01'),-1,'budget shrink must retain exact-day coverage alongside required outcomes');
assert.equal(publicationCoverage(coverageRows.slice(0,3),coverageRows,'2026-10-01'),false);
assert.equal(publicationCoverage(coverageRows.slice(0,2),coverageRows,'2026-10-01'),false,'two drafts cannot spend on a guaranteed unusable final audit');
assert.match(builder,/minStories: MIN_VISIBLE, maxStories: MAX_VISIBLE/);
assert.match(builder,/refusing an unusable paid audit/);
