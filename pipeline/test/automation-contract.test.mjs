import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = fs.readFileSync(path.join(root, 'pipeline', 'run.js'), 'utf8');
const happening = fs.readFileSync(path.join(root, '.github', 'workflows', 'happening.yml'), 'utf8');
const sesnsp = fs.readFileSync(path.join(root, '.github', 'workflows', 'refresh-sesnsp.yml'), 'utf8');

const alertWrite = 'fs.writeFileSync(ALERTS, JSON.stringify(alerts, null, 2));';
assert.equal(run.split(alertWrite).length - 1, 1, 'the current alert ledger must be written exactly once');
assert.ok(
  run.indexOf(alertWrite) < run.indexOf('if (alerts.length)'),
  'the alert ledger must be replaced before the non-empty reporting branch',
);
assert.match(run, /if \(only && records\.some\(\(record\) => record\.status === 'failed'\)\)/, 'a scoped connector failure must make its workflow step fail');

assert.match(
  happening,
  /cron:\s*'57 0,6,12,18 \* \* \*'/,
  'the happening job must run 40 minutes after the six-hour refresh slots',
);

assert.match(sesnsp, /cron:\s*'35 15 21 \* \*'/, 'SESNSP must refresh after the stated day-20 publication deadline');
assert.match(sesnsp, /ENABLE_SESNSP:\s*'1'/, 'the SESNSP monthly job must explicitly open the heavy-source gate');
assert.match(sesnsp, /run\.js --only sesnsp-delitos/, 'the SESNSP monthly job must remain scoped to its connector');
assert.match(sesnsp, /assert-connector\.mjs sesnsp-delitos --max-age-days 45/, 'a failed or publication-late SESNSP run must block its commit');
assert.match(sesnsp, /git add data\/layers\/sesnsp-delitos\.json data\/health\.json/, 'the monthly job may commit only its layer and merged health record');

console.log('automation-contract tests: ok');
