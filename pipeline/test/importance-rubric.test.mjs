import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  COMPONENT_KEYS,
  scoreImportance,
  applyScheduledImportanceFloor,
  normalizeModelImportanceRow,
} = require('../lib/importance-rubric.cjs');

assert.deepEqual(COMPONENT_KEYS, [
  'nationalConsequence',
  'usMexicoStakes',
  'modelImpact',
  'durability',
  'officialness',
]);

const normalized = normalizeModelImportanceRow({
  title: 'A model-supplied candidate',
  importance: 10,
  importanceComponents: {
    nationalConsequence: 9,
    usMexicoStakes: -4,
    modelImpact: '1',
    durability: 'not-a-score',
    officialness: 1.6,
  },
});
assert.equal(normalized.importance, 5, 'code must sum normalized components instead of trusting the model total');
assert.deepEqual(normalized.importanceComponents, {
  nationalConsequence: 2,
  usMexicoStakes: 0,
  modelImpact: 1,
  durability: 0,
  officialness: 2,
});
assert.equal(normalized.importanceProvenance.reportedTotal, 10, 'the rejected model total must remain auditable');
assert.equal(normalized.importanceProvenance.calculatedTotal, 5);
assert.equal(normalized.importanceProvenance.components.nationalConsequence.status, 'clamped');
assert.equal(normalized.importanceProvenance.components.usMexicoStakes.status, 'clamped');
assert.equal(normalized.importanceProvenance.components.modelImpact.status, 'coerced');
assert.equal(normalized.importanceProvenance.components.durability.status, 'invalid-defaulted');
assert.equal(normalized.importanceProvenance.components.officialness.status, 'rounded');

const unchangedOutcome = applyScheduledImportanceFloor(scoreImportance({
  nationalConsequence: 2,
  usMexicoStakes: 0,
  modelImpact: 2,
  durability: 0,
  officialness: 0,
}), {
  id: 'scheduled-policy-decision-2026-08',
  kind: 'decision',
  scheduledFor: '2026-08-06',
  matched: true,
  outcomeObserved: true,
  authoritative: true,
  changed: false,
  outcomeStatus: 'unchanged',
  evidence: {
    source: 'National policy authority',
    url: 'https://authority.example/decision',
    publishedAt: '2026-08-06T19:00:00Z',
  },
});
assert.equal(unchangedOutcome.importanceComponents.durability, 2, 'an unchanged scheduled outcome is still a new durable decision');
assert.equal(unchangedOutcome.importanceComponents.officialness, 2, 'primary scheduled-outcome evidence is official');
assert.equal(unchangedOutcome.importance, 8);
assert.equal(unchangedOutcome.importanceProvenance.scheduledOutcome.isNewOutcome, true);
assert.equal(unchangedOutcome.importanceProvenance.scheduledOutcome.changed, false);
assert.equal(unchangedOutcome.importanceProvenance.scheduledOutcome.outcomeStatus, 'unchanged');

const flooredRelease = normalizeModelImportanceRow({
  importance: 2,
  nationalConsequence: 1,
  usMexicoStakes: 0,
  modelImpact: 0,
  durability: 2,
  officialness: 2,
}, {
  scheduledObligation: {
    id: 'monthly-official-release',
    kind: 'release',
    matched: true,
    outcomeObserved: true,
    authoritative: true,
    outcomeStatus: 'published',
    importanceFloor: 7,
    evidence: {
      source: 'National statistics office',
      url: 'https://statistics.example/releases/monthly',
    },
  },
});
assert.equal(flooredRelease.importanceProvenance.calculatedTotal, 5, 'the component total remains explicit');
assert.equal(flooredRelease.importance, 7, 'an evidence-backed schedule classification may apply its explicit floor');
assert.deepEqual(flooredRelease.importanceProvenance.scheduledOutcome.importanceFloor, {
  requested: 7,
  before: 5,
  after: 7,
  applied: true,
});
assert.equal(flooredRelease.importanceProvenance.scheduledOutcome.evidence.source, 'National statistics office');
assert.equal(flooredRelease.importanceProvenance.scheduledOutcome.evidence.url, 'https://statistics.example/releases/monthly');

const unevidenced = applyScheduledImportanceFloor(scoreImportance({
  nationalConsequence: 1,
  usMexicoStakes: 0,
  modelImpact: 0,
  durability: 0,
  officialness: 0,
}), {
  kind: 'release',
  matched: true,
  outcomeObserved: true,
  authoritative: true,
  importanceFloor: 9,
  evidence: { source: 'Statistics office' },
});
assert.equal(unevidenced.importance, 1, 'a schedule claim without linked evidence must not affect rank');
assert.equal(unevidenced.importanceProvenance.scheduledOutcome.applied, false);
assert.equal(unevidenced.importanceProvenance.scheduledOutcome.reason, 'scheduled-outcome-missing-evidence');

const trustedReport = applyScheduledImportanceFloor(scoreImportance({
  nationalConsequence: 1,
  usMexicoStakes: 0,
  modelImpact: 1,
  durability: 0,
  officialness: 0,
}), {
  id: 'scheduled-release-with-news-report',
  kind: 'release',
  matched: true,
  outcomeObserved: true,
  scheduleAuthoritative: true,
  authoritativeEvidence: false,
  importanceFloor: 7,
  evidence: { source: 'Trusted newspaper', url: 'https://news.example/outcome' },
});
assert.equal(trustedReport.importanceComponents.durability, 2, 'an observed scheduled outcome is durable even when reported second-hand');
assert.equal(trustedReport.importanceComponents.officialness, 0, 'second-hand reporting must not be mislabeled as primary-source evidence');
assert.equal(trustedReport.importance, 7, 'an exact matched obligation may still use its separately audited editorial floor');

const helperSource = require('node:fs').readFileSync(new URL('../lib/importance-rubric.cjs', import.meta.url), 'utf8');
assert.doesNotMatch(helperSource, /banxico/i, 'the scheduled-outcome rule must apply to any authoritative decision or release');

console.log('importance-rubric: ok');
