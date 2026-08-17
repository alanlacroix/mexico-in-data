import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import briefReadinessPolicy from './lib/brief-readiness.cjs';

const { briefReadiness } = briefReadinessPolicy;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statusPath = path.join(ROOT, 'data', 'publication-status.json');
const happeningPath = path.join(ROOT, 'data', 'happening.json');
const briefPath = path.join(ROOT, 'data', 'brief.json');

const slot = process.env.PUBLICATION_SLOT;
const editorialDate = process.env.PUBLICATION_DATE;
if (slot !== 'morning') throw new Error(`Invalid publication slot: ${slot || '(missing)'}`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(editorialDate || '')) throw new Error(`Invalid publication date: ${editorialDate || '(missing)'}`);

let prior = {};
try { prior = JSON.parse(fs.readFileSync(statusPath, 'utf8')); } catch { /* first run */ }

// The same hourly result should be a no-op: one status commit and one deployment
// are enough while the workflow keeps checking privately for a complete edition.
if (prior.state === 'deferred' && prior.editorialDate === editorialDate && prior.slot === slot) {
  console.log(`publication deferral already recorded: ${editorialDate} ${slot}`);
  process.exit(0);
}

const happening = JSON.parse(fs.readFileSync(happeningPath, 'utf8'));
const attemptedBrief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
const contentEditorialDate = prior.contentEditorialDate || prior.editorialDate || null;
const status = {
  schemaVersion: 1,
  state: 'deferred',
  editorialDate,
  contentEditorialDate,
  slot,
  publicationId: `deferred-${editorialDate}-${slot}`,
  generatedAt: new Date().toISOString(),
  reason: 'No complete replacement Brief was ready. The last complete edition remains live while the hourly workflow retries.',
  priorPublicationId: prior.publicationId || null,
  selectedStories: 0,
  curation: happening.meta?.curation || null,
  explanations: briefReadiness(attemptedBrief),
  workflowRunId: process.env.GITHUB_RUN_ID || null,
  workflowRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT || 1),
};

fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);
console.log(`publication deferred: ${editorialDate} ${slot}; content remains ${contentEditorialDate || 'last complete edition'}`);
