import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = fs.readFileSync(path.join(root, 'pipeline', 'run.js'), 'utf8');
const refresh = fs.readFileSync(path.join(root, '.github', 'workflows', 'refresh.yml'), 'utf8');
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
  /cron:\s*'0 13,14 \* \* \*'[\s\S]*cron:\s*'15 21,22 \* \* \*'/,
  'the editorial workflow must have deliberate morning and afternoon schedules',
);
assert.match(
  happening,
  /TZ=America\/New_York date \+%H[\s\S]*slot=morning[\s\S]*"09"[\s\S]*slot=afternoon[\s\S]*"17"/,
  'the editorial windows must remain 9 AM and 5 PM Eastern across daylight-saving changes',
);
assert.match(
  happening,
  /node build-news\.js[\s\S]*node collect-news\.js[\s\S]*node build-happening\.js[\s\S]*node build-brief\.js/,
  'each editorial pass must refresh the news wire before reconsidering the brief',
);
assert.match(
  happening,
  /git add data\/news\.json data\/news\/ data\/happening\.json data\/brief\.json/,
  'an afternoon news check must commit its refreshed wire with the brief',
);
assert.match(
  refresh,
  /node pipeline\/sync-brief-standing\.js[\s\S]*node pipeline\/assert-data\.js/,
  'a data refresh must synchronize the brief fallback readings before publication validation',
);

assert.match(sesnsp, /cron:\s*'35 15 21 \* \*'/, 'SESNSP must refresh after the stated day-20 publication deadline');
assert.match(sesnsp, /ENABLE_SESNSP:\s*'1'/, 'the SESNSP monthly job must explicitly open the heavy-source gate');
assert.match(sesnsp, /run\.js --only sesnsp-delitos/, 'the SESNSP monthly job must remain scoped to its connector');
assert.match(sesnsp, /assert-connector\.mjs sesnsp-delitos --max-age-days 45/, 'a failed or publication-late SESNSP run must block its commit');
assert.match(sesnsp, /git add data\/layers\/sesnsp-delitos\.json data\/health\.json/, 'the monthly job may commit only its layer and merged health record');

console.log('automation-contract tests: ok');
