import assert from 'node:assert/strict';
import selection from '../lib/brief-selection.cjs';

const { ANALYSIS_VERSION, analysisState, omitUnreadyOptionalTail, optionalAnalysis, selectDailyBrief, selectEditionBrief, weekDates } = selection;

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
const approvedAnalysis = (extra = {}) => ({
  analysisV: ANALYSIS_VERSION,
  background: 'Complete background.',
  view: 'Complete view because the mechanism is clear.',
  prediction: 'The outcome is likely if the next release confirms it.',
  analysisRefs: { background: ['article'], view: ['article'], prediction: ['article'] },
  analysisSources: [{ kind: 'primary', source: 'Example agency', url: 'https://agency.gov/evidence' }],
  ...extra,
});
const receiptFor = (result, id) => result.receipt.find((row) => row.id === id);

assert.deepEqual(weekDates('2026-08-16'), {
  weekend: true,
  weekStartDate: '2026-08-10',
  weekendStartDate: '2026-08-15',
}, 'Sunday must use the current Monday-through-Sunday editorial week');

// Saturday and Sunday are one evolving recap. Qualifying weekend developments
// lead, and consequential Monday-Friday stories fill the remaining five slots.
{
  const result = selectEditionBrief([
    candidate('sunday-new', 5, { date: '2026-08-16', publishedAt: '2026-08-16T14:00:00Z' }),
    candidate('saturday-new', 6, { date: '2026-08-15', publishedAt: '2026-08-15T14:00:00Z' }),
    candidate('friday-major', 9, { date: '2026-08-14', publishedAt: '2026-08-14T14:00:00Z' }),
    candidate('thursday-major', 8, { date: '2026-08-13', publishedAt: '2026-08-13T14:00:00Z' }),
    candidate('wednesday-major', 7, { date: '2026-08-12', publishedAt: '2026-08-12T14:00:00Z' }),
    candidate('tuesday-major', 7, { date: '2026-08-11', publishedAt: '2026-08-11T14:00:00Z' }),
    candidate('weekday-routine', 5, { date: '2026-08-10', publishedAt: '2026-08-10T14:00:00Z' }),
    candidate('previous-sunday', 10, { date: '2026-08-09', publishedAt: '2026-08-09T14:00:00Z' }),
  ], { editorialDate: '2026-08-16' });
  assert.equal(result.policy, 'weekend-recap-v1');
  assert.deepEqual(result.selected.map((event) => event.id), [
    'saturday-new', 'sunday-new', 'friday-major', 'thursday-major', 'wednesday-major',
  ]);
  assert.deepEqual(result.selected.map((event) => event.date), [
    '2026-08-15', '2026-08-16', '2026-08-14', '2026-08-13', '2026-08-12',
  ], 'the recap must retain every development’s real date');
  assert.equal(receiptFor(result, 'saturday-new').lane, 'weekend');
  assert.equal(receiptFor(result, 'friday-major').lane, 'week-recap');
  assert.equal(receiptFor(result, 'weekday-routine').selected, false);
  assert.equal(receiptFor(result, 'previous-sunday'), undefined, 'the recap must reset at Monday');
  assert.deepEqual(result.counts, { weekend: 2, weekRecap: 3, total: 5 });
}

// Monday immediately returns to the normal daily product; Friday’s recap does
// not leak through merely because it appeared during the weekend.
{
  const result = selectEditionBrief([
    candidate('monday-new', 5, { date: '2026-08-17', publishedAt: '2026-08-17T14:00:00Z' }),
    candidate('sunday-important', 8, { date: '2026-08-16', publishedAt: '2026-08-16T14:00:00Z' }),
    candidate('friday-important', 10, { date: '2026-08-14', publishedAt: '2026-08-14T14:00:00Z' }),
  ], { editorialDate: '2026-08-17' });
  assert.equal(result.policy, 'exact-day-plus-carryover-v1');
  assert.deepEqual(result.selected.map((event) => event.id), ['monday-new', 'sunday-important']);
  assert.equal(receiptFor(result, 'friday-important'), undefined);
}

// When nothing clears today, yesterday's consequential reviewed reporting remains
// useful under the explicitly dated Key developments lane. This includes a late report
// that arrived after yesterday's edition and was first reviewed today.
{
  const result = selectEditionBrief([
    candidate('yesterday-important', 9, { date: '2026-08-19', publishedAt: '2026-08-19T14:00:00Z' }),
    candidate('late-yesterday-report', 10, { date: '2026-08-19', publishedAt: '2026-08-19T23:00:00Z' }),
  ], { editorialDate: '2026-08-20', carryoverIds: ['yesterday-important'] });
  assert.deepEqual(result.selected.map((event) => event.id), ['late-yesterday-report', 'yesterday-important']);
  assert.deepEqual(result.counts, { today: 0, keyDevelopments: 2, total: 2 });
  assert.equal(receiptFor(result, 'yesterday-important').lane, 'key-development');
  assert.equal(receiptFor(result, 'late-yesterday-report').lane, 'key-development');
}

// An edition has two honest lanes. Exact-day stories get first access; only
// importance-6+ stories from yesterday can fill unused slots, with five total.
{
  const result = selectEditionBrief([
    candidate('today-a', 5, { date: '2026-08-14', publishedAt: '2026-08-14T13:00:00Z' }),
    candidate('today-b', 6, { date: '2026-08-14', publishedAt: '2026-08-14T12:00:00Z' }),
    candidate('yesterday-important', 9, { date: '2026-08-13', publishedAt: '2026-08-13T12:00:00Z' }),
    candidate('yesterday-routine', 5, { date: '2026-08-13', publishedAt: '2026-08-13T13:00:00Z' }),
    candidate('two-days-old', 10, { date: '2026-08-12', publishedAt: '2026-08-12T13:00:00Z' }),
  ], { editorialDate: '2026-08-14' });
  assert.deepEqual(result.selected.map((event) => event.id), [
    'today-b', 'today-a', 'yesterday-important',
  ]);
  assert.equal(receiptFor(result, 'today-a').lane, 'today');
  assert.equal(receiptFor(result, 'yesterday-important').lane, 'key-development');
  assert.equal(receiptFor(result, 'yesterday-routine').selected, false);
  assert.equal(receiptFor(result, 'two-days-old'), undefined, 'older stories must not leak through a rolling window');
  assert.deepEqual(result.counts, { today: 2, keyDevelopments: 1, total: 3 });
}

{
  const today = Array.from({ length: 4 }, (_, index) => candidate(`today-${index}`, 6, {
    date: '2026-08-14', publishedAt: `2026-08-14T1${index}:00:00Z`,
  }));
  const prior = Array.from({ length: 4 }, (_, index) => candidate(`prior-${index}`, 8 - index, {
    date: '2026-08-13', publishedAt: `2026-08-13T1${index}:00:00Z`,
  }));
  const result = selectEditionBrief([...today, ...prior], { editorialDate: '2026-08-14' });
  assert.equal(result.selected.length, 5, 'today and carryovers must share one five-story cap');
  assert.equal(result.counts.today, 4);
  assert.equal(result.counts.keyDevelopments, 1);
}

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
    ...approvedAnalysis(),
    publishedAt: '2026-08-06T16:00:00Z',
  });
  const result = selectDailyBrief([
    ai,
    candidate('trade', 5, approvedAnalysis()),
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

// Different cuts of one national merchandise-trade print may coexist in the evidence
// ledger, but only one can consume a homepage slot. Product and destination export
// stories remain independent developments.
{
  const result = selectDailyBrief([
    candidate('ytd-national-exports', 8, {
      date: '2026-08-27', publishedAt: '2026-08-27T18:56:37Z',
      title: "Mexico's exports reach 473.9 billion dollars in the first seven months",
      why: 'Manufactured products accounted for 92 percent of Mexican exports.',
      reportEvidence: { title: 'Exportaciones mexicanas', dek: '473.9 billion dollars; primeros siete meses; productos manufacturados.' },
    }),
    candidate('monthly-national-trade', 8, {
      date: '2026-08-27', publishedAt: '2026-08-27T21:16:46Z',
      title: 'Mexico reports July exports, imports and a trade deficit',
      why: 'Monthly trade reached 81.4 billion dollars.',
      reportEvidence: { title: 'Mexico monthly trade', dek: 'July exports and imports produced a trade deficit of 848 million dollars.' },
    }),
    candidate('avocado-exports', 7, {
      date: '2026-08-27', title: "Mexico's avocado exports rise in July",
    }),
    candidate('oil-exports', 7, {
      date: '2026-08-27', title: "Mexico's crude oil exports fall in July",
    }),
  ]);
  assert.equal(result.selected.filter((event) => /national-(?:exports|trade)/.test(event.id)).length, 1,
    'one national merchandise-trade print gets one homepage slot');
  assert.equal(receiptFor(result, 'ytd-national-exports').reason === 'not-selected:duplicate-development-family'
    || receiptFor(result, 'monthly-national-trade').reason === 'not-selected:duplicate-development-family', true);
  assert.deepEqual(result.selected.filter((event) => /avocado|oil/.test(event.id)).map((event) => event.id).sort(),
    ['avocado-exports', 'oil-exports'], 'commodity export stories must remain independent');
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
    candidate('ready', 6, approvedAnalysis()),
    candidate('partial', 6, { analysisV: ANALYSIS_VERSION, background: 'B' }),
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
    analysisV: ANALYSIS_VERSION,
    background: 'Background is present.',
    view: 'View is present.',
    analysisRefs: { background: ['article'], view: ['article'] },
    analysisSources: [{ kind: 'primary', source: 'Example agency', url: 'https://agency.gov/evidence' }],
  });
  assert.equal(optionalAnalysis(partial), null);
  assert.equal(analysisState(partial).state, 'incomplete');

  const unapproved = {
    ...partial,
    prediction: 'Watch item is present.',
    analysisV: ANALYSIS_VERSION - 1,
    analysisRefs: { ...partial.analysisRefs, prediction: ['article'] },
  };
  assert.equal(optionalAnalysis(unapproved), null);
  assert.equal(analysisState(unapproved).state, 'unapproved');

  const complete = { ...unapproved, analysisV: ANALYSIS_VERSION };
  assert.deepEqual(optionalAnalysis(complete), {
    background: 'Background is present.',
    view: 'View is present.',
    prediction: 'Watch item is present.',
    analysisV: ANALYSIS_VERSION,
    analysisRefs: { background: ['article'], view: ['article'], prediction: ['article'] },
    analysisSources: [{ kind: 'primary', source: 'Example agency', url: 'https://agency.gov/evidence' }],
  });
}

// A low-importance unexplained tail can be omitted without replacing or reranking it.
{
  const lead = candidate('lead', 8, approvedAnalysis());
  const second = candidate('second', 7, approvedAnalysis());
  const optionalTail = candidate('optional-tail', 6);
  assert.deepEqual(omitUnreadyOptionalTail([lead, second, optionalTail]).map((event) => event.id), ['lead', 'second']);
  assert.deepEqual(omitUnreadyOptionalTail([lead, second, candidate('important-tail', 7)]).map((event) => event.id),
    ['lead', 'second', 'important-tail'], 'importance-7 developments remain publication-blocking');
  assert.deepEqual(omitUnreadyOptionalTail([lead, second, candidate('scheduled-tail', 6, { scheduledEventId: 'decision' })]).map((event) => event.id),
    ['lead', 'second', 'scheduled-tail'], 'scheduled developments remain publication-blocking');
  assert.deepEqual(omitUnreadyOptionalTail([lead, second, candidate('ready-tail', 6, approvedAnalysis())]).map((event) => event.id),
    ['lead', 'second', 'ready-tail'], 'an explained optional tail remains visible');
  assert.deepEqual(omitUnreadyOptionalTail([lead, optionalTail]).map((event) => event.id), ['lead'],
    'a ready lead can publish alone when its optional tail cannot be explained');
  assert.deepEqual(omitUnreadyOptionalTail([candidate('unready-lead', 6)]).map((event) => event.id), ['unready-lead'],
    'an unready lead remains publication-blocking');
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
