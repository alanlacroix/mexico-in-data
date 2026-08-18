import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import briefReadinessPolicy from './lib/brief-readiness.cjs';
import { publicationReadiness } from './check-publication-readiness.mjs';

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

const happening = JSON.parse(fs.readFileSync(happeningPath, 'utf8'));
const attemptedBrief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
const attempted = publicationReadiness(attemptedBrief, editorialDate);
const contentEditorialDate = prior.contentEditorialDate || prior.editorialDate || null;
const curation = happening.meta?.curation || null;
// The same assessed source universe is a true no-op. When new reporting changes the
// candidate signature, persist the new checkpoint once so the next hourly runner can
// distinguish "nothing changed" from "new articles need review" without publishing
// partial editorial files.
if (prior.state === 'deferred' && prior.editorialDate === editorialDate && prior.slot === slot
    && prior.curation?.candidateSig && prior.curation.candidateSig === curation?.candidateSig
    && Number(prior.selectedStories) === attempted.storyCount) {
  console.log(`publication deferral already records this candidate set: ${editorialDate} ${slot}`);
  process.exit(0);
}
const status = {
  schemaVersion: 1,
  state: 'deferred',
  editorialDate,
  contentEditorialDate,
  slot,
  publicationId: `deferred-${editorialDate}-${slot}`,
  generatedAt: new Date().toISOString(),
  reason: `${attempted.reason}. The last complete edition remains live while the hourly workflow retries.`,
  priorPublicationId: prior.publicationId || null,
  selectedStories: attempted.storyCount,
  storyLanes: attemptedBrief.meta?.selection?.lanes || null,
  curation,
  explanations: briefReadiness(attemptedBrief),
  workflowRunId: process.env.GITHUB_RUN_ID || null,
  workflowRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT || 1),
};

fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);
console.log(`publication deferred: ${editorialDate} ${slot}; content remains ${contentEditorialDate || 'last complete edition'}`);
