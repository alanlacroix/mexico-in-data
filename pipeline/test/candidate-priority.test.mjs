import assert from 'node:assert/strict';
import priority from '../lib/candidate-priority.cjs';

const { prioritizeCandidates } = priority;

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
assert.ok(ranked.slice(0, 50).some((candidate) => candidate.id === 'scheduled-outcome'), 'the scheduled outcome must remain inside a 50-item cap');
assert.equal(prioritizeCandidates([unseen, scheduled]).length, 2, 'priority sorting must not mutate or discard candidates');

console.log('candidate-priority tests: ok');
