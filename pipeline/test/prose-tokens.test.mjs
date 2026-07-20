// prose-tokens: the derived words the topic-page stories weave into sentences.
// Fable's v1 rule (2026-07-20): no sentence ships whose every possible rendering has not
// been read. These tests walk each token through rising, falling, flat, band-exit, hold,
// missing and stale series, and fail on any wording drift.

import assert from 'node:assert/strict';
import { trendWord, bandWord, stanceWord, staleness, balanceWord } from '../../assets/prose.js';

// trend: rising, falling, flat, dead-zone, missing
assert.equal(trendWord(106, 100).word, 'rose');
assert.equal(trendWord(94, 100).word, 'fell');
assert.equal(trendWord(100.2, 100).word, 'was little changed');       // inside the 0.5% dead zone
assert.equal(trendWord(100.2, 100, { thresholdPct: 0.1 }).word, 'rose'); // threshold is explicit
assert.equal(trendWord(106, 100, { past: false }).word, 'is up');
assert.equal(trendWord(null, 100).known, false);
assert.equal(trendWord(5, 0).known, false);                            // zero base: no honest percent
assert.ok(Math.abs(trendWord(106, 100).pct - 6) < 1e-9);

// band: below, inside, above, edges, exit month
assert.equal(bandWord(1.9, 2, 4).word, 'below');
assert.equal(bandWord(3.0, 2, 4).word, 'inside');
assert.equal(bandWord(4.05, 2, 4).word, 'above');                      // the month it exits, it says so
assert.equal(bandWord(2, 2, 4).word, 'inside');                        // bounds are inclusive
assert.equal(bandWord(4, 2, 4).word, 'inside');
assert.equal(bandWord(NaN, 2, 4).known, false);

// stance: cut, raise, hold-after-cut (the trap Fable named), short series
const cut = [{ value: 11.0 }, { value: 10.5 }, { value: 10.0 }];
const holdAfterCut = [{ value: 11.0 }, { value: 10.5 }, { value: 10.5 }];
const raise = [{ value: 10.0 }, { value: 10.25 }];
assert.equal(stanceWord(cut).word, 'cutting');
assert.equal(stanceWord(holdAfterCut).word, 'holding');                // two equal readings = holding
assert.equal(stanceWord(raise).word, 'raising');
assert.equal(stanceWord([{ value: 10 }]).known, false);

// staleness: fresh monthly, dropped monthly, quarterly grace, garbage date
const now = Date.parse('2026-07-20');
assert.equal(staleness('2026-06-01', 'monthly', now).stale, false);
assert.equal(staleness('2026-01-01', 'monthly', now).stale, true);     // a dropped feed must say its date
assert.equal(staleness('2026-01-01', 'quarterly', now).stale, false);  // quarterly lag is normal
assert.equal(staleness('2026-06', 'monthly', now).stale, false);       // YYYY-MM form accepted
assert.equal(staleness('not-a-date', 'monthly', now).known, false);

// balance: surplus, deficit, near zero
assert.equal(balanceWord(1.2).word, 'surplus');
assert.equal(balanceWord(-1.2).word, 'deficit');
assert.equal(balanceWord(0.1, 0.5).word, 'near zero');

console.log('prose-tokens: ok');
