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
assert.match(workflow, /EDITION_REQUIRE_REVIEW:\s*'0'/,
  'authorized daily workflow publishes only after all gates pass');
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

assert.match(workflow, /workflows: \[release-check\]/);
assert.match(workflow, /github.event.workflow_run.conclusion == 'success'/);
assert.match(workflow, /github.event.workflow_run.head_branch == 'main'/);
assert.match(workflow, /node pipeline\/publication-plan\.mjs/);
assert.match(workflow, /cron: '50 12 \* \* \*'/);
assert.match(workflow, /cron: '20 13 \* \* \*'/);

const { publicationPlan } = await import('../publication-plan.mjs');
const date = '2026-09-30';
const plan = (event, rows = [], extra = {}) => publicationPlan({event, date, attempts: {attempts: rows}, edition: {editorialDate:date,artifactHash:'current'}, ...extra});
const attempt = (state, extra = {}) => ({editorialDate: date, slot: 'morning', state, artifactHash:'current', ...extra});
assert.deepEqual(plan('schedule'), {run: true, slot: 'morning', retry: false});
assert.equal(plan('workflow_run').run, false, 'a code check alone never starts a new editorial attempt');
assert.deepEqual(plan('workflow_run', [attempt('failed')]), {run: true, slot: 'morning', retry: true});
assert.deepEqual(plan('schedule', [attempt('failed', {slot: 'noon'})]), {run: true, slot: 'noon', retry: true});
for (const state of ['published', 'review-required']) assert.equal(plan('workflow_run', [attempt(state)]).run, false);
assert.deepEqual(plan('workflow_run', [attempt('failed', {recoveries: [{}]})]), {run:true,slot:'noon',retry:false});
assert.throws(() => plan('schedule', [attempt('failed', {slot:'noon',recoveries: [{}]})]), /exhausted/);
assert.throws(() => plan('workflow_run', [attempt('started')]), /requires diagnosis/);
assert.equal(plan('workflow_run', [attempt('failed', {editorialDate:'2026-09-29'})]).run, false);
assert.deepEqual(plan('workflow_dispatch', [], {slot:'noon',retry:true}), {run:true,slot:'noon',retry:true});

const { recordReleaseFailure } = await import('../record-release-failure.mjs');
const rejectedRelease = recordReleaseFailure({attempts:[attempt('published', {artifactHash:'abc',calls:2,costUSD:0.02})]}, date, 'morning');
assert.equal(rejectedRelease.attempts[0].state, 'failed');
assert.equal(rejectedRelease.attempts[0].artifactHash, '');
assert.equal(rejectedRelease.attempts[0].costUSD, 0.02);
assert.equal(rejectedRelease.attempts[0].calls, 2);
assert.equal(publicationPlan({event:'workflow_run',date,attempts:rejectedRelease}).retry, true);
assert.ok(workflow.indexOf('node pipeline/record-release-failure.mjs') < workflow.indexOf('git add data/edition.json'));

assert.equal(plan('workflow_run', [attempt('published')]).verify, true);
assert.throws(() => plan('schedule', [attempt('published')], {edition:{editorialDate:date,artifactHash:'wrong'}}), /does not match/);
const { claimDeploymentRetry } = await import('../claim-deployment-retry.mjs');
const deploymentLedger = {attempts:[attempt('published', {calls:2,costUSD:0.03})]};
claimDeploymentRetry(deploymentLedger,{editorialDate:date,artifactHash:'current'},'2026-09-30T14:00:00Z');
assert.equal(deploymentLedger.attempts[0].costUSD,0.03);
assert.throws(() => claimDeploymentRetry(deploymentLedger,{editorialDate:date,artifactHash:'current'}), /exhausted/);
assert.throws(() => claimDeploymentRetry(deploymentLedger,{editorialDate:date,artifactHash:'wrong'}), /No published attempt/);
assert.match(workflow, /steps.plan.outputs.verify == 'true'/);
assert.match(workflow, /node pipeline\/claim-deployment-retry\.mjs/);

assert.equal(plan('workflow_dispatch', [attempt('published')]).verify, true);
