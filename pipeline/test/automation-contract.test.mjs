import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflowDir = path.join(root, '.github', 'workflows');
const workflow = (name) => fs.readFileSync(path.join(workflowDir, name), 'utf8');
const run = fs.readFileSync(path.join(root, 'pipeline', 'run.js'), 'utf8');
const receiptWriter = fs.readFileSync(path.join(root, 'pipeline', 'write-publication-status.mjs'), 'utf8');
const productionVerifier = fs.readFileSync(path.join(root, 'pipeline', 'verify-production.mjs'), 'utf8');
const editorialGate = fs.readFileSync(path.join(root, 'pipeline', 'editorial-gate.mjs'), 'utf8');
const syncFreshness = fs.readFileSync(path.join(root, 'pipeline', 'sync-freshness.js'), 'utf8');
const refresh = workflow('refresh.yml');
const happening = workflow('happening.yml');
const publicationFallback = workflow('publication-fallback.yml');
const watchdogRunOnce = fs.readFileSync(path.join(root, 'ops', 'publication-watchdog', 'run-once.mjs'), 'utf8');
const collectorBlock = happening.match(
  /- name: Refresh the news ledger[\s\S]*?(?=\n      - name: Build the event log)/,
)?.[0] || '';
const validationBlock = happening.match(
  /- name: Validate generated editorial claims[\s\S]*?(?=\n      - name: Write this edition's publication receipt)/,
)?.[0] || '';
const blockedPublicationBlock = happening.match(
  /- name: Record a blocked publication once[\s\S]*?(?=\n      - name: Commit and push the edition once)/,
)?.[0] || '';

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
// the receipt-aware gate decides. The gate has one morning state; there is no second
// slot, publisher-on-push path, or wall-clock shell branch to drift independently.
assert.match(
  happening,
  /cron:\s*'\d+ \* \* \* \*'/,
  'the edition must attempt hourly, because the cron minute cannot be relied on',
);
assert.doesNotMatch(happening, /\n  push:/,
  'editing the publisher must not launch a receipt-gated no-op publication run');
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
assert.match(editorialGate, /BLOCK_PATH[\s\S]*recordedBlock[\s\S]*terminalBlock/,
  'hourly schedules must stop after a recorded publication failure instead of producing repeated emails');
assert.match(collectorBlock, /node collect-news\.js/,
  'the core news collector must run before publication');
assert.doesNotMatch(collectorBlock, /continue-on-error/,
  'a catastrophic collector failure must stop publication instead of looking green');
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
  /node pipeline\/write-publication-status\.mjs[\s\S]*git add[^\n]*data\/publication-status\.json/,
  'the exact edition receipt must be committed with the generated brief',
);
assert.match(
  receiptWriter,
  /brief\.meta\?\.editorialDate !== editorialDate/,
  'a publication receipt must refuse to certify a brief from another editorial day',
);
assert.match(
  receiptWriter,
  /curationReadiness\(curation, editorialDate\)[\s\S]*Fresh-story curation incomplete/,
  'a publication receipt must refuse to certify a date whose fresh candidates were not fully assessed',
);
assert.match(
  happening,
  /node collect-news\.js[\s\S]*node build-happening\.js[\s\S]*node reconcile-scheduled-events\.mjs[\s\S]*node build-brief\.js/,
  'each editorial pass must refresh the primary RSS ledger before reconsidering the brief',
);
assert.doesNotMatch(happening, /node build-news\.js/,
  'the flaky optional GDELT supplement belongs in the background refresh, not the publication path');
assert.match(
  happening,
  /node build-happening\.js --skip-analysis --resume-current-edition[\s\S]*node build-brief\.js --selection-only[\s\S]*node build-happening\.js --analysis-for-brief[\s\S]*node build-brief\.js/,
  'the workflow must lock the ranked stories before spending the explanation budget on those exact stories',
);
assert.doesNotMatch(happening, /Checkpoint the assessed news|Checkpoint the locked selection|editorial checkpoint:/,
  'intermediate public-data commits must not leave main in a half-built editorial state');
assert.match(
  happening,
  /Build the homepage brief[\s\S]*Require a complete English Brief before optional translation[\s\S]*Translate the new edition for \/es\/[\s\S]*Translate new topic stories after the Brief/,
  'optional translation must run only after every selected story has a complete explanation',
);
assert.equal(
  (happening.match(/node build-happening\.js --analysis-for-brief/g) || []).length,
  1,
  'one publication run must have exactly one targeted explanation pass',
);
assert.equal(
  (happening.match(/node reconcile-scheduled-events\.mjs/g) || []).length,
  1,
  'one publication run must reconcile scheduled outcomes exactly once',
);
assert.match(
  validationBlock,
  /node pipeline\/assert-data\.js[\s\S]*node pipeline\/test\/homepage-feed-contract\.test\.mjs/,
  'validation must check the one generated edition before it can be certified',
);
assert.doesNotMatch(
  validationBlock,
  /git show HEAD:data|build-happening|build-brief|build-areas|build-companies|ANTHROPIC_API_KEY/,
  'validation must never restore old files or launch a second hidden publication pipeline',
);
assert.match(blockedPublicationBlock, /if: failure\(\)[\s\S]*record-publication-block\.mjs[\s\S]*git add data\/llm-spend\.json ops\/publication-block\.json/,
  'a failed edition must preserve spend and one durable circuit breaker');
assert.doesNotMatch(blockedPublicationBlock, /git add[^\n]*(?:data\/brief|data\/happening|data\/news)/,
  'failure accounting must never publish editorial data from a blocked edition');
assert.ok(
  happening.indexOf('Build and validate the exact production artifact') < happening.indexOf('Record a blocked publication once')
    && happening.indexOf('Record a blocked publication once') < happening.indexOf('Commit and push the edition once'),
  'the circuit breaker must run after every pre-publication gate and before the edition commit',
);
assert.match(happening, /Commit and push the edition once[\s\S]*clear-publication-block\.mjs[\s\S]*git add -u ops\//,
  'a successful atomic publication must clear the prior failure marker');
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
  /steps\.live\.outcome == 'failure'[\s\S]*DEPLOY_ATTEMPT:\s*'2'[\s\S]*git push origin HEAD:main[\s\S]*node pipeline\/verify-production\.mjs/,
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
  happening.match(/- name: Commit and push the edition once[\s\S]*?(?=\n      - name: Require the exact edition to be live)/)?.[0] || '',
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
