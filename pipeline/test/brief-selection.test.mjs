import assert from 'node:assert/strict';
import selection from '../lib/brief-selection.cjs';

const { analysisState, optionalAnalysis, selectDailyBrief } = selection;

const candidate = (id, importance, extra = {}) => ({
  id,
  importance,
  title: id,
  url: `https://example.com/${id}`,
  source: extra.source || 'Example News',
  section: extra.section || 'economy',
  publishedAt: extra.publishedAt || '2026-08-06T12:00:00Z',
  ...extra,
});
const receiptFor = (result, id) => result.receipt.find((row) => row.id === id);

// The August 6 failure mode: optional analysis must never decide whether a
// factual event gets to compete. The higher-importance Banxico decision wins.
{
  const banxico = candidate('banxico-holds-rate', 6, {
    source: 'Banco de México',
    section: 'economy',
    scheduledMatch: true,
  });
  const ai = candidate('ai-governance-commentary', 5, {
    interestTags: ['AI'],
    analysisV: 7,
    background: 'Complete background.',
    view: 'Complete view.',
    prediction: 'Complete watch item.',
    publishedAt: '2026-08-06T16:00:00Z',
  });
  const result = selectDailyBrief([
    ai,
    candidate('trade', 5, { analysisV: 7, background: 'B', view: 'V', prediction: 'P' }),
    candidate('energy', 5),
    banxico,
  ]);
  assert.equal(result.selected[0].id, 'banxico-holds-rate', 'importance 6 must beat enriched importance 5');
  assert.equal(receiptFor(result, 'banxico-holds-rate').rank, 1);
  assert.equal(receiptFor(result, 'banxico-holds-rate').rawImportance, 6);
  assert.equal(receiptFor(result, 'banxico-holds-rate').analysis.state, 'missing');
  assert.equal(receiptFor(result, 'banxico-holds-rate').analysisState, 'missing');
  assert.equal(receiptFor(result, 'banxico-holds-rate').selected, true);
  assert.equal(receiptFor(result, 'ai-governance-commentary').analysis.state, 'ready');
}

{
  const provenance = { rubricVersion: 'five-component-v1', calculatedTotal: 7 };
  const result = selectDailyBrief([candidate('audited', 7, { importanceProvenance: provenance })]);
  assert.deepEqual(receiptFor(result, 'audited').importanceProvenance, provenance, 'the receipt must retain scoring provenance');
}

{
  const floored = candidate('scheduled-floor', 8, {
    importanceProvenance: { calculatedTotal: 6, reportedTotal: 6 },
    scheduledImportanceFloor: 8,
  });
  const result = selectDailyBrief([floored], {
    effectiveImportance: (event) => Math.max(event.importance, event.scheduledImportanceFloor || 0),
  });
  assert.equal(receiptFor(result, 'scheduled-floor').rawImportance, 6, 'raw importance must remain the pre-floor rubric total');
  assert.equal(receiptFor(result, 'scheduled-floor').effectiveImportance, 8, 'the separately configured effective floor must remain visible');
}

// Even the strongest combination of personalization, expected-event matching,
// novelty, and freshness cannot cross an importance band.
{
  const result = selectDailyBrief([
    candidate('important-old', 6, { publishedAt: '2026-08-05T10:00:00Z' }),
    candidate('personal-fresh-scheduled', 5, {
      interestTags: ['fintech', 'AI'],
      scheduledMatch: true,
      source: 'Another Source',
      section: 'technology',
      publishedAt: '2026-08-06T23:59:00Z',
    }),
  ]);
  assert.equal(receiptFor(result, 'important-old').rank, 1);
  assert.equal(receiptFor(result, 'personal-fresh-scheduled').rank, 2);
}

// A large dollar figure is not a substitute for the rubric. A company announcement
// carrying a billion-dollar headline remains below a more consequential national event.
{
  const result = selectDailyBrief([
    candidate('national-policy', 7),
    candidate('company-announces-$10-billion-investment', 5, { interestTags: ['capital', 'growth'] }),
  ]);
  assert.equal(result.selected[0].id, 'national-policy');
  assert.equal(receiptFor(result, 'company-announces-$10-billion-investment').rank, 2);
}

// Within one importance band, scheduled matches and declared interests may
// reorder stories; breadth and freshness then make the result deterministic.
{
  const result = selectDailyBrief([
    candidate('plain-new', 5, { publishedAt: '2026-08-06T15:00:00Z' }),
    candidate('interest-old', 5, { interestTags: ['payments'], publishedAt: '2026-08-06T09:00:00Z' }),
    candidate('scheduled-oldest', 5, { scheduledMatch: true, publishedAt: '2026-08-06T08:00:00Z' }),
  ]);
  assert.deepEqual(result.receipt.filter((row) => row.rank).sort((a, b) => a.rank - b.rank)
    .map((row) => row.id), ['scheduled-oldest', 'interest-old', 'plain-new']);
}

// Three is a soft publication floor, not permission to pad the edition to five.
{
  const result = selectDailyBrief([
    candidate('one', 5),
    candidate('two', 5),
    candidate('three', 5),
    candidate('four', 5),
    candidate('five', 5),
  ]);
  assert.equal(result.selected.length, 3);
  assert.equal(result.receipt.filter((row) => row.reason === 'not-selected:extension-not-earned').length, 2);
}

// Fourth and fifth stories earn their slots. Higher importance and a declared
// interest qualify; the sixth candidate remains outside the five-story cap.
{
  const result = selectDailyBrief([
    candidate('imp-7', 7),
    candidate('imp-6-a', 6),
    candidate('imp-6-b', 6),
    candidate('imp-6-c', 6),
    candidate('interest-5', 5, { interestTags: ['payments'] }),
    candidate('scheduled-5', 5, { scheduledMatch: true }),
  ]);
  assert.deepEqual(result.selected.map((event) => event.id), [
    'imp-7', 'imp-6-a', 'imp-6-b', 'imp-6-c', 'scheduled-5',
  ]);
  assert.equal(receiptFor(result, 'imp-6-c').reason, 'selected:extension:importance');
  assert.equal(receiptFor(result, 'scheduled-5').reason, 'selected:extension:scheduled');
  assert.equal(receiptFor(result, 'interest-5').reason, 'not-selected:cap-reached');
}

// There is no anti-bubble override: a lower-importance wildcard cannot replace
// a higher-importance selected story merely because it lacks an interest tag.
{
  const higherBand = Array.from({ length: 5 }, (_, index) => candidate(`interest-6-${index}`, 6, {
    interestTags: ['declared-interest'],
  }));
  const wildcard = candidate('wildcard-5', 5);
  const result = selectDailyBrief([...higherBand, wildcard]);
  assert.deepEqual(result.selected.map((event) => event.id), higherBand.map((event) => event.id));
  assert.equal(receiptFor(result, 'wildcard-5').selected, false);
  assert.equal(receiptFor(result, 'wildcard-5').rank, 6);
}

// Every input has a receipt, including invalid and below-floor candidates, and
// ineligibility is unrelated to the optional analysis state.
{
  const missingSource = candidate('missing-source', 8);
  missingSource.source = '';
  const result = selectDailyBrief([
    candidate('ready', 6, { analysisV: 7, background: 'B', view: 'V', prediction: 'P' }),
    candidate('partial', 6, { analysisV: 7, background: 'B' }),
    candidate('below-floor', 4),
    missingSource,
  ]);
  assert.equal(result.receipt.length, 4);
  assert.equal(receiptFor(result, 'ready').analysis.state, 'ready');
  assert.equal(receiptFor(result, 'partial').analysis.state, 'incomplete');
  assert.equal(receiptFor(result, 'partial').selected, true, 'partial analysis must not exclude the story');
  assert.equal(receiptFor(result, 'below-floor').rank, null);
  assert.equal(receiptFor(result, 'below-floor').reason, 'ineligible:below-importance-floor');
  assert.equal(receiptFor(result, 'missing-source').rank, null);
  assert.equal(receiptFor(result, 'missing-source').reason, 'ineligible:missing-source');
}

// Optional analysis is atomic: never expose a half-filled disclosure panel.
{
  const partial = candidate('partial-analysis', 6, {
    analysisV: 7,
    background: 'Background is present.',
    view: 'View is present.',
  });
  assert.equal(optionalAnalysis(partial), null);
  assert.equal(analysisState(partial).state, 'incomplete');

  const unapproved = { ...partial, prediction: 'Watch item is present.', analysisV: 6 };
  assert.equal(optionalAnalysis(unapproved), null);
  assert.equal(analysisState(unapproved).state, 'unapproved');

  const complete = { ...unapproved, analysisV: 7 };
  assert.deepEqual(optionalAnalysis(complete), {
    background: 'Background is present.',
    view: 'View is present.',
    prediction: 'Watch item is present.',
    analysisV: 7,
  });
}

// Selection is referentially transparent: it neither annotates nor reorders the
// caller's events, and identical input produces an identical receipt.
{
  const events = [candidate('stable-b', 5), candidate('stable-a', 5)];
  const before = JSON.stringify(events);
  const first = selectDailyBrief(events);
  const second = selectDailyBrief(events);
  assert.equal(JSON.stringify(events), before);
  assert.deepEqual(first, second);
}

console.log('brief-selection tests: ok');
