import assert from 'node:assert/strict';
import priority from '../lib/candidate-priority.cjs';

const { attentionSignal, decisionCoverage, prioritizeCandidates } = priority;

const recurring = Array.from({ length: 60 }, (_, index) => ({
  id: `replay-${index}`,
  published_at: `2026-08-07T${String(23 - (index % 20)).padStart(2, '0')}:00:00Z`,
  _alreadyPublished: true,
}));
const unseen = { id: 'unseen', published_at: '2026-08-07T12:00:00Z', _alreadyPublished: false };
const scheduled = {
  id: 'scheduled-outcome',
  published_at: '2026-08-06T19:40:00Z',
  _alreadyPublished: true,
  _scheduled: { id: 'stable-obligation' },
};
const ranked = prioritizeCandidates([...recurring, unseen, scheduled]);
assert.equal(ranked[0].id, 'scheduled-outcome', 'a scheduled outcome must survive a curator input cap even when older and already seen');
assert.equal(ranked[1].id, 'unseen', 'new reporting must precede recurring stories already represented in the log');
assert.ok(ranked.slice(0, 24).some((candidate) => candidate.id === 'scheduled-outcome'), 'the scheduled outcome must remain inside the exhaustive 24-item batch');
assert.equal(prioritizeCandidates([unseen, scheduled]).length, 2, 'priority sorting must not mutate or discard candidates');

const routineMorning = Array.from({ length: 60 }, (_, index) => ({
  id: `routine-${index}`,
  title: index % 2 ? 'How to save on school supplies this weekend' : 'Weather in Mexico this Sunday',
  published_at: `2026-08-09T${String(13 - (index % 12)).padStart(2, '0')}:00:00Z`,
  _alreadyPublished: false,
}));
const priorEveningChange = {
  id: 'avocado-inspections-resume',
  title: 'Estados Unidos reanuda inspecciones de aguacate en Michoacán tras acuerdo de seguridad',
  published_at: '2026-08-08T21:36:00Z',
  _alreadyPublished: false,
};
const busyMorning = prioritizeCandidates([...routineMorning, priorEveningChange]);
assert.equal(busyMorning[0].id, 'avocado-inspections-resume',
  'newer routine volume must not crowd an older policy or trade state change out before scoring');
assert.ok(busyMorning.slice(0, 24).some((candidate) => candidate.id === priorEveningChange.id),
  'a likely state change must survive the exhaustive curator batch');
assert.equal(attentionSignal(priorEveningChange), 2, 'the attention rule should recognize both a state change and public consequence');
assert.equal(attentionSignal(routineMorning[0]), -1, 'obviously routine coverage should use the remaining attention slots');

assert.deepEqual(decisionCoverage(3, [{ i: 2 }, { i: 0 }, { i: 1 }]), {
  ok: true, missing: [], duplicates: [], invalid: [],
}, 'curation may return decisions in any order when every candidate is covered exactly once');
assert.deepEqual(decisionCoverage(3, [{ i: 0 }, { i: 0 }, { i: 4 }]), {
  ok: false, missing: [1, 2], duplicates: [0], invalid: [4],
}, 'a missing, duplicate, or out-of-range decision must fail the exhaustive curation contract');

console.log('candidate-priority tests: ok');
