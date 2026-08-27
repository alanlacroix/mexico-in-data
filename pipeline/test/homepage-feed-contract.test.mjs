import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintEventReport, lintReportText, lintAnalysisText } from '../lib/lint.js';
import { cleanNewsText, domainTrusted, eventCandidateEligible, newsCollectionHealth, publicHeadlineEligible } from '../lib/news-trust.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { editorialDay } = require(path.join(root, 'pipeline/lib/news-day.cjs'));
const { groupEvents, sameThread } = require(path.join(root, 'pipeline/lib/news-threads.cjs'));
const { recentEvents } = require(path.join(root, 'pipeline/lib/news-window.cjs'));
const dailyBriefFactory = require(path.join(root, '_data/dailyBrief.js'));
const latestStoriesFactory = require(path.join(root, '_data/latestStories.js'));
const dailyBrief = dailyBriefFactory();
const feed = require(path.join(root, '_data/feed.js'))();
const latestStories = latestStoriesFactory();
const nowBoard = require(path.join(root, '_data/nowBoard.js'))();
const boards = require(path.join(root, '_data/boards.js'))();
const registry = require(path.join(root, 'pipeline/news-sources.json'));
const wire = require(path.join(root, 'data/news/wire.json'));
const happening = require(path.join(root, 'data/happening.json'));
const briefFile = require(path.join(root, 'data/brief.json'));

assert.equal(editorialDay('2026-07-21T03:00:00Z'), '2026-07-20', 'the editorial day must not roll over at UTC midnight');
assert.equal(editorialDay('2026-07-21T07:00:00Z'), '2026-07-21', 'the editorial day must follow Mexico City');

assert.match(dailyBrief.editorialDate, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(dailyBrief.editorialDate, editorialDay(new Date()),
  'a successfully generated edition must use the current Mexico City editorial day');
assert.ok(dailyBrief.stories.every((story) => Date.parse(story.date) <= Date.parse(dailyBrief.editorialDate)), 'the brief must not contain future-dated stories');
assert.ok(dailyBrief.stories.length <= 3, 'the homepage must never show more than three key developments');
assert.ok(dailyBrief.todayStories.every((story) => story.date === dailyBrief.editorialDate),
  "Today's stories must contain only exact-day reporting");
assert.equal(dailyBrief.todayStories.length + dailyBrief.keyDevelopments.length
  + dailyBrief.weekendStories.length + dailyBrief.weekRecapStories.length, dailyBrief.stories.length,
  'the two visible lanes must partition the one selected story set');
if (briefFile.meta?.selection?.policy === 'exact-day-plus-carryover-v1' && !dailyBrief.carryingLastBrief) {
  const prior = new Date(`${dailyBrief.editorialDate}T12:00:00Z`);
  prior.setUTCDate(prior.getUTCDate() - 1);
  assert.ok(dailyBrief.keyDevelopments.every((story) => story.date === prior.toISOString().slice(0, 10)),
    'new editions may carry only important stories from the immediately preceding day');
} else if (briefFile.meta?.selection?.policy === 'weekend-recap-v1') {
  const { weekStartDate, weekendStartDate } = briefFile.meta.selection;
  assert.equal(dailyBrief.weekendEdition, true);
  assert.ok(dailyBrief.weekendStories.every((story) => story.date >= weekendStartDate
    && story.date <= dailyBrief.editorialDate), 'New this weekend must contain only Saturday and Sunday developments');
  assert.ok(dailyBrief.weekRecapStories.every((story) => story.date >= weekStartDate
    && story.date < weekendStartDate), 'What mattered this week must contain only the current Monday-Friday window');
}
assert.equal(
  dailyBrief.latestItemDate,
  dailyBrief.stories.map((story) => story.date).filter(Boolean).sort().at(-1) || '',
  'the homepage must expose the newest selected article date instead of implying every article is from today',
);
assert.ok(dailyBrief.stories.every((story) => {
  const fields = [story.bg, story.view, story.prediction].filter((value) => String(value || '').trim());
  const refs = ['background', 'view', 'prediction'].every((field) => story.analysisRefs?.[field]?.length);
  const linked = story.analysisSources?.some((source) => source?.kind !== 'article'
    && /^https:\/\//i.test(String(source?.url || '')));
  return fields.length === 0 || (story.analysisV >= 9 && fields.length === 3 && refs && linked);
}), 'each story must expose either one complete approved BE unit or no analysis at all');
for (let i = 0; i < dailyBrief.stories.length; i += 1) {
  for (let j = i + 1; j < dailyBrief.stories.length; j += 1) {
    assert.equal(sameThread(dailyBrief.stories[i], dailyBrief.stories[j]), false, 'the rendered Brief must never repeat one event');
  }
}
if (dailyBrief.stories.length) {
  assert.ok(dailyBrief.summaryLead && dailyBrief.summaryLead.trim().length >= 40,
    'a populated edition must contain a substantive summary');
} else if (dailyBrief.publicationInterrupted || dailyBrief.carryingLastBrief) {
  assert.match(dailyBrief.summaryLead, /update is delayed/i,
    'an interrupted edition must report the outage instead of making a quiet-day claim');
  assert.doesNotMatch(dailyBrief.summaryLead, /No major developments/i);
} else {
  assert.equal(dailyBrief.summaryLead, 'No major developments yet today.',
    'an empty edition must be explicit, current, and concise');
}
assert.doesNotMatch(dailyBrief.summaryLead, /\b(?:the|this|latest) brief\b/i,
  'the summary must explain the news without referring to the product itself');
const renderedBriefCopy = [
  dailyBrief.summaryLead,
  ...dailyBrief.stories.flatMap((story) => [story.title, story.summary, story.bg, story.view, story.prediction]),
].filter(Boolean).join(' ');
assert.doesNotMatch(
  renderedBriefCopy,
  /state power utility Mexico|Mexican utility Mexico|agreement treaty|utilityat|the Mexico's/i,
  'the render pass must not create duplicated or broken institutional names',
);
assert.doesNotMatch(
  renderedBriefCopy,
  /(?:^|[.!?]\s+)Mexico's state-owned electricity utility\.(?:\s|$)/,
  'institution normalization must not leave a sentence fragment',
);
assert.ok(latestStories.every((story) => Date.parse(story.date) <= Date.parse(dailyBrief.editorialDate)), 'recent headlines must not contain future-dated stories');
assert.equal(groupEvents(happening.events || []).length, (happening.events || []).length, 'the stored event log must not contain two records for one development');
assert.equal(happening.meta?.count, (happening.events || []).length, 'the event-log count must match its records');
assert.equal(dailyBriefFactory({}).editorialDate, dailyBrief.editorialDate, 'Eleventy’s data argument must not be mistaken for a clock');

const interruptedQuietBrief = dailyBriefFactory(new Date('2026-08-27T18:00:00Z'), {
  brief: {
    meta: { editorialDate: '2026-08-27', quiet: true, generatedAt: '2026-08-27T13:00:00Z' },
    summary: 'No major developments yet today.', lead: null, items: [],
  },
  happening: { meta: {}, events: [] },
  publicationStatus: {
    state: 'deferred', editorialDate: '2026-08-27', contentEditorialDate: '2026-08-27',
  },
});
assert.equal(interruptedQuietBrief.publicationInterrupted, true);
assert.equal(interruptedQuietBrief.quiet, false,
  'a contradicted quiet receipt must stop making the editorial claim that nothing happened');
assert.equal(interruptedQuietBrief.stories.length, 0);
assert.match(interruptedQuietBrief.summaryLead, /delayed.*being checked/i);
assert.doesNotMatch(interruptedQuietBrief.summaryLead, /No major developments/i);

const lastBriefDate = dailyBrief.briefEditorialDate;
const nextDay = new Date(`${lastBriefDate}T12:00:00Z`);
nextDay.setUTCDate(nextDay.getUTCDate() + 1);
const carriedBrief = dailyBriefFactory(nextDay);
assert.equal(carriedBrief.carryingLastBrief, true, 'a failed refresh must be identified as a delayed update');
assert.equal(carriedBrief.editorialDate, lastBriefDate, 'a failed refresh must retain the last certified dateline');
assert.equal(carriedBrief.stories.length, 0, 'a delayed update must not relabel old cards as current news');
assert.match(carriedBrief.summaryLead, /update is delayed/i);
const staleNow = new Date('2099-12-31T12:00:00Z');
const staleBrief = dailyBriefFactory(staleNow);
assert.equal(staleBrief.editorialDate, lastBriefDate, 'an outage must retain the last certified dateline');
assert.equal(staleBrief.stories.length, 0, 'an old brief must not be carried indefinitely');
assert.match(staleBrief.summaryLead, /update is delayed/i);
assert.doesNotMatch(staleBrief.summaryLead, /No major developments/i,
  'an infrastructure outage must never masquerade as a quiet editorial day');
assert.equal(latestStoriesFactory(staleNow).length, 0, 'old headlines must still expire from the recent-news window');
assert.ok(feed.week.every((item, index, items) => index === 0
  || String(items[index - 1].publishedAt) >= String(item.publishedAt)),
'the combined This week shelf must read newest-to-oldest instead of jumping between topic-room dates');
assert.equal(feed.week.some((item) => /\b(?:la|el)\s+graduaci[oó]n\b/i.test(item.title || '')), false,
  'a source-level English label must not leak an obviously Spanish individual story into the English shelf');

const midnightWindow = recentEvents([
  { date: '2026-07-22', publishedAt: '2026-07-23T03:30:00Z', title: 'Useful report from the prior evening' },
  { date: '2026-07-23', publishedAt: '2026-07-23T13:00:00Z', title: 'Useful report from this morning' },
  { date: '2026-07-20', publishedAt: '2026-07-20T13:00:00Z', title: 'Stale report' },
], new Date('2026-07-23T14:00:00Z'), 36);
assert.deepEqual(midnightWindow.map((event) => event.title).sort(), [
  'Useful report from the prior evening',
  'Useful report from this morning',
], 'the brief window must cross midnight without retaining stale news');

const grouped = groupEvents([
  { date: '2026-07-21', title: 'Mexico and the US open the annual USMCA review', source: 'Outlet A', url: 'https://example.com/a', publishedAt: '2026-07-21T12:00:00Z' },
  { date: '2026-07-21', title: 'The US and Mexico open the annual USMCA review', source: 'Outlet B', url: 'https://example.com/b', publishedAt: '2026-07-21T14:00:00Z' },
]);
assert.equal(grouped.length, 1, 'related same-day reports must render as one event');
assert.equal(grouped[0].sourceCount, 2, 'a grouped event must retain both source links');
assert.equal(grouped[0].event.source, 'Outlet B', 'the current state must use the newer equally ranked report');

const sameInflationRelease = groupEvents([
  {
    date: '2026-08-07', publishedAt: '2026-08-07T13:15:39Z', source: 'Outlet A',
    url: 'https://example.com/inflation-a', title: "Mexico's annual inflation falls to 3.12 percent in July, its lowest since 2020",
  },
  {
    date: '2026-08-07', publishedAt: '2026-08-07T20:34:46Z', source: 'Outlet B',
    url: 'https://example.com/inflation-b', title: "Mexico's inflation falls to 3.12% in July",
  },
]);
assert.equal(sameInflationRelease.length, 1, 'two same-day reports of the same official indicator value must use one story slot');
assert.equal(sameInflationRelease[0].sourceCount, 2, 'the merged release must retain both source links');

const sameNationalTradePrint = groupEvents([
  {
    date: '2026-08-27', publishedAt: '2026-08-27T18:56:37Z', source: 'Outlet A',
    url: 'https://example.com/ytd-exports', title: 'Mexico exports 473.9 billion dollars in the first seven months',
    why: 'Manufactured products account for most exports.',
  },
  {
    date: '2026-08-27', publishedAt: '2026-08-27T21:16:46Z', source: 'Outlet B',
    url: 'https://example.com/july-trade', title: 'Mexico reports July exports, imports and an 848 million dollar trade deficit',
    why: 'The monthly merchandise-trade release covers July.',
  },
]);
assert.equal(sameNationalTradePrint.length, 2,
  'different cuts of a trade release remain separate evidence records; homepage selection owns diversity');
assert.equal(groupEvents([
  {
    date: '2026-08-27', publishedAt: '2026-08-27T18:00:00Z', source: 'Outlet A',
    url: 'https://example.com/avocado', title: "Mexico's avocado exports rise in July",
  },
  {
    date: '2026-08-27', publishedAt: '2026-08-27T19:00:00Z', source: 'Outlet B',
    url: 'https://example.com/crude', title: "Mexico's crude oil exports fall in July",
  },
]).length, 2, 'different export products must never be collapsed into one national trade release');
assert.equal(groupEvents([
  {
    date: '2026-08-27', publishedAt: '2026-08-27T18:00:00Z', source: 'Outlet A',
    url: 'https://example.com/tourism', title: "Mexico's tourism exports rise in July",
  },
  {
    date: '2026-08-27', publishedAt: '2026-08-27T19:00:00Z', source: 'Outlet B',
    url: 'https://example.com/merchandise', title: 'Mexico reports July merchandise exports and imports',
  },
]).length, 2, 'tourism exports must remain separate from the merchandise-trade print');
assert.equal(groupEvents([
  {
    date: '2026-08-27', publishedAt: '2026-08-27T18:00:00Z', source: 'Outlet A',
    url: 'https://example.com/us-exports', title: "Mexico's exports to the US rise in July",
  },
  {
    date: '2026-08-27', publishedAt: '2026-08-27T19:00:00Z', source: 'Outlet B',
    url: 'https://example.com/national-trade', title: 'Mexico reports July merchandise exports and imports',
  },
]).length, 2, 'a destination-specific export story must remain separate from the national trade print');
assert.equal(groupEvents([
  {
    date: '2026-08-27', publishedAt: '2026-08-27T18:00:00Z', source: 'Outlet A',
    url: 'https://example.com/trade-print', title: 'Mexico reports July exports and imports',
  },
  {
    date: '2026-08-27', publishedAt: '2026-08-27T19:00:00Z', source: 'Outlet B',
    url: 'https://example.com/tariff-policy', title: 'Mexico challenges US tariff on tomato exports',
  },
]).length, 2, 'a tariff or trade-policy action must remain separate from the national statistics release');

const sameMexicaliAlert = groupEvents([
  {
    date: '2026-08-25', publishedAt: '2026-08-25T13:59:36Z', source: 'Outlet A',
    url: 'https://example.com/mexicali-a', title: 'US embassy in Mexicali suspends operations and issues security alert',
  },
  {
    date: '2026-08-25', publishedAt: '2026-08-25T08:59:40Z', source: 'Outlet B',
    url: 'https://example.com/mexicali-b', title: 'US suspends consular activities in Mexicali over threat',
  },
]);
assert.equal(sameMexicaliAlert.length, 1, 'two reports of the same consular suspension must use one story slot');
assert.equal(sameMexicaliAlert[0].sourceCount, 2, 'the merged security alert must retain both source links');

const relatedButDistinct = groupEvents([
  { date: '2026-07-21', title: 'Mexico and the US launch the first annual USMCA review', source: 'Outlet A', url: 'https://example.com/review' },
  { date: '2026-07-21', title: 'Sheinbaum presses USMCA talks at the World Cup final', source: 'Outlet B', url: 'https://example.com/world-cup' },
]);
assert.equal(relatedButDistinct.length, 2, 'related developments must remain separate unless they report the same event');

const sameMeetingDifferentAngles = groupEvents([
  { date: '2026-07-23', title: 'Mexico and US set fourth round of USMCA review talks for September', source: 'Outlet A', url: 'https://example.com/outcome' },
  { date: '2026-07-23', title: 'Sheinbaum says Mexico and US advance in USMCA review talks', source: 'Outlet B', url: 'https://example.com/quote' },
]);
assert.equal(sameMeetingDifferentAngles.length, 1, 'two reports on the same treaty meeting must use one key-development slot');

const acrossDays = groupEvents([
  { date: '2026-07-20', title: 'Mexico and the US open the annual USMCA review', source: 'Yesterday', url: 'https://example.com/yesterday', publishedAt: '2026-07-21T03:00:00Z' },
  { date: '2026-07-21', title: 'USTR updates the USMCA review talks', source: 'Today', url: 'https://example.com/today', publishedAt: '2026-07-21T14:00:00Z' },
]);
assert.equal(acrossDays.length, 2, 'a later treaty update must remain separate from the meeting opening');

const cattleAcrossDays = groupEvents([
  {
    date: '2026-07-24', publishedAt: '2026-07-25T02:57:51.000Z', source: 'El Financiero — Economía',
    url: 'https://example.com/cattle-a', title: 'United States reopens border to Mexican cattle imports after year-long ban',
  },
  {
    date: '2026-07-25', publishedAt: '2026-07-25T16:38:48.000Z', source: 'Expansión — Empresas',
    url: 'https://example.com/cattle-b', title: 'US reopens border to Mexican cattle imports after screwworm-related suspension',
  },
]);
assert.equal(cattleAcrossDays.length, 1, 'adjacent-day reports of the same cattle reopening must use one card');
assert.equal(cattleAcrossDays[0].sourceCount, 2, 'one event must retain both reporting sources');
assert.equal(cattleAcrossDays[0].event.source, 'Expansión — Empresas', 'the newer report must define the visible event state');
assert.deepEqual(cattleAcrossDays[0].coverage.map((source) => source.url).sort(), [
  'https://example.com/cattle-a', 'https://example.com/cattle-b',
], 'cross-day event coverage must retain both source links');

const reopeningThenClosure = groupEvents([
  cattleAcrossDays[0].event,
  {
    date: '2026-07-26', publishedAt: '2026-07-26T15:00:00.000Z', source: 'Outlet C',
    url: 'https://example.com/cattle-closed', title: 'United States closes border to Mexican cattle imports after a new screwworm case',
  },
]);
assert.equal(reopeningThenClosure.length, 2, 'a later reversal must be published as a new event');

const bilingualCattle = groupEvents([
  {
    date: '2026-07-24', publishedAt: '2026-07-25T02:57:51.000Z', source: 'Outlet A',
    url: 'https://example.com/cattle-en', title: 'United States reopens border to Mexican cattle imports after year-long ban',
  },
  {
    date: '2026-07-25', publishedAt: '2026-07-25T15:00:00.000Z', source: 'Outlet B',
    url: 'https://example.com/cattle-es', title: 'EU reabre importación de ganado mexicano tras crisis',
  },
]);
assert.equal(bilingualCattle.length, 1, 'English and Spanish reports of one event must cluster');

const identityFixtures = [
  {
    expected: true,
    label: 'a state-change paraphrase without the canonical reopening verb',
    a: 'United States lifts restrictions on Mexican cattle imports',
    b: 'United States reopens border to Mexican cattle imports',
  },
  {
    expected: false,
    label: 'two different investment announcements with similar generic wording',
    a: 'Mexico announces $1 billion investment in rail network',
    b: 'Mexico announces $7.9 billion investment in airport network',
  },
  {
    expected: false,
    label: 'two same-sized investments in different infrastructure',
    a: 'Mexico announces $1 billion investment in electricity grid',
    b: 'Mexico announces $1 billion investment in water infrastructure',
  },
  {
    expected: false,
    label: 'a later reversal of the same border policy',
    a: 'United States reopens border to Mexican cattle imports',
    b: 'United States closes border to Mexican cattle imports after a new case',
  },
];
for (const fixture of identityFixtures) {
  const a = { date: '2026-07-24', publishedAt: '2026-07-25T02:00:00Z', title: fixture.a, url: `https://example.com/${fixture.label}/a` };
  const b = { date: '2026-07-25', publishedAt: '2026-07-25T16:00:00Z', title: fixture.b, url: `https://example.com/${fixture.label}/b` };
  assert.equal(sameThread(a, b), fixture.expected, fixture.label);
}

const bridgeCluster = groupEvents([
  { date: '2026-07-24', publishedAt: '2026-07-24T12:00:00Z', source: 'Outlet A', url: 'https://example.com/updated-url', title: 'US agriculture department publishes livestock notice' },
  { date: '2026-07-25', publishedAt: '2026-07-25T12:00:00Z', source: 'Outlet C', url: 'https://example.com/cattle-followup', title: 'United States reopens border to Mexican cattle imports' },
  { date: '2026-07-25', publishedAt: '2026-07-25T11:00:00Z', source: 'Outlet B', url: 'https://example.com/updated-url', title: 'United States lifts restrictions on Mexican cattle imports' },
]);
assert.equal(bridgeCluster.length, 1, 'a bridge report must join every matching member, regardless of input order');
assert.equal(bridgeCluster[0].members.length, 3, 'a transitive event cluster must retain all member reports');
assert.equal(bridgeCluster[0].sourceCount, 2, 'coverage must retain each unique reporting link once');

const officialThenNewer = groupEvents([
  { date: '2026-07-21', title: 'USTR opens the USMCA review talks', source: 'USTR', url: 'https://ustr.gov/example', publishedAt: '2026-07-21T12:00:00Z' },
  { date: '2026-07-21', title: 'USTR opens the USMCA review discussions', source: 'Outlet C', url: 'https://example.com/c', publishedAt: '2026-07-21T15:00:00Z' },
]);
assert.equal(officialThenNewer[0].event.source, 'Outlet C', 'a newer report must define the current state even when an older source is first-party');

const requiredNumbers = new Set([
  'banxico-usdmxn-fix', 'cre-gasolina-regular', 'banxico-cetes-28d', 'fred-ust10', 'banxico-bmv-ipc',
  'banxico-inflacion', 'banxico-tasa-objetivo', 'banxico-igae', 'banxico-exports-total', 'banxico-remesas',
]);
assert.deepEqual(new Set(nowBoard.map((item) => item.id)), requiredNumbers, 'the number set must remain a finite first-party set');
assert.ok(nowBoard.every((item) => item.date && item.source && item.compare && !/\btoday\b/i.test(item.compare)), 'every number needs its own date, source, and honest comparison');
assert.ok(nowBoard.every((item) => item.move && !/\btoday\b/i.test(item.move)), 'every number needs a short move line that does not claim to have moved today');
assert.ok(nowBoard.every((item) => item.dateLead && item.updateLabel && item.actionLabel), 'every number must explain its observation date, update schedule, and destination');
assert.equal(nowBoard.find((item) => item.id === 'banxico-usdmxn-fix')?.href, 'https://www.google.com/finance/quote/USD-MXN?hl=en', 'the peso card must open a clearly labeled live quote');
assert.ok(nowBoard.every((item) => !/atlas/i.test(item.href || '')), 'no number card may depend on the retired Atlas');
assert.ok(nowBoard.filter((item) => item.id !== 'banxico-usdmxn-fix').every((item) => item.actionLabel === 'Open source' && item.external), 'non-peso number cards must open their official sources');
assert.equal(nowBoard.find((item) => item.id === 'banxico-tasa-objetivo')?.updateLabel, 'Can change at policy meetings', 'the policy rate must not imply that it changes daily');

// The homepage has two rooms: a weekly market check, and what is true. A number
// belongs to exactly one of them, and the daily strip may only carry series that a
// trading day actually moves. A monthly reading up there would be a lie of placement.
assert.ok(boards.today.length >= 4, 'the daily strip needs enough numbers to read as a strip');
assert.ok(boards.today.every((item) => item.cadence === 'daily'), 'the daily strip must only carry series that move on a trading day');
assert.ok(boards.today.every((item) => item.comparisonDate && Number.isFinite(Number(item.moveValue))),
  'every market tile must have a real seven-day reference and change');
assert.ok(boards.today.every((item) => {
  const days = Math.round((Date.parse(item.date) - Date.parse(item.comparisonDate)) / 86_400_000);
  return days >= 5 && days <= 9;
}), 'the market comparison must stay close to seven calendar days across weekends and holidays');
assert.ok(boards.today.every((item) => /seven days earlier/i.test(item.compare)),
  'the expanded market explanation must name its comparison window');
assert.ok(feed.numbers.every((item) => /^7D (?:[↑↓→] |—)/.test(item.delta)),
  'every market delta must visibly identify the seven-day window');
assert.ok(boards.economy.every((item) => item.cadence !== 'daily'), 'the economy board must not repeat a daily series');
assert.equal(
  boards.today.filter((item) => boards.economy.some((other) => other.id === item.id)).length, 0,
  'a number appears in exactly one room',
);
assert.deepEqual(
  new Set([...boards.today, ...boards.economy].map((item) => item.id)), requiredNumbers,
  'every number in the set must be placed in a room, so none can go missing from the page',
);

assert.ok(lintReportText({ text: 'One claim; another claim.', inputs: ['One claim', 'another claim'] }).flags.includes('semicolon'), 'public model copy must reject semicolons');
assert.equal(lintEventReport({
  event: { title: 'Technology changes the labor market...', why: 'The report describes changes in Mexico.', url: 'https://example.com', date: '2026-08-08' },
  inputs: ['Technology changes the labor market...', 'The report describes changes in Mexico.'],
}).ok, false, 'deterministic fallback must reject feed ellipses before they enter the event ledger');
assert.ok(lintEventReport({
  event: {
    title: "Mexico's export figures for the first seven months",
    why: 'The sourceTitle and sourceDek provide the reported export volume.',
    url: 'https://example.com/prompt-leak', date: '2026-08-27',
  },
  inputs: ['México exportó 473,917 mdd durante los primeros siete meses.'],
}).flags.some((flag) => flag.includes('prompt or source narration')),
'internal evidence-field names must never reach public copy');
assert.ok(lintEventReport({
  event: {
    title: "Mexico's export figures for the first seven months",
    why: 'The evidence strings provide the reported export volume.',
    url: 'https://example.com/repair-schema-leak', date: '2026-08-27',
  },
  inputs: ['México exportó 473,917 mdd durante los primeros siete meses.'],
}).flags.some((flag) => flag.includes('prompt or source narration')),
'the repair schema wording must never become public context');
assert.ok(lintEventReport({
  event: {
    title: "Mexico's exports and imports each surpass 80 billion dollars",
    why: 'Combined monthly trade flow reached 81.4 billion dollars.',
    url: 'https://example.com/quantity-scope', date: '2026-08-27',
  },
  inputs: ['Mexico Trade Surge Hits US$81.4 Billion Record', 'Exports and imports both surpassed US$80 billion.'],
}).flags.some((flag) => flag.includes('unsupported quantity scope')),
'a generated combined total must be stated in retained evidence');
assert.equal(lintEventReport({
  event: {
    title: "Mexico's exports and imports each surpass 40 billion dollars",
    why: 'Combined monthly trade flow reached 81.4 billion dollars.',
    url: 'https://example.com/possible-total', date: '2026-08-27',
  },
  inputs: ['Exports and imports both surpassed US$40 billion, for a combined US$81.4 billion.'],
}).ok, true, 'compatible sourced component and aggregate quantities must remain publishable');
assert.equal(lintEventReport({
  event: {
    title: 'Both chambers approve the reform',
    why: 'The Senate and House voted on Thursday.',
    url: 'https://example.com/both-chambers', date: '2026-08-27',
  },
  inputs: ['The Senate and House approved the reform on Thursday.'],
}).ok, true, 'a nonnumeric use of both must not trigger a quantity-scope gate');
assert.equal(lintEventReport({
  event: {
    title: 'Both chambers approve a 5 billion dollar budget',
    why: 'The Senate and House voted on Thursday.',
    url: 'https://example.com/both-chambers-budget', date: '2026-08-27',
  },
  inputs: ['The Senate and House approved a 5 billion dollar budget.'],
}).ok, true, 'both describing actors must not be mistaken for component quantities');
assert.equal(lintEventReport({
  event: {
    title: 'Two companies form a combined 5 billion dollar venture',
    why: 'The companies signed the joint-venture agreement.',
    url: 'https://example.com/combined-venture', date: '2026-08-27',
  },
  inputs: ['Two companies formed a 5 billion dollar joint venture.'],
}).ok, true, 'combined describing one venture must not require aggregate-source wording');
assert.equal(lintEventReport({
  event: {
    title: 'Both companies form a combined 5 billion dollar venture',
    why: 'The companies signed the joint-venture agreement.',
    url: 'https://example.com/both-combined-venture', date: '2026-08-27',
  },
  inputs: ['Company A and Company B formed a 5 billion dollar joint venture.'],
}).ok, true, 'one shared amount must not be mistaken for separate component and total claims');
assert.equal(lintEventReport({
  event: {
    title: 'Output rises alongside investment',
    why: 'Combined with higher investment, production increased.',
    url: 'https://example.com/combined-with', date: '2026-08-27',
  },
  inputs: ['Combined with higher investment, production increased.'],
}).ok, true, 'combined used as an ordinary connector must not trigger arithmetic checks');
assert.equal(lintEventReport({
  event: {
    title: 'Phishing losses average 8,750 pesos per victim',
    why: 'Victims lost an average of 8,750 pesos each.',
    url: 'https://example.com/per-victim', date: '2026-08-27',
  },
  inputs: ['A las víctimas les roban 8,750 pesos en promedio.'],
}).ok, true, 'a sourced average may be expressed as a per-person amount');
assert.ok(lintEventReport({
  event: {
    title: 'Banxico chief calls for an integrated trade review',
    why: 'Agustín Carstens, former Banxico governor, called for coordination.',
    url: 'https://example.com/carstens', date: '2026-08-27',
  },
  inputs: ['Agustín Carstens aboga por una integración inteligente en la revisión comercial'],
}).flags.some((flag) => flag.includes('unsupported role')),
'a named source actor must not be replaced with a current office the evidence never states');
assert.equal(lintEventReport({
  event: {
    title: "Mexico's president asks the foreign minister to press the US",
    why: 'The president asked for a diplomatic response.',
    url: 'https://example.com/sheinbaum', date: '2026-08-27',
  },
  inputs: ['Claudia Sheinbaum pidió una respuesta diplomática. La presidenta instruyó al canciller.'],
}).ok, true, 'a role stated in retained evidence may replace a named actor without a false rejection');
assert.ok(lintEventReport({
  event: {
    title: 'Carstens calls for a coordinated trade review',
    why: 'The central bank chief urged North American governments to coordinate.',
    url: 'https://example.com/carstens-context', date: '2026-08-27',
  },
  inputs: ['Agustín Carstens aboga por una revisión coordinada del acuerdo comercial.'],
}).flags.some((flag) => flag.includes('unsupported role')),
'unsupported office substitutions must also be caught in context, not only headlines');
assert.ok(lintEventReport({
  event: {
    title: 'Banxico chief calls for coordination',
    why: 'The proposal concerns the trade review.',
    url: 'https://example.com/former-carstens', date: '2026-08-27',
  },
  inputs: ['Agustín Carstens, exgobernador de Banxico, aboga por coordinación.'],
}).flags.some((flag) => flag.includes('unsupported role')),
'punctuation after a named actor must not let a former office become a current title');
assert.ok(lintEventReport({
  event: {
    title: 'Banking regulators ease the card-payment fee cap',
    why: 'Banxico and CNBV reduced the ceiling to 1.3 percent.',
    url: 'https://example.com/card-fees', date: '2026-08-27',
  },
  inputs: ['El nuevo anteproyecto implica una reducción y el tope de crédito queda en 1.3%'],
}).flags.some((flag) => flag.includes('proposal or draft')),
'a draft must not be rewritten as an action already taken');
assert.ok(lintEventReport({
  event: {
    title: 'Banking regulators soften the fee cap',
    why: 'The new ceiling is 1.3 percent.',
    url: 'https://example.com/soften-draft', date: '2026-08-27',
  },
  inputs: ['El nuevo anteproyecto suaviza el tope y plantea 1.3%.'],
}).flags.some((flag) => flag.includes('proposal or draft')),
'soften must not disguise a draft as a completed regulatory change');
for (const title of [
  'Congress approves the fee cap',
  'The regulator is implementing the fee cap',
  'Regulators are softening the fee cap',
]) {
  assert.ok(lintEventReport({
    event: {
      title,
      why: 'The ceiling would be 1.3 percent.',
      url: 'https://example.com/draft-inflection', date: '2026-08-27',
    },
    inputs: ['El nuevo anteproyecto plantea un tope de 1.3%.'],
  }).flags.some((flag) => flag.includes('proposal or draft')),
  `present and progressive completed-action wording must preserve draft status: ${title}`);
}
assert.equal(lintEventReport({
  event: {
    title: 'Lawmakers approve the proposed banking rule',
    why: 'The approved rule sets a new fee ceiling.',
    url: 'https://example.com/approved-rule', date: '2026-08-27',
  },
  inputs: ['Lawmakers approved the proposed banking rule and its new fee ceiling.'],
}).ok, true, 'evidence that records enactment must not remain frozen at the proposal stage');
for (const evidence of [
  'The draft asks Congress to approve the cap.',
  'La iniciativa plantea que el Congreso apruebe el tope.',
  'La propuesta busca aprobar el tope.',
]) {
  assert.ok(lintEventReport({
    event: {
      title: 'Congress approves the cap',
      why: 'The cap is now in force.',
      url: 'https://example.com/proposal-evidence', date: '2026-08-27',
    },
    inputs: [evidence],
  }).flags.some((flag) => flag.includes('proposal or draft')),
  `proposal grammar must not be mistaken for enactment evidence: ${evidence}`);
}
assert.equal(lintEventReport({
  event: {
    title: 'Congress approves the cap',
    why: 'The approved cap is now in force.',
    url: 'https://example.com/enacted-evidence', date: '2026-08-27',
  },
  inputs: ['Congress approved the cap. El Congreso aprobó el tope.'],
}).ok, true, 'an actual completed approval in retained evidence must support final wording');
assert.equal(lintEventReport({
  event: {
    title: 'Lawmakers approve the proposed cap after a final vote',
    why: 'The approved cap is now in force.',
    url: 'https://example.com/plural-enactment', date: '2026-08-27',
  },
  inputs: ['Lawmakers approve the proposed cap after a final vote.'],
}).ok, true, 'a plural public actor plus an indicative base verb must count as enactment evidence');
assert.equal(lintEventReport({
  event: {
    title: 'Congress approves the cap',
    why: 'Congress approved it today.',
    url: 'https://example.com/separate-evidence-rows', date: '2026-08-27',
  },
  inputs: ['Draft would lower fees.', 'Congress approved it today.'],
}).ok, true, 'modality in one retained evidence row must not bleed into a separate enacted report');
assert.ok(lintEventReport({
  event: {
    title: 'Mexico adds over 1 million informal workers',
    why: 'The monthly increase was a record tracking labor-market deterioration.',
    url: 'https://example.com/labor', date: '2026-08-27',
  },
  inputs: ['La informalidad registró un incremento mensual de 1.084 millones de trabajadores.'],
}).flags.some((flag) => flag.includes('unsupported evidence qualifier')),
'record and other superlative claims require the retained source to make that comparison');
assert.ok(lintEventReport({
  event: {
    title: 'Mexico posts its largest monthly increase',
    why: 'The report calls it the highest result.',
    url: 'https://example.com/polarity', date: '2026-08-27',
  },
  inputs: ['México registró el menor aumento mensual del periodo.'],
}).flags.some((flag) => flag.includes('unsupported evidence qualifier')),
'a lower or smaller comparison must not support a highest or largest claim');
assert.equal(lintEventReport({
  event: {
    title: 'Sheinbaum proposes constitutional reform to bar dual citizens from presidency and governorships',
    why: 'Mexico\'s president introduced a draft constitutional reform requiring officeholders to renounce another citizenship and blocking dual citizens during their term.',
    url: 'https://example.com/reform', date: '2026-08-27',
  },
  inputs: ['Sheinbaum presenta iniciativa. La reforma plantea una renuncia a otra ciudadanía.'],
}).ok, true, 'copy that preserves a proposal’s procedural stage must pass');
assert.equal(lintEventReport({
  event: {
    title: 'Regulators propose reducing the card fee cap',
    why: 'The draft would set a 1.3 percent ceiling.',
    url: 'https://example.com/propose-reducing', date: '2026-08-27',
  },
  inputs: ['El nuevo anteproyecto plantea reducir el tope a 1.3%.'],
}).ok, true, 'a proposal verb plus its proposed action must remain publishable');
assert.ok(lintEventReport({
  event: {
    title: 'Congress approves the proposed card fee cap',
    why: 'The ceiling is 1.3 percent.',
    url: 'https://example.com/approve-proposed', date: '2026-08-27',
  },
  inputs: ['El nuevo anteproyecto plantea un tope de 1.3%.'],
}).flags.some((flag) => flag.includes('proposal or draft')),
'calling a cap proposed must not excuse an unsupported claim that Congress approved it');
assert.ok(lintEventReport({
  event: {
    title: 'Congress approves the proposal, which would reduce the cap',
    why: 'The draft describes a 1.3 percent ceiling.',
    url: 'https://example.com/subordinate-modal', date: '2026-08-27',
  },
  inputs: ['El anteproyecto plantea reducir el tope a 1.3%.'],
}).flags.some((flag) => flag.includes('proposal or draft')),
'a modal in a subordinate clause must not excuse an unsupported final approval');
assert.equal(lintEventReport({
  event: {
    title: 'Congress would approve the proposal under the draft timetable',
    why: 'The draft describes a 1.3 percent ceiling.',
    url: 'https://example.com/governing-modal', date: '2026-08-27',
  },
  inputs: ['El anteproyecto plantea que el Congreso aprobaría la propuesta y fija un tope de 1.3%.'],
}).ok, true, 'a modal that directly governs the approval must preserve proposal status');
assert.equal(lintEventReport({
  event: {
    title: 'Sinaloa Congress appoints Graciela Domínguez interim governor',
    why: 'The state legislature swore her in for 14 months.',
    url: 'https://example.com/sinaloa', date: '2026-08-25',
  },
  inputs: ['El Congreso de Sinaloa designa a Graciela Domínguez como gobernadora interina por 14 meses.'],
}).ok, true, 'a leading article plus institution must not be mistaken for a person whose role was replaced');
assert.equal(lintEventReport({
  event: {
    title: 'Credit access falls for the smallest companies',
    why: 'The report covers companies with up to 100 employees.',
    url: 'https://example.com/credit', date: '2026-08-24',
  },
  inputs: ['Cae el acceso al crédito entre las empresas más pequeñas, con hasta 100 empleados.'],
}).ok, true, 'a sourced Spanish size comparison may be translated faithfully');
assert.ok(lintReportText({
  text: 'Federal transfers are losing momentum and tightening fiscal room.',
  inputs: ['Federal transfers are losing momentum and tightening fiscal room.'],
}).flags.some((flag) => flag.startsWith('vague newsroom phrase')), 'automated copy must reject vague pseudo-analysis');
for (const copy of [
  'The central bank maintained its hawkish stance.',
  'The central bank took a dovish turn.',
  'The decision is shaping expectations.',
  'Congress presses Mexico hard.',
]) {
  assert.equal(lintReportText({ text: copy, inputs: [copy] }).ok, false,
    `factual copy must reject insider or editorial shorthand: ${copy}`);
}
assert.equal(lintReportText({
  text: 'Federal revenue shared with the states grew 0.9% from a year earlier.',
  inputs: ['Federal revenue shared with the states grew 0.9% from a year earlier.'],
}).ok, true, 'plain actor-action copy must pass the report gate');
assert.equal(lintReportText({
  text: 'Mexico deployed 1,500 military personnel.',
  inputs: ['México desplegó 1.500 militares.'],
}).ok, true, 'Spanish and English thousands separators must describe the same sourced number');
assert.equal(lintReportText({
  text: 'Inflation was 3.12%.',
  inputs: ['La inflación fue de 3,12%.'],
}).ok, true, 'Spanish and English decimal separators must describe the same sourced number');
assert.equal(lintReportText({
  text: 'Inflation was 3.4%.',
  inputs: ['Inflation was 3.37%.'],
}).ok, false, 'locale normalization must not allow model rounding');
assert.ok(lintAnalysisText({
  text: 'This could have implications for investors.',
  inputs: ['This could have implications for investors.'],
  role: 'view',
}).flags.some((flag) => flag.startsWith('vague analysis')), 'generic significance language must fail the analysis gate');
assert.ok(lintAnalysisText({
  text: 'This matters.',
  inputs: ['This matters.'],
  role: 'view',
}).flags.some((flag) => flag.startsWith('empty evaluation')), 'an empty judgment must fail the analysis gate');
assert.equal(lintAnalysisText({
  text: 'The headline overstates the immediate hit because covered goods are excluded.',
  inputs: ['The headline overstates the immediate hit because covered goods are excluded.'],
  role: 'view',
}).ok, true, 'a concrete view with a mechanism must pass');
assert.ok(lintAnalysisText({
  text: 'The outcome remains uncertain.',
  inputs: ['The outcome remains uncertain.'],
  role: 'prediction',
}).flags.includes('watch item has no observable next test'), 'a watch item without an observable test must fail the analysis gate');
assert.ok(lintAnalysisText({
  text: 'The ownership cap limits the number of eligible bidders, which reduces competition for the contract.',
  inputs: ['The ownership cap limits the number of eligible bidders.'],
  role: 'view',
}).ok, 'ordinary causal verbs must count as a concrete mechanism without requiring the word because');
assert.ok(lintAnalysisText({
  text: 'The next ruling will show whether the tariff applies. A finding of no injury would weaken the case.',
  inputs: ['The next ruling will determine whether a tariff applies. A finding can show no injury.'],
  role: 'prediction',
}).ok, 'a concrete next decision and an observable test are useful looking-ahead analysis');
assert.ok(lintAnalysisText({
  text: 'The $1 billion number is nice. Permits matter more.',
  inputs: ['$1 billion investment in five projects.'],
  role: 'view',
  requireScale: true,
}).flags.some((flag) => flag.startsWith('empty evaluation')), 'empty praise must never pass as analysis');
assert.ok(lintAnalysisText({
  text: 'The projects account for 7.8% of the first awarded package, so they are large enough to test the model.',
  inputs: ['The projects account for 7.8% of the first awarded package.'],
  role: 'view',
  requireScale: true,
}).ok, 'an announcement number with a denominator and mechanism should pass');
assert.ok(lintAnalysisText({
  text: 'The 578 MW package is 7.8% of awarded capacity, so it tests the model without proving it can scale.',
  inputs: ['A renewable-power package was announced.'],
  role: 'view',
  requireScale: true,
  checkNumbers: false,
}).ok, 'publication QA must not reject analysis already grounded against article text that is not persisted');
assert.ok(lintAnalysisText({
  text: 'The base case is that construction starts in December. That view would change if the remaining projects reach construction on schedule.',
  inputs: ['Construction starts in December. The remaining projects are scheduled to begin later.'],
  role: 'prediction',
  forbidFirstPerson: true,
}).ok, 'a likely outcome with a change-of-mind condition should pass');
assert.ok(lintAnalysisText({
  text: 'My base case is that construction starts in December. I would change that view if the schedule slips.',
  inputs: ['Construction starts in December. The schedule may slip.'],
  role: 'prediction',
  forbidFirstPerson: true,
}).flags.includes('first person is not part of the publication voice'), 'Briefly Explained must reject first-person analysis');
assert.equal(domainTrusted('actionforex.com'), false, 'an unknown GDELT publisher must not enter the public wire');
assert.equal(domainTrusted('graphics.reuters.com'), true, 'subdomains of an allowlisted publisher must remain eligible');
assert.equal(publicHeadlineEligible('Ozempic study compares pérdida de peso'), false, 'the word peso as weight must not create a Mexico match');
assert.equal(publicHeadlineEligible('Peso gains against the dollar during USMCA talks'), true, 'a Mexico currency headline must remain eligible');
assert.equal(publicHeadlineEligible('Why Mexico is the next big thing?'), false, 'question-style and sensational framing must not enter the public wire');
assert.equal(eventCandidateEligible({
  sourceName: 'The Mexico Political Economist',
  url: 'https://mxpe.org/p/mexico-oil-future',
}, registry.sources), false, 'a trusted commentary feed must not become a factual Brief event during keyless fallback');
assert.equal(eventCandidateEligible({
  sourceName: 'El Economista',
  url: 'https://eleconomista.com.mx/opinion/a-column',
}, registry.sources), false, 'an outlet opinion URL must not become a factual Brief event');
assert.equal(eventCandidateEligible({
  sourceName: 'El Economista',
  url: 'https://eleconomista.com.mx/economia/a-policy-decision',
}, registry.sources), true, 'reported coverage from the same outlet must remain eligible');
assert.equal(
  cleanNewsText('&amp;lt;img src=x onerror=alert(1)&amp;gt;Mexico inflation falls'),
  'Mexico inflation falls',
  'encoded external markup must become plain text before entering the ledger',
);
assert.equal(newsCollectionHealth({ aliveSources: 36, totalSources: 72, wireCount: 1 }).ok, true);
assert.equal(newsCollectionHealth({ aliveSources: 35, totalSources: 72, wireCount: 1 }).ok, false,
  'a majority feed outage must stop publication');
assert.equal(newsCollectionHealth({ aliveSources: 72, totalSources: 72, wireCount: 0 }).ok, false,
  'an empty rolling wire must stop publication');

const sourceByName = new Map(registry.sources.map((source) => [source.name, source]));
assert.equal(sourceByName.get('El País — México')?.mx, true, 'the broad El País feed must pass the Mexico relevance gate');
assert.equal(registry.sources.some((source) => source.id === 'animalpolitico'), false, 'a feed with no successful run must not remain in the active registry');
assert.equal(wire.meta.count, wire.articles.length, 'the public wire count must describe the published slice');
for (const article of wire.articles) {
  const registered = sourceByName.get(article.sourceName);
  assert.ok(registered || domainTrusted(article.domain), `public wire publisher is neither registered nor allowlisted: ${article.domain}`);
  assert.ok(publicHeadlineEligible(article.title), `${article.sourceName} item fails the public headline gate`);
}

const feedData = fs.readFileSync(path.join(root, '_data/feed.js'), 'utf8');
const eleventyConfig = fs.readFileSync(path.join(root, '.eleventy.js'), 'utf8');
const homepageTemplate = fs.readFileSync(path.join(root, 'index.njk'), 'utf8');
const spanishFeedSource = fs.readFileSync(path.join(root, '_data/feedEs.js'), 'utf8');
const happeningBuilder = fs.readFileSync(path.join(root, 'pipeline/build-happening.js'), 'utf8');
const briefBuilder = fs.readFileSync(path.join(root, 'pipeline/build-brief.js'), 'utf8');
assert.doesNotMatch(homepageTemplate, /item\.(?:orig|lang)/, 'the English homepage must not print alternate-language title metadata');
assert.match(spanishFeedSource, /w\.lang === 'ES' && w\.orig \? w\.orig/, 'the Spanish edition must still restore native Spanish titles');
assert.doesNotMatch(homepageTemplate, /from ['"]\/assets\/mb\.js/, 'the homepage must not download the full render toolkit for one time helper');
assert.doesNotMatch(homepageTemplate, /fetch\(['"]\/data\/health\.json/, 'homepage source status must be embedded at build time');
assert.match(eleventyConfig, /setNunjucksEnvironmentOptions\(\{\s*autoescape:\s*true\s*\}\)/,
  'Nunjucks must escape external feed values unless a template explicitly marks trusted markup safe');
// The disclosure moved into the feed's BE panel. The bar is unchanged and now lives in
// _data/feed.js: a story only carries a `why` when the pipeline wrote a complete,
// versioned analysis for it, and the panel does not render without one.
assert.match(feedData, /why: story\.view \|\| story\.bg/, 'only versioned, complete analysis may expose the disclosure');
// This week is a reading list (Alan, 2026-08-02): wire cards must never render a
// Briefly explained panel. The analysis layer exists only under the selected story lanes,
// so the week loop must not reference item.why / item.bg / item.view at all.
{
  const weekBlock = homepageTemplate.slice(homepageTemplate.indexOf('id="sec-week"'), homepageTemplate.indexOf('id="sec-coming"'));
  assert.doesNotMatch(weekBlock, /item\.(why|bg|view|watch)/, 'week cards must not carry an analysis panel');
  assert.doesNotMatch(weekBlock, /be-btn|be-panel/, 'week cards must not render BE controls');
}
// The brief still comes before the stories it summarises.
assert.ok(homepageTemplate.indexOf('class="brief-p"') < homepageTemplate.indexOf('for storySection in f.storySections'), 'the Brief must render before the selected stories');
assert.match(homepageTemplate, /data-iso="\{\{ f\.date \}\}"[\s\S]*data-edition-stories[\s\S]*I18N\.updateDelayed/,
  'a stale deployment must say the update is delayed and hide stale edition cards');
assert.doesNotMatch(homepageTemplate, /editionDate\.textContent\s*=.*quietToday/,
  'the client must never rewrite an outage into a current quiet edition');
assert.match(homepageTemplate, /L\.weekendBrief if f\.weekend else L\.brief/,
  'Saturday and Sunday must identify the catch-up product as the Weekend recap');
assert.match(homepageTemplate, /storySection\.kind == 'weekend'[\s\S]*L\.newThisWeekend[\s\S]*storySection\.kind == 'week-recap'[\s\S]*L\.weekRecap/,
  'weekend stories must be visibly separated from the Monday-Friday recap');
assert.match(feedData, /week: brief\.weekendEdition \? \[\] : weekItems/,
  'the separate This week shelf must disappear when the selected Brief already is the weekly recap');
assert.match(feedData, /lane: story\.lane/,
  'language snapshots and renderers must retain each story’s dated selection lane');
assert.match(briefBuilder, /const picked = rankedPicked/,
  'optional analysis must never remove or reorder the locked factual selection');
assert.match(briefBuilder, /selectEditionBrief\(candidates/, 'the two story lanes must share the auditable importance-first selector');
assert.doesNotMatch(briefBuilder, /BIG_MONEY|bigCapital/, 'a dollar-amount regex must not override the audited importance rubric');
assert.doesNotMatch(briefBuilder, /priorApproved|carriedForward/,
  'a quiet edition must never recertify the prior story set as today');
assert.match(briefBuilder, /prev\.meta\.summaryMode !== 'selection-placeholder'[\s\S]*await writeSummary\(picked\)[\s\S]*summaryMode/,
  'the final build must replace the selection lock placeholder with finished Brief copy');
assert.match(briefBuilder, /if \(!picked\.length\)[\s\S]*quiet:\s*true[\s\S]*lead:\s*null[\s\S]*items:\s*\[\]/,
  'a genuinely quiet day must publish an explicit, receipt-compatible empty state');
assert.match(briefBuilder, /if \(!picked\.length\)[\s\S]*const contentSig = fingerprint\(\[\]\)[\s\S]*words: 8, contentSig/,
  'a quiet edition must persist the same content signature the publication validator computes');
for (const phrase of [/\bThe base case is\b/i, /\bThat view would change if\b/i]) {
  assert.ok(dailyBrief.stories.filter((story) => phrase.test(story.prediction || '')).length <= 1, 'BE predictions must not repeat a stock forecast phrase');
}
assert.match(happeningBuilder, /strictForecast: field === 'prediction'/, 'every generated BE watch item must include an observable next test');
assert.match(happeningBuilder, /const approvedThisRun = new Map\(\)/, 'approved retry fields must be scoped to one locked publication run');
assert.match(happeningBuilder, /const approvedRefsThisRun = new Map\(\)/, 'each approved field must retain the exact evidence IDs it used');
assert.match(happeningBuilder, /corrections: rejectionsThisRun\.get\(x\.e\.id\) \|\| \{\}/,
  'a bounded retry must receive the exact deterministic reasons each missing field failed');
assert.match(happeningBuilder, /mergeApprovedAttempt\(approvedThisRun\.get\(item\.e\.id\), proposed, CORE\)/,
  'a bounded retry may complete the same evidence-locked BE unit');
assert.match(happeningBuilder, /CORE\.every\(\(field\) => approved\[field\] && arr\(approvedRefs\[field\]\)\.length\)/,
  'no BE field may become visible until all three fields and their evidence references have passed their gates');
assert.doesNotMatch(happeningBuilder, /\[brief\.lead, \.\.\.arr\(brief\.items\)\]\.slice\(0, 3\)/,
  'targeted explanation must cover the full locked selection, not only the first three stories');
assert.match(happeningBuilder, /SCHEDULED OUTCOMES \(hard requirement\)[\s\S]*SELECT it[\s\S]*unchanged[\s\S]*not news/i,
  'the curator must treat an unchanged scheduled decision as a required new outcome');
assert.match(happeningBuilder, /ASSESS EVERY candidate[\s\S]*decisionCoverage\(cands\.length, out\.decisions\)[\s\S]*model decision receipt incomplete[\s\S]*mode: 'deterministic-fallback'[\s\S]*assessedCount: cands\.length/,
  'an incomplete paid response must fall back to a complete local assessment instead of being retried hourly');
assert.match(happeningBuilder, /freshCandidateCount:[\s\S]*complete: Boolean\(details\.complete\)/,
  'the event log must retain whether fresh exact-day candidates were fully assessed');
assert.match(happeningBuilder, /mode: 'deterministic-fallback',[\s\S]*complete: true,[\s\S]*assessedCount: cands\.length/,
  'a model outage must use the conservative local assessment instead of freezing the entire Brief');
assert.match(happeningBuilder, /repairPayload = rejected\.map[\s\S]*This is a copy repair only: do not change which item was selected[\s\S]*repaired generated event/,
  'a selected factual report gets exactly one evidence-locked copy repair instead of disappearing');
assert.doesNotMatch(happeningBuilder, /rejectedTitle|rejectedWhy/,
  'copy repair must use source evidence rather than repeating prose that already failed the gate');
assert.match(happeningBuilder, /rejectedSelected = rejected\.map[\s\S]*freshRejectedCount[\s\S]*currentDayResolved: freshRejectedCount === 0/,
  'unresolved selected current-day facts must remain visible in the receipt and block a false quiet day');
assert.match(happeningBuilder, /--resume-current-edition[\s\S]*canReuseCuration[\s\S]*checkpoint still matches the source ledger/,
  'a retry may reuse paid curation only while the eligible source ledger is unchanged');
assert.match(happeningBuilder, /canReuseCuration\(checkpoint[\s\S]*mergeLog\(existing, \[\], now\)[\s\S]*self-healed the event log/,
  'checkpoint reuse must still run deterministic event-log self-healing before returning');
assert.match(happeningBuilder, /new eligible reporting arrived[\s\S]*invalidating the earlier curation checkpoint/,
  'new reporting must force the hourly retry to reassess the edition');
assert.match(briefBuilder, /curationReadiness\(P\.curation, editorialDate[\s\S]*curation is incomplete/,
  'the Brief must fail closed rather than advance the dateline after failed fresh-story curation');
assert.match(briefBuilder, /optionalAnalysis\(e\)/, 'the brief builder must expose approved analysis atomically');

console.log('homepage-feed-contract: ok');
