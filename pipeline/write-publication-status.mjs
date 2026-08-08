import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import briefReadinessPolicy from './lib/brief-readiness.cjs';

const { briefReadiness } = briefReadinessPolicy;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statusPath = path.join(ROOT, 'data', 'publication-status.json');
const briefPath = path.join(ROOT, 'data', 'brief.json');
const eventStatusPath = path.join(ROOT, 'data', 'event-status.json');

const slot = process.env.PUBLICATION_SLOT;
const editorialDate = process.env.PUBLICATION_DATE;
const publicationId = process.env.PUBLICATION_ID;
const deployAttempt = Number(process.env.DEPLOY_ATTEMPT || 1);

if (slot !== 'morning') throw new Error(`Invalid publication slot: ${slot || '(missing)'}`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(editorialDate || '')) throw new Error(`Invalid publication date: ${editorialDate || '(missing)'}`);
if (!publicationId) throw new Error('PUBLICATION_ID is required');

const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
const eventStatus = JSON.parse(fs.readFileSync(eventStatusPath, 'utf8'));
const explanationReadiness = briefReadiness(brief);
if (!explanationReadiness.ok) {
  throw new Error(`Briefly Explained is not ready for ${explanationReadiness.missingRequired.join(', ')}`);
}
if (brief.meta?.editorialDate !== editorialDate) {
  throw new Error(`Brief editorial date ${brief.meta?.editorialDate || '(missing)'} does not match ${editorialDate}`);
}

const status = {
  schemaVersion: 1,
  editorialDate,
  slot,
  publicationId,
  deployAttempt,
  generatedAt: new Date().toISOString(),
  briefGeneratedAt: brief.meta?.generatedAt || null,
  briefReviewedAt: brief.meta?.reviewedAt || null,
  selectionPolicy: brief.meta?.selection?.policy || null,
  selectionCandidates: Array.isArray(brief.meta?.selection?.receipt) ? brief.meta.selection.receipt.length : 0,
  selectedStories: [brief.lead, ...(brief.items || [])].filter(Boolean).length,
  explanations: explanationReadiness,
  scheduledOutcomes: {
    checkedAt: eventStatus.meta?.checkedAt || null,
    blockers: Number(eventStatus.meta?.blockers) || 0,
    pending: (eventStatus.outcomes || []).filter((outcome) => outcome.status === 'pending').length,
  },
  workflowRunId: process.env.GITHUB_RUN_ID || null,
  workflowRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT || 1),
};

fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);
console.log(`publication receipt: ${editorialDate} ${slot} ${publicationId} attempt ${deployAttempt}`);
