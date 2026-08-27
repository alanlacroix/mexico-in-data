import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import briefReadinessPolicy from './lib/brief-readiness.cjs';
import freshnessContract from './lib/freshness-contract.cjs';
import { publicationReadiness } from './check-publication-readiness.mjs';

const require = createRequire(import.meta.url);
const { PIPELINE_VERSION } = require('./lib/edition-contract.cjs');
const { nonPublishedTransition } = require('./lib/publication-transition.cjs');
const { briefReadiness } = briefReadinessPolicy;
const { curationReadiness } = freshnessContract;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statusPath = path.join(ROOT, 'data', 'publication-status.json');
const briefPath = path.join(ROOT, 'data', 'brief.json');
const happeningPath = path.join(ROOT, 'data', 'happening.json');
const eventStatusPath = path.join(ROOT, 'data', 'event-status.json');

const slot = process.env.PUBLICATION_SLOT;
const editorialDate = process.env.PUBLICATION_DATE;
const publicationId = process.env.PUBLICATION_ID;
const deployAttempt = Number(process.env.DEPLOY_ATTEMPT || 1);
const state = process.env.PUBLICATION_STATE || 'published';
const reason = String(process.env.PUBLICATION_REASON || '').trim();
const publicationNow = process.env.PUBLICATION_NOW_ISO
  ? new Date(process.env.PUBLICATION_NOW_ISO) : new Date();

if (slot !== 'morning') throw new Error(`Invalid publication slot: ${slot || '(missing)'}`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(editorialDate || '')) throw new Error(`Invalid publication date: ${editorialDate || '(missing)'}`);
if (!publicationId) throw new Error('PUBLICATION_ID is required');
if (!['published', 'deferred', 'blocked'].includes(state)) throw new Error(`Invalid publication state: ${state}`);

// One receipt owns publication coordination. A content deferral keeps retrying on the
// normal hourly schedule; a code/infrastructure block stops automatic retries until a
// forced recovery. Neither state may certify the partially generated files in this
// worktree as public content, so both retain the last published content date.
if (state !== 'published') {
  const prior = (() => {
    try { return JSON.parse(fs.readFileSync(statusPath, 'utf8')); }
    catch { return {}; }
  })();
  const next = {
    schemaVersion: 1,
    pipelineVersion: PIPELINE_VERSION,
    state,
    editorialDate,
    contentEditorialDate: prior.contentEditorialDate || prior.editorialDate || null,
    slot,
    publicationId,
    deployAttempt,
    generatedAt: new Date().toISOString(),
    contentGeneratedAt: prior.contentGeneratedAt || prior.briefGeneratedAt || prior.generatedAt || null,
    reason: reason || (state === 'deferred'
      ? 'a complete edition is not ready yet'
      : 'publication failed before a valid edition was produced'),
    workflowRunId: process.env.GITHUB_RUN_ID || null,
    workflowRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT || 1),
  };
  // Keep a complete factual edition live if a later optional refresh fails. An empty
  // morning edition is only provisional: if the noon review finds unresolved news,
  // retaining that receipt would keep asserting that nothing happened after we know
  // that claim is no longer supportable.
  const transition = nonPublishedTransition(prior, next);
  const { status } = transition;
  fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);
  console.log(`publication receipt: ${editorialDate} ${slot} ${status.publicationId || publicationId} ${status.state || 'published'}${transition.retained ? ' (retained)' : ''}`);
  process.exit(0);
}

const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
const happening = JSON.parse(fs.readFileSync(happeningPath, 'utf8'));
const eventStatus = JSON.parse(fs.readFileSync(eventStatusPath, 'utf8'));
const curation = happening.meta?.curation;
const freshness = curationReadiness(curation, editorialDate);
if (!freshness.ok) throw new Error(`Fresh-story curation incomplete for ${editorialDate}: ${freshness.reason}`);
const explanationReadiness = briefReadiness(brief);
const selectedStories = [brief.lead, ...(brief.items || [])].filter(Boolean).length;
const contentReadiness = publicationReadiness(brief, editorialDate, { curation });
if (!contentReadiness.publish) {
  throw new Error(`Refusing to certify this Brief: ${contentReadiness.reason}`);
}
if (brief.meta?.editorialDate !== editorialDate) {
  throw new Error(`Brief editorial date ${brief.meta?.editorialDate || '(missing)'} does not match ${editorialDate}`);
}

const status = {
  schemaVersion: 1,
  pipelineVersion: PIPELINE_VERSION,
  state: 'published',
  editorialDate,
  contentEditorialDate: editorialDate,
  slot,
  publicationId,
  deployAttempt,
  generatedAt: publicationNow.toISOString(),
  briefGeneratedAt: brief.meta?.generatedAt || null,
  briefReviewedAt: brief.meta?.reviewedAt || null,
  selectionPolicy: brief.meta?.selection?.policy || null,
  selectionCandidates: Array.isArray(brief.meta?.selection?.receipt) ? brief.meta.selection.receipt.length : 0,
  selectedStories,
  quiet: brief.meta?.quiet === true,
  quietFinal: brief.meta?.quiet === true && Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23',
  }).format(publicationNow)) >= 12,
  storyLanes: brief.meta?.selection?.lanes || { today: 0, keyDevelopments: 0, total: 0 },
  curation,
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
