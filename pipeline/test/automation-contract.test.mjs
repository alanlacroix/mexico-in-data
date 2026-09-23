import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const workflow = read('.github/workflows/happening.yml');
const builder = read('pipeline/build-edition.mjs');
const homepage = read('_data/dailyBrief.js');
const browser = read('index.njk');
const worker = read('ops/publication-watchdog/src/index.mjs');
const weekly = read('_data/weeklyTop.js');

assert.equal((workflow.match(/node pipeline\/build-edition\.mjs/g) || []).length, 1, 'one command must own edition generation');
assert.doesNotMatch(workflow, /^\s+push:/m, 'pushes must never trigger editorial generation');
assert.doesNotMatch(workflow, /build-happening|build-brief|translate-es|publication-status|publish-edition/);
assert.match(workflow, /git add data\/edition\.json data\/edition-attempts\.json data\/llm-spend\.json data\/editions\/ data\/news\//,
  'a successful edition must commit its immutable history alongside the public artifact');
assert.match(workflow, /EDITION_REQUIRE_REVIEW:\s*'1'/,
  'the pilot workflow must route completed drafts to human review');
assert.match(workflow, /\$EDITION_STATE" = "review-required"[\s\S]*git add data\/candidates\/ data\/edition-attempts\.json data\/llm-spend\.json/,
  'a review-required edition must persist only its candidate and accounting receipts');
assert.match(workflow, /Mark candidate as awaiting human review/);
assert.match(workflow, /\[CF-Pages-Skip\].*edition:/);
assert.match(workflow, /steps\.edition\.outcome == 'failure'/, 'a failed publisher must leave the job red after persisting spend');
assert.ok(workflow.indexOf('npm run release') < workflow.indexOf('git add data/edition.json'),
  'the exact site release gate must pass before the edition is committed');
assert.match(workflow, /Retry deployment once without rerunning editorial generation/);
assert.equal((workflow.match(/node pipeline\/verify-production\.mjs/g) || []).length, 2,
  'production gets one verification and one bounded deploy-only recovery');

assert.match(builder, /const MAX_CANDIDATES = 24/);
assert.match(builder, /const MAX_RANKED = 5/);
assert.match(builder, /const MAX_VISIBLE = 3/);
assert.match(builder, /MAX_MODEL_CALLS/);
assert.doesNotMatch(builder, /web_search_|while\s*\([^)]*(?:retry|attempt)/i, 'publication has no search or internal retry loop');
assert.equal((builder.match(/atomicWriteEdition\(target\.file/g) || []).length, 1,
  'there is one atomic write boundary selected by the publication gate');
assert.match(builder, /reviewGate\.publicationTarget/,
  'the builder must choose between public publication and a review candidate explicitly');

assert.match(homepage, /data', 'edition\.json'/);
assert.doesNotMatch(homepage, /brief\.json|publication-status|happening\.json/);
assert.doesNotMatch(browser, /section\.hidden = true/, 'stale last-good cards must never be hidden in the browser');
assert.match(browser, /data-edition-stories/, 'the homepage must render the selected edition stories');
assert.doesNotMatch(browser, /id="sec-numbers"|id="sec-coming"|id="sec-week"/,
  'market dashboards, calendars and the weekly shelf must stay outside the primary reading path');
assert.match(weekly, /data', 'edition\.json'/);
assert.doesNotMatch(weekly, /happening\.json|data\/news|translations\.json/);

assert.doesNotMatch(worker, /publication-status|workflow_runs|contents\/data|recovery/i, 'the clock must not contain an editorial recovery state machine');
assert.match(worker, /edition-dispatch:/);
assert.match(worker, /inputs: \{ slot: due\.slot \}/);

assert.equal(fs.existsSync(path.join(root, '.github/workflows/publication-fallback.yml')), false);
for (const retired of ['pipeline/publish-edition.mjs', 'pipeline/editorial-gate.mjs', 'pipeline/write-publication-status.mjs']) {
  assert.equal(fs.existsSync(path.join(root, retired)), false, `${retired} must remain deleted`);
}
for (const retired of [
  '_data/latestStories.js', 'pipeline/build-happening.js', 'pipeline/build-brief.js',
  'data/brief.json', 'data/es/brief.json', 'data/happening.json',
  'data/publication-status.json', 'data/event-status.json',
]) assert.equal(fs.existsSync(path.join(root, retired)), false, `${retired} must remain deleted`);

for (const file of ['.github/workflows/happening.yml', '.github/workflows/refresh.yml', '.github/workflows/release-check.yml']) {
  const text = read(file);
  assert.doesNotMatch(text, /uses:\s+actions\/[\w-]+@v\d+\b/, `${file} must pin actions to immutable SHAs`);
}
assert.match(workflow, /persist-credentials:\s*false/);
assert.doesNotMatch(read('.github/workflows/refresh.yml'), /github-script|issues:\s*write/);

console.log('automation contract: ok');
