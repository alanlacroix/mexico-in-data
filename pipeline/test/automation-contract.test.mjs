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
const refresh = workflow('refresh.yml');
const happening = workflow('happening.yml');
const sesnsp = workflow('refresh-sesnsp.yml');

const alertWrite = 'fs.writeFileSync(ALERTS, JSON.stringify(alerts, null, 2));';
assert.equal(run.split(alertWrite).length - 1, 1, 'the current alert ledger must be written exactly once');
assert.ok(
  run.indexOf(alertWrite) < run.indexOf('if (alerts.length)'),
  'the alert ledger must be replaced before the non-empty reporting branch',
);
assert.match(run, /if \(only && records\.some\(\(record\) => record\.status === 'failed'\)\)/, 'a scoped connector failure must make its workflow step fail');

assert.match(
  happening,
  /cron:\s*'7,37 13,14 \* \* \*'[\s\S]*cron:\s*'22,52 21,22 \* \* \*'/,
  'the editorial workflow must get two chances in both possible UTC hours for each edition',
);
assert.match(
  happening,
  /node pipeline\/editorial-gate\.mjs/,
  'every redundant schedule must pass through the receipt-aware editorial gate',
);
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
  happening,
  /node build-news\.js[\s\S]*node collect-news\.js[\s\S]*node build-happening\.js[\s\S]*node build-brief\.js/,
  'each editorial pass must refresh the news wire before reconsidering the brief',
);
assert.match(
  happening,
  /git add[^\n]*data\/news\.json[^\n]*data\/brief\.json[^\n]*data\/publication-status\.json/,
  'the publication commit must contain the refreshed wire, brief, and receipt together',
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
  /brief\.meta\?\.editorialDate !== EXPECTED_DATE[\s\S]*get\('\/', 'text'\)[\s\S]*data-editorial-date/,
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

const requiredWriterWorkflowNames = [
  'happening.yml',
  'record-published-email.yml',
  'refresh-imss.yml',
  'refresh-sesnsp.yml',
  'refresh.yml',
  'weekly-read.yml',
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

for (const name of ['refresh.yml', 'refresh-imss.yml', 'refresh-sesnsp.yml', 'weekly-read.yml']) {
  assert.match(
    workflow(name),
    /git commit -m "\[CF-Pages-Skip\]/,
    `${name} is a background refresh and must not trigger a full Pages deployment`,
  );
}
assert.doesNotMatch(happening, /\[CF-Pages-Skip\]/, 'an editorial publication must trigger production deployment');

assert.match(sesnsp, /cron:\s*'35 15 21 \* \*'/, 'SESNSP must refresh after the stated day-20 publication deadline');
assert.match(sesnsp, /ENABLE_SESNSP:\s*'1'/, 'the SESNSP monthly job must explicitly open the heavy-source gate');
assert.match(sesnsp, /run\.js --only sesnsp-delitos/, 'the SESNSP monthly job must remain scoped to its connector');
assert.match(sesnsp, /assert-connector\.mjs sesnsp-delitos --max-age-days 45/, 'a failed or publication-late SESNSP run must block its commit');
assert.match(sesnsp, /git add data\/layers\/sesnsp-delitos\.json data\/health\.json/, 'the monthly job may commit only its layer and merged health record');

console.log('automation-contract tests: ok');
