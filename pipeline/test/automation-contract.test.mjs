import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { priorTerminalAnalysisAttempt } from '../publish-edition.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflowDir = path.join(root, '.github', 'workflows');
const workflow = (name) => fs.readFileSync(path.join(workflowDir, name), 'utf8');
const run = fs.readFileSync(path.join(root, 'pipeline', 'run.js'), 'utf8');
const receiptWriter = fs.readFileSync(path.join(root, 'pipeline', 'write-publication-status.mjs'), 'utf8');
const editionPublisher = fs.readFileSync(path.join(root, 'pipeline', 'publish-edition.mjs'), 'utf8');
const productionVerifier = fs.readFileSync(path.join(root, 'pipeline', 'verify-production.mjs'), 'utf8');
const editorialGate = fs.readFileSync(path.join(root, 'pipeline', 'editorial-gate.mjs'), 'utf8');
const outcomeReconciler = fs.readFileSync(path.join(root, 'pipeline', 'reconcile-scheduled-events.mjs'), 'utf8');
const syncFreshness = fs.readFileSync(path.join(root, 'pipeline', 'sync-freshness.js'), 'utf8');
const refresh = workflow('refresh.yml');
const happening = workflow('happening.yml');
const publicationFallback = workflow('publication-fallback.yml');
const watchdogRunOnce = fs.readFileSync(path.join(root, 'ops', 'publication-watchdog', 'run-once.mjs'), 'utf8');

const alertWrite = 'fs.writeFileSync(ALERTS, JSON.stringify(alerts, null, 2));';
assert.equal(run.split(alertWrite).length - 1, 1, 'the current alert ledger must be written exactly once');
assert.ok(
  run.indexOf(alertWrite) < run.indexOf('if (alerts.length)'),
  'the alert ledger must be replaced before the non-empty reporting branch',
);
assert.match(run, /if \(only && records\.some\(\(record\) => record\.status === 'failed'\)\)/, 'a scoped connector failure must make its workflow step fail');

// One edition a day (Alan, 2026-08-03, the budget call) is still the law. What
// changed on 2026-08-04 is what enforces it. Four precise cron minutes used to do
// both jobs: pick the hour and imply the slot. GitHub's scheduler does not land this
// repo near its cron slots (a ':17' cron ran at :51, :34, :54, :12, :03 and :51 over
// four days, and the morning edition was dropped outright twice), so precision was
// buying nothing and costing Alan his morning. The workflow now attempts hourly and
// the receipt-aware gate decides. The gate has one morning state; a pipeline-only push
// may enter that same gate so a bumped artifact contract can be migrated once.
assert.match(
  happening,
  /cron:\s*'\d+ \* \* \* \*'/,
  'the edition must attempt hourly, because the cron minute cannot be relied on',
);
assert.match(happening, /\n  push:[\s\S]*branches: \[main\][\s\S]*- 'pipeline\/\*\*'/,
  'a pipeline-contract change must get one immediate receipt-gated migration attempt');
assert.doesNotMatch(happening, /REQUESTED_SLOT|SCHEDULE:|\n\s+- afternoon\s*$/m,
  'the publisher must not retain a second edition-selection path');
assert.doesNotMatch(
  happening,
  /cron:\s*'22,52 21,22 \* \* \*'/,
  'the evening cron must not return silently — it doubles the model bill (Alan, 2026-08-03)',
);
assert.match(
  happening,
  /node pipeline\/editorial-gate\.mjs/,
  'every redundant schedule must pass through the receipt-aware editorial gate',
);
assert.match(editorialGate, /state === 'blocked'/,
  'hourly schedules must stop after the one publication receipt records a code or infrastructure block');
assert.match(editorialGate, /status\?\.pipelineVersion[\s\S]*PIPELINE_VERSION/,
  'a current dateline must not hide an artifact built by an obsolete pipeline contract');
assert.doesNotMatch(editorialGate, /HAPPENING_PATH|BLOCK_PATH|publication-block|analysisTarget/,
  'the editorial gate must decide from one publication receipt, not several hidden state files');
assert.match(editionPublisher, /node\('Collect news', 'collect-news\.js'/,
  'the core news collector must run inside the one edition command');
assert.match(
  happening,
  /FORCE_PUBLICATION:[^\n]*github\.event\.inputs\.force/,
  'a production watchdog must be able to override a repository receipt after a failed deployment',
);
assert.doesNotMatch(
  happening,
  /TZ=America\/New_York date|date \+%[Hz]/,
  'redundant schedules must be decided by the gate, not skipped by runner wall-clock shell logic',
);
assert.match(
  happening,
  /node pipeline\/publish-edition\.mjs[\s\S]*git add[^\n]*data\/publication-status\.json/,
  'the one edition command must write the exact receipt committed with its result',
);
assert.match(
  receiptWriter,
  /brief\.meta\?\.editorialDate !== editorialDate/,
  'a publication receipt must refuse to certify a brief from another editorial day',
);
assert.match(
  receiptWriter,
  /publicationReadiness\(brief, editorialDate\)[\s\S]*!contentReadiness\.publish[\s\S]*Refusing to certify this Brief/,
  'the publication receipt must reject an unmarked empty edition even if the workflow condition regresses',
);
assert.match(
  outcomeReconciler,
  /priorStatus[\s\S]*priorOutcomes:[^\n]*priorStatus\.outcomes/,
  'a satisfied scheduled outcome must survive after its source event rolls out of the capped event log',
);
assert.match(
  editorialGate,
  /state === 'published'[\s\S]*state === 'blocked'/,
  'a deferred operational receipt must not stop the next hourly editorial retry',
);
assert.match(receiptWriter, /\['published', 'deferred', 'blocked'\]/,
  'one finite-state receipt must represent every publication result');
assert.match(receiptWriter, /state !== 'published'[\s\S]*contentEditorialDate[\s\S]*contentGeneratedAt/,
  'a non-published receipt must preserve the date and timestamp of the last complete edition');
assert.match(receiptWriter, /priorIsCurrentPublication[\s\S]*\? prior/,
  'a failed forced republish must not downgrade a complete current edition');
assert.match(
  receiptWriter,
  /curationReadiness\(curation, editorialDate\)[\s\S]*Fresh-story curation incomplete/,
  'a publication receipt must refuse to certify a date whose fresh candidates were not fully assessed',
);
assert.match(
  editionPublisher,
  /'Collect news'[\s\S]*'Curate current events'[\s\S]*'Reconcile scheduled outcomes'[\s\S]*'Lock ranked stories'/,
  'each editorial pass must refresh the primary RSS ledger before reconsidering the brief',
);
assert.doesNotMatch(editionPublisher, /build-news\.js/,
  'the flaky optional GDELT supplement belongs in the background refresh, not the publication path');
assert.match(
  editionPublisher,
  /'build-happening\.js', \['--skip-analysis', '--resume-current-edition'\][\s\S]*'build-brief\.js', \['--selection-only'\][\s\S]*'build-happening\.js', \['--analysis-for-brief'\][\s\S]*'build-brief\.js', \[\]/,
  'the workflow must lock the ranked stories before spending the explanation budget on those exact stories',
);
assert.match(
  editionPublisher,
  /'Lock ranked stories'[\s\S]*'Explain ranked stories'/,
  'selection must remain locked before explanation work',
);
assert.doesNotMatch(
  happening,
  /id: content|steps\.content\.outputs|write-publication-deferral/,
  'there must be no separate deferral path that can leave an old edition live',
);
assert.doesNotMatch(happening, /Checkpoint the assessed news|Checkpoint the locked selection|editorial checkpoint:/,
  'intermediate public-data commits must not leave main in a half-built editorial state');
assert.match(
  editionPublisher,
  /'Build final English edition'[\s\S]*'Validate editorial data'[\s\S]*'Translate selected edition'[\s\S]*'Validate final homepage'/,
  'the final factual edition must be validated and translated after the bounded explanation attempt',
);
assert.doesNotMatch(editionPublisher, /translate-wire|Translate new topic stories/,
  'the publication path must not spend budget on broad optional feed translation');
assert.equal(
  (editionPublisher.match(/'build-happening\.js', \['--analysis-for-brief'\]/g) || []).length,
  1,
  'one publication run must have exactly one targeted explanation pass',
);
assert.equal(
  (editionPublisher.match(/'reconcile-scheduled-events\.mjs'/g) || []).length,
  1,
  'one publication run must reconcile scheduled outcomes exactly once',
);
assert.match(
  editionPublisher,
  /'assert-data\.js'[\s\S]*'test\/homepage-feed-contract\.test\.mjs'/,
  'validation must check the one generated edition before it can be certified',
);
assert.doesNotMatch(
  editionPublisher,
  /git show HEAD:data|build-areas|build-companies/,
  'validation must never restore old files or launch a second hidden publication pipeline',
);
assert.equal((happening.match(/node pipeline\/publish-edition\.mjs/g) || []).length, 1,
  'the workflow must invoke exactly one publication coordinator');
assert.doesNotMatch(
  happening,
  /node (?:pipeline\/)?(?:collect-news|build-happening|build-brief|reconcile-scheduled-events|translate-es|assert-data|write-publication-status)/,
  'the workflow must not duplicate editorial stages outside the one edition command',
);
assert.doesNotMatch(happening, /record-publication-block|clear-publication-block|ops\/publication-block/,
  'publication failure state must not live in a second circuit-breaker file');
assert.match(
  happening,
  /if \[ "\$PUBLICATION_STATE" = "published" \]; then[\s\S]*elif \[ "\$PUBLICATION_STATE" = "deferred" \] && \[ "\$STAGING_SAFE" = "true" \]; then[\s\S]*else\s+git add data\/publication-status\.json data\/llm-spend\.json/,
  'only a fully assessed deferral may persist its reusable news staging; a blocked run must commit no partial editorial data',
);
assert.match(editionPublisher, /const priorAttempt = priorTerminalAnalysisAttempt[\s\S]*if \(priorAttempt\)[\s\S]*else node\('Explain ranked stories'/,
  'an unchanged explanation failure must skip repeat spend without blocking the factual edition');
assert.doesNotMatch(editionPublisher, /requireSelectedExplanations|Briefly Explained is not ready/,
  'optional analysis must not be a publication gate');
assert.doesNotMatch(receiptWriter, /throw new Error\(`Briefly Explained incomplete/,
  'the publication receipt must report explanation coverage without requiring it');
const lockedBrief = { meta: { selection: { lockedIds: ['lead'] } } };
assert.match(
  priorTerminalAnalysisAttempt(lockedBrief, { meta: { analysisTarget: {
    ids: ['lead'], outcomes: [{ id: 'lead', ready: false, reason: 'budget-unavailable' }],
  } } }),
  /complete panel \(budget-unavailable\)/,
  'the exact locked story must not repeat a known terminal model attempt',
);
assert.equal(
  priorTerminalAnalysisAttempt(lockedBrief, { meta: { analysisTarget: {
    ids: ['different'], outcomes: [{ id: 'different', ready: false, reason: 'field-rejected' }],
  } } }),
  '',
  'new reporting and a new story selection must receive a fresh explanation attempt',
);
assert.match(
  happening,
  /git add[^\n]*data\/news\/[^\n]*data\/event-status\.json[^\n]*data\/brief\.json[^\n]*data\/publication-status\.json/,
  'the publication commit must contain the refreshed wire, scheduled-outcome audit, brief, and receipt together',
);
assert.match(
  happening,
  /git push origin HEAD:main[\s\S]*node pipeline\/verify-production\.mjs/,
  'publication is not successful until the exact edition is verified on production',
);
assert.match(
  productionVerifier,
  /status\.publicationId !== EXPECTED_ID[\s\S]*status\.editorialDate !== EXPECTED_DATE[\s\S]*SLOT_RANK\[status\.slot\]/,
  'production verification must match the exact receipt id, date, and edition rank',
);
assert.match(
  productionVerifier,
  /\['exact-day-plus-carryover-v1', 'weekend-recap-v1'\]\.includes\(selectionPolicy\)[\s\S]*get\('\/data\/event-status\.json'\)[\s\S]*blockers/,
  'production verification must require the ranking receipt and a blocker-free scheduled-outcome audit',
);
// The homepage stopped carrying a data-editorial-date attribute in the 2026-08-02
// rebuild; the edition's date is now rendered in the dateline. The guarantee is the same:
// the verifier must confirm the date in the served brief AND in the page a reader sees,
// not just in the receipt.
assert.match(
  productionVerifier,
  /brief\.meta\?\.editorialDate !== EXPECTED_DATE[\s\S]*get\('\/', 'text'\)[\s\S]*homepage\.includes\(longDate\)/,
  'production verification must match the edition date in both the live brief and rendered homepage',
);
assert.match(
  happening,
  /steps\.live\.outcome == 'failure'[\s\S]*git commit --allow-empty[\s\S]*git push origin HEAD:main[\s\S]*node pipeline\/verify-production\.mjs/,
  'a stale production deployment must be retriggered once and verified again',
);
assert.match(
  refresh,
  /node pipeline\/sync-brief-standing\.js[\s\S]*node pipeline\/assert-data\.js/,
  'a data refresh must synchronize the brief fallback readings before publication validation',
);
assert.match(syncFreshness, /if \(!fs\.existsSync\(dir\)\) continue/,
  'retiring an optional data directory must not break the homepage refresh');

const requiredWriterWorkflowNames = [
  'happening.yml',
  'refresh.yml',
];
const discoveredWriterWorkflows = fs.readdirSync(workflowDir)
  .filter((name) => name.endsWith('.yml') && /contents:\s*write/.test(workflow(name)))
  .sort();
for (const name of requiredWriterWorkflowNames) {
  assert.ok(discoveredWriterWorkflows.includes(name), `${name} must retain repository write access`);
}
for (const name of discoveredWriterWorkflows) {
  const source = workflow(name);
  assert.match(source, /permissions:[\s\S]*?contents:\s*write/, `${name} must declare repository write access`);
  assert.match(
    source,
    /uses:\s*actions\/checkout@v\d+[\s\S]*?with:\s*\n\s*ref:\s*main/,
    `${name} must check out the latest main branch after acquiring the production lock`,
  );
  assert.match(
    source,
    /concurrency:\s*\n\s*group:\s*mexico-brief-production-write\s*\n\s*cancel-in-progress:\s*false/,
    `${name} must serialize its writes through the common production lock`,
  );
  assert.doesNotMatch(
    source,
    /git pull[^\n]*(?:2>\/dev\/null|\|\|\s*true)/,
    `${name} must not hide a pull/rebase failure before pushing`,
  );
}

for (const name of ['refresh.yml']) {
  assert.match(
    workflow(name),
    /git commit -m "\[CF-Pages-Skip\]/,
    `${name} is a background refresh and must not trigger a full Pages deployment`,
  );
}
assert.doesNotMatch(happening, /\[CF-Pages-Skip\] editorial checkpoint:/,
  'the Brief must have one atomic publication commit, not intermediate public-data commits');
assert.doesNotMatch(
  happening.match(/- name: Commit the one publication result[\s\S]*?(?=\n      - name: Report a code or infrastructure block once)/)?.[0] || '',
  /\[CF-Pages-Skip\]/,
  'the final editorial publication must still trigger production deployment',
);
assert.doesNotMatch(refresh, /ANTHROPIC_API_KEY|write-context\.mjs|translate-es\.mjs|translate-wire\.mjs/,
  'background refreshes must not spend the daily Brief model allowance');

assert.match(
  publicationFallback,
  /workflow_dispatch:\s*\{\}/,
  'the repository recovery console must remain available on demand',
);
assert.doesNotMatch(publicationFallback, /\n\s*schedule:|\n\s*workflow_run:|\n\s*push:/,
  'the Cloudflare watchdog must be the only automatic recovery loop');
assert.match(watchdogRunOnce, /runWatchdog\(process\.env, new Date\(\)\)/,
  'the GitHub fallback must decide from the public production receipt');
assert.doesNotMatch(watchdogRunOnce, /PUBLICATION_STATUS_JSON|data\/publication-status\.json/,
  'a repository receipt must never hide a stale Pages deployment from recovery');
assert.match(
  publicationFallback,
  /permissions:[\s\S]*?actions:\s*write/,
  'the repository fallback must be allowed to dispatch the publication workflow',
);
assert.match(
  publicationFallback,
  /node pipeline\/verify-watchdog-health\.mjs[\s\S]*node ops\/publication-watchdog\/run-once\.mjs/,
  'the repository fallback must verify the independent control plane before running its own recovery decision',
);
assert.match(
  publicationFallback,
  /WATCHDOG_HEALTH_URL:\s*https:\/\/mexico-brief-publication-watchdog\.alanlacroix94\.workers\.dev\/health/,
  'the production audit must target the deployed Worker directly, not an optional unset variable',
);
assert.match(
  publicationFallback,
  /Publication control plane is unhealthy[\s\S]*state:\s*'closed'/,
  'a broken safeguard must stay visible as an incident until both controls recover',
);
assert.match(
  publicationFallback,
  /id:\s*incident[\s\S]*new_incident[\s\S]*steps\.incident\.outputs\.new_incident == 'true'/,
  'the fallback must email once per incident instead of failing every repeated audit',
);

console.log('automation-contract tests: ok');
