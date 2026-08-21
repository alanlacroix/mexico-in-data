import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HAPPENING_PATH = path.join(ROOT, 'data', 'happening.json');
const EVENT_STATUS_PATH = path.join(ROOT, 'data', 'event-status.json');
const OUT = path.join(ROOT, 'ops', 'publication-block.json');
const editorialDate = process.env.PUBLICATION_DATE || '';

if (!/^\d{4}-\d{2}-\d{2}$/.test(editorialDate)) {
  throw new Error(`PUBLICATION_DATE is invalid: ${editorialDate || '(missing)'}`);
}

let happening = null;
try { happening = JSON.parse(fs.readFileSync(HAPPENING_PATH, 'utf8')); } catch { /* generic failure */ }
let eventStatus = null;
try { eventStatus = JSON.parse(fs.readFileSync(EVENT_STATUS_PATH, 'utf8')); } catch { /* generic failure */ }
const scheduledBlockers = (Array.isArray(eventStatus?.outcomes) ? eventStatus.outcomes : [])
  .filter((outcome) => outcome?.hardBlock === true || outcome?.status === 'missing')
  .map((outcome) => String(outcome?.label || outcome?.id || '').trim())
  .filter(Boolean);
const outcomes = Array.isArray(happening?.meta?.analysisTarget?.outcomes)
  ? happening.meta.analysisTarget.outcomes
  : [];
const reasons = [...new Set(outcomes
  .filter((outcome) => outcome?.ready !== true)
  .map((outcome) => String(outcome?.reason || '').trim())
  .filter(Boolean))];
const reason = scheduledBlockers.length
  ? `scheduled outcome missing: ${scheduledBlockers.join(', ')}`
  : reasons.length
    ? `selected-story explanation blocked: ${reasons.join(', ')}`
    : 'publication workflow failed before a valid receipt was written';

const block = {
  schemaVersion: 1,
  editorialDate,
  reason,
  publicationId: process.env.PUBLICATION_ID || '',
  workflowRunId: process.env.GITHUB_RUN_ID || '',
  workflowRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT || 1),
  recordedAt: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(block, null, 2)}\n`);
console.log(`publication circuit breaker recorded for ${editorialDate}: ${reason}`);
