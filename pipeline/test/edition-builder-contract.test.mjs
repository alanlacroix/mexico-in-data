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
assert.match(builder, /first draft failed; running one bounded evidence-preserving repair pass/,
  'a failed first draft must receive one bounded repair without increasing the call cap');
assert.match(builder, /weeklyBrief: buildWeeklyBrief\(passing, editorialDate\)/,
  'every generated candidate must carry the weekly presentation shape');

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
assert.match(builder, /ranked\.filter\(\(row\) => row\.item\._scheduled \|\| row\.importance >= 6\)/,
  'low-value stories must not replace the last-good edition');

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
    const beforeAttempts = JSON.stringify({ attempts: [{ editorialDate: '2026-09-30', slot: 'morning', state }] });
    fs.writeFileSync(attemptsFile, beforeAttempts);
    const replay = spawnSync(process.execPath, ['pipeline/build-edition.mjs'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, PUBLICATION_DATE: '2026-09-30', PUBLICATION_SLOT: 'morning',
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

assert.match(builder, /required: indices.map\(String\)/, 'every locked story has a required structured-output key');
assert.match(builder, /model: models.SONNET/, 'draft quality uses the evidence-writing model');
assert.match(builder, /input: 3, output: 15/, 'daily cap must price the selected model conservatively');
const schemaSource = builder.slice(builder.indexOf('function draftSchema('), builder.indexOf('function auditSchema('));
const exactSchema = new Function(`${schemaSource}; return draftSchema([0, 3]);`)();
assert.deepEqual(exactSchema.properties.stories.required, ['0', '3']);
assert.deepEqual(exactSchema.properties.stories.properties['3'].properties.i.enum, [3]);
assert.equal(exactSchema.properties.stories.additionalProperties, false);
assert.equal((builder.match(/model: models.SONNET, effort: 'low'/g) || []).length, 2,
  'bounded evidence-writing calls must not inherit high reasoning that consumes the whole output allowance');
assert.match(builder, /spent \+ estimate\(selectedModel\) > dayLimit/);
assert.match(builder, /selectedModel = models.HAIKU/);
assert.match(builder, /allowedNumericValues: unsupportedNumericTokens/);
