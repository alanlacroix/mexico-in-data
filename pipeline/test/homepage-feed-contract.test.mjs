import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintReportText, lintAnalysisText } from '../lib/lint.js';
import { domainTrusted, publicHeadlineEligible } from '../lib/news-trust.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { editorialDay } = require(path.join(root, 'pipeline/lib/news-day.cjs'));
const { currentHomeEditorial } = require(path.join(root, 'pipeline/lib/home-editorial.cjs'));
const { groupEvents, sameThread } = require(path.join(root, 'pipeline/lib/news-threads.cjs'));
const { recentEvents } = require(path.join(root, 'pipeline/lib/news-window.cjs'));
const dailyBriefFactory = require(path.join(root, '_data/dailyBrief.js'));
const latestStoriesFactory = require(path.join(root, '_data/latestStories.js'));
const homeEditorialFactory = require(path.join(root, '_data/homeEditorial.js'));
const dailyBrief = dailyBriefFactory();
const latestStories = latestStoriesFactory();
const currentEditorial = homeEditorialFactory();
const nowBoard = require(path.join(root, '_data/nowBoard.js'))();
const boards = require(path.join(root, '_data/boards.js'))();
const registry = require(path.join(root, 'pipeline/news-sources.json'));
const wire = require(path.join(root, 'data/news/wire.json'));
const happening = require(path.join(root, 'data/happening.json'));

assert.equal(editorialDay('2026-07-21T03:00:00Z'), '2026-07-20', 'the editorial day must not roll over at UTC midnight');
assert.equal(editorialDay('2026-07-21T07:00:00Z'), '2026-07-21', 'the editorial day must follow Mexico City');

assert.match(dailyBrief.editorialDate, /^\d{4}-\d{2}-\d{2}$/);
assert.ok(dailyBrief.stories.every((story) => Date.parse(story.date) <= Date.parse(dailyBrief.editorialDate)), 'the brief must not contain future-dated stories');
assert.ok(dailyBrief.stories.length <= 5, 'the brief must never show more than five key developments');
assert.ok(dailyBrief.stories.every((story) => {
  const fields = [story.bg, story.view, story.prediction].filter((value) => String(value || '').trim());
  return (story.analysisV >= 7 && fields.length === 3) || (story.analysisV === 0 && fields.length === 0);
}), 'optional BE analysis must be complete and approved or absent as one atomic unit');
for (let i = 0; i < dailyBrief.stories.length; i += 1) {
  for (let j = i + 1; j < dailyBrief.stories.length; j += 1) {
    assert.equal(sameThread(dailyBrief.stories[i], dailyBrief.stories[j]), false, 'the rendered Brief must never repeat one event');
  }
}
assert.ok(dailyBrief.summaryLead && dailyBrief.summaryLead.trim().length >= 40, 'the homepage must always contain a substantive Brief');
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
if (currentEditorial) assert.ok(['My read', 'Connection to watch'].includes(currentEditorial.myRead?.label), 'a connection must state whether it is reviewed or deterministic');
assert.equal(dailyBriefFactory({}).editorialDate, dailyBrief.editorialDate, 'Eleventy’s data argument must not be mistaken for a clock');

const lastBriefDate = dailyBrief.briefEditorialDate;
const nextDay = new Date(`${lastBriefDate}T12:00:00Z`);
nextDay.setUTCDate(nextDay.getUTCDate() + 1);
const carriedBrief = dailyBriefFactory(nextDay);
assert.equal(carriedBrief.carryingLastBrief, true, 'a failed next-day refresh must keep the last successful brief visible');
assert.ok(carriedBrief.stories.length > 0, 'the last successful brief must not disappear during a short workflow failure');
assert.match(carriedBrief.windowLabel, /Latest brief/, 'carried developments must not be presented as a fresh rolling window');
assert.equal(homeEditorialFactory(nextDay), null, 'a prior-day My read must disappear on the next day');
assert.equal(
  currentHomeEditorial({ forDate: lastBriefDate, myRead: { text: 'Old note' } }, editorialDay(nextDay)),
  null,
  'an expired reviewed note must not be validated as current publication content',
);

const staleNow = new Date('2099-12-31T12:00:00Z');
const staleBrief = dailyBriefFactory(staleNow);
assert.equal(staleBrief.editorialDate, '2099-12-31', 'the wall-clock Mexico City day must be authoritative');
assert.equal(staleBrief.stories.length, 0, 'an old brief must not be carried indefinitely');
assert.match(staleBrief.summaryLead, /No major developments/i);
assert.equal(latestStoriesFactory(staleNow).length, 0, 'old headlines must still expire from the recent-news window');

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

// The homepage has two rooms: what changed since yesterday, and what is true. A number
// belongs to exactly one of them, and the daily strip may only carry series that a
// trading day actually moves. A monthly reading up there would be a lie of placement.
assert.ok(boards.today.length >= 4, 'the daily strip needs enough numbers to read as a strip');
assert.ok(boards.today.every((item) => item.cadence === 'daily'), 'the daily strip must only carry series that move on a trading day');
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
assert.ok(lintAnalysisText({
  text: 'This could have implications for investors.',
  inputs: ['This could have implications for investors.'],
  role: 'view',
}).flags.some((flag) => flag.startsWith('vague analysis')), 'generic significance language must fail the analysis gate');
assert.ok(lintAnalysisText({
  text: 'This matters.',
  inputs: ['This matters.'],
  role: 'view',
}).flags.includes('view has no concrete mechanism or tradeoff'), 'a judgment without a mechanism must fail the analysis gate');
assert.equal(lintAnalysisText({
  text: 'The headline overstates the immediate hit because covered goods are excluded.',
  inputs: ['The headline overstates the immediate hit because covered goods are excluded.'],
  role: 'view',
}).ok, true, 'a concrete view with a mechanism must pass');
assert.ok(lintAnalysisText({
  text: 'The outcome remains uncertain.',
  inputs: ['The outcome remains uncertain.'],
  role: 'prediction',
}).flags.includes('forecast states no likely outcome'), 'a forecast without a likely outcome must fail the analysis gate');
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
}).flags.includes('first person is reserved for the quarterly review'), 'Briefly Explained must reject first-person analysis');
assert.equal(domainTrusted('actionforex.com'), false, 'an unknown GDELT publisher must not enter the public wire');
assert.equal(domainTrusted('graphics.reuters.com'), true, 'subdomains of an allowlisted publisher must remain eligible');
assert.equal(publicHeadlineEligible('Ozempic study compares pérdida de peso'), false, 'the word peso as weight must not create a Mexico match');
assert.equal(publicHeadlineEligible('Peso gains against the dollar during USMCA talks'), true, 'a Mexico currency headline must remain eligible');
assert.equal(publicHeadlineEligible('Why Mexico is the next big thing?'), false, 'question-style and sensational framing must not enter the public wire');

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
const homepageTemplate = fs.readFileSync(path.join(root, 'index.njk'), 'utf8');
const spanishFeedSource = fs.readFileSync(path.join(root, '_data/feedEs.js'), 'utf8');
const happeningBuilder = fs.readFileSync(path.join(root, 'pipeline/build-happening.js'), 'utf8');
const briefBuilder = fs.readFileSync(path.join(root, 'pipeline/build-brief.js'), 'utf8');
assert.doesNotMatch(homepageTemplate, /item\.(?:orig|lang)/, 'the English homepage must not print alternate-language title metadata');
assert.match(spanishFeedSource, /w\.lang === 'ES' && w\.orig \? w\.orig/, 'the Spanish edition must still restore native Spanish titles');
assert.doesNotMatch(homepageTemplate, /from ['"]\/assets\/mb\.js/, 'the homepage must not download the full render toolkit for one time helper');
assert.doesNotMatch(homepageTemplate, /fetch\(['"]\/data\/health\.json/, 'homepage source status must be embedded at build time');
// The disclosure moved into the feed's BE panel. The bar is unchanged and now lives in
// _data/feed.js: a story only carries a `why` when the pipeline wrote a complete,
// versioned analysis for it, and the panel does not render without one.
assert.match(feedData, /why: story\.view \|\| story\.bg/, 'only versioned, complete analysis may expose the disclosure');
// This week is a reading list (Alan, 2026-08-02): wire cards must never render a
// Briefly explained panel. The analysis layer exists only under Today's stories,
// so the week loop must not reference item.why / item.bg / item.view at all.
{
  const weekBlock = homepageTemplate.slice(homepageTemplate.indexOf('id="sec-week"'), homepageTemplate.indexOf('id="sec-coming"'));
  assert.doesNotMatch(weekBlock, /item\.(why|bg|view|watch)/, 'week cards must not carry an analysis panel');
  assert.doesNotMatch(weekBlock, /be-btn|be-panel/, 'week cards must not render BE controls');
}
// The brief still comes before the stories it summarises.
assert.ok(homepageTemplate.indexOf('class="brief-p"') < homepageTemplate.indexOf('id="sec-stories"'), 'the Brief must render before key developments');
assert.doesNotMatch(briefBuilder, /analysisReady\(e\)/, 'optional analysis readiness must never decide whether a story enters key developments');
assert.match(briefBuilder, /selectDailyBrief\(candidates/, 'key developments must use the auditable importance-first selector');
assert.doesNotMatch(briefBuilder, /BIG_MONEY|bigCapital/, 'a dollar-amount regex must not override the audited importance rubric');
assert.match(
  briefBuilder,
  /if \(priorApproved\)[\s\S]*editorialDate[\s\S]*carriedForward:\s*true[\s\S]*fs\.writeFileSync\(OUT/,
  'a completed quiet-day review must preserve the approved story set while recording today\'s edition'
);
for (const phrase of [/\bThe base case is\b/i, /\bThat view would change if\b/i]) {
  assert.ok(dailyBrief.stories.filter((story) => phrase.test(story.prediction || '')).length <= 1, 'BE predictions must not repeat a stock forecast phrase');
}
assert.match(happeningBuilder, /strictForecast: field === 'prediction'/, 'every generated BE forecast must include a base case and a change-of-mind condition');
assert.match(happeningBuilder, /CORE\.every\(\(field\) => proposed\[field\]\)/, 'the three BE fields must be approved together, never assembled across runs');
assert.match(happeningBuilder, /SCHEDULED OUTCOMES \(hard requirement\)[\s\S]*SELECT it[\s\S]*unchanged[\s\S]*not news/i,
  'the curator must treat an unchanged scheduled decision as a required new outcome');
assert.match(briefBuilder, /optionalAnalysis\(e\)/, 'the brief builder must expose optional analysis atomically');

console.log('homepage-feed-contract: ok');
