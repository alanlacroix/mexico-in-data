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

assert.equal(lintReportText({ text: 'The sourceTitle says the rule changed.', inputs: ['The rule changed.'] }).ok, false);
assert.equal(lintReportText({ text: 'The evidence strings show the amount.', inputs: ['The amount was 5.'] }).ok, false);
assert.equal(lintReportText({ text: 'Exports reached 81.4 billion dollars.', inputs: ['Exports reached 80 billion dollars.'] }).ok, false);
assert.deepEqual(unsupportedNumericTokens('The reform followed the 2024 election.', ['The reform was presented.']), ['2024']);
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
assert.match(builder, /ranked\.filter\(\(row\) => row\.item\._scheduled \|\| row\.importance >= 6\)/,
  'low-value stories must not replace the last-good edition');

const collector = fs.readFileSync(new URL('../collect-news.js', import.meta.url), 'utf8');
assert.match(collector, /mapLimit\(REG\.sources, 10/);
assert.doesNotMatch(collector, /execFileSync|published_at:\s*toISO\(it\.date\)\s*\|\|\s*now/,
  'collection must be bounded and must not turn fetch time into publication time');

console.log('edition-builder contract: ok');
