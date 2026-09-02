import assert from 'node:assert/strict';
import attempts from '../lib/edition-attempts.cjs';

assert.equal(attempts.MAX_MODEL_CALLS, 3);
assert.equal(attempts.dailyLimit('2026-02-02'), 0.214286);
assert.equal(attempts.dailyLimit('2028-02-02'), 0.206897);
assert.equal(attempts.dailyLimit('2026-04-02'), 0.2);
assert.equal(attempts.dailyLimit('2026-05-02'), 0.193548);

let ledger = attempts.beginAttempt({}, {
  editorialDate: '2026-09-02', slot: 'morning', candidateSignature: 'a'.repeat(64), startedAt: '2026-09-02T13:00:00Z',
});
assert.throws(() => attempts.beginAttempt(ledger, {
  editorialDate: '2026-09-02', slot: 'morning', candidateSignature: 'a'.repeat(64), startedAt: '2026-09-02T13:01:00Z',
}), /already attempted/);
ledger = attempts.finishAttempt(ledger, '2026-09-02', 'morning', { state: 'failed', costUSD: 0.05, calls: 2 });
assert.equal(attempts.dateSpend(ledger, '2026-09-02'), 0.05);
assert.equal(attempts.sameSignatureNoonNoop(ledger, '2026-09-02', 'a'.repeat(64), 'b'.repeat(64)), false,
  'a failed morning must get its bounded noon recovery even when sources are unchanged');
assert.equal(attempts.sameSignatureNoonNoop(ledger, '2026-09-02', 'b'.repeat(64)), false);
ledger = attempts.finishAttempt(ledger, '2026-09-02', 'morning', {
  state: 'published', artifactHash: 'b'.repeat(64), costUSD: 0.05, calls: 2,
});
assert.equal(attempts.sameSignatureNoonNoop(ledger, '2026-09-02', 'a'.repeat(64), 'b'.repeat(64)), true);
assert.equal(attempts.sameSignatureNoonNoop(ledger, '2026-09-02', 'a'.repeat(64), 'c'.repeat(64)), false,
  'the noon no-op needs proof that the morning artifact is still the public last-good');

const sig = attempts.candidateSignature([{ id: 'a', date: '2026-09-02', title: 'One', url: 'https://example.com/1' }]);
assert.match(sig, /^[a-f0-9]{64}$/);
assert.equal(sig, attempts.candidateSignature([{ id: 'a', date: '2026-09-02', title: 'One', url: 'https://example.com/1' }]));

const migrated = attempts.readAttempts({ attempts: [{
  editorialDate: '2026-09-02', slot: 'legacy', state: 'legacy-spend', costUSD: 0.119217,
}] });
assert.equal(attempts.slotAttempt(migrated, '2026-09-02', 'morning'), undefined,
  'retired-pipeline spend must not claim a new publisher slot');

console.log('edition-attempts tests: ok');
