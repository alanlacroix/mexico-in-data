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
const { coverageForDay, groupEvents } = require(path.join(root, 'pipeline/lib/news-threads.cjs'));
const { recentEvents } = require(path.join(root, 'pipeline/lib/news-window.cjs'));
const dailyBriefFactory = require(path.join(root, '_data/dailyBrief.js'));
const latestStoriesFactory = require(path.join(root, '_data/latestStories.js'));
const homeEditorialFactory = require(path.join(root, '_data/homeEditorial.js'));
const dailyBrief = dailyBriefFactory();
const latestStories = latestStoriesFactory();
const currentEditorial = homeEditorialFactory();
const nowBoard = require(path.join(root, '_data/nowBoard.js'))();
const registry = require(path.join(root, 'pipeline/news-sources.json'));
const wire = require(path.join(root, 'data/news/wire.json'));

assert.equal(editorialDay('2026-07-21T03:00:00Z'), '2026-07-20', 'the editorial day must not roll over at UTC midnight');
assert.equal(editorialDay('2026-07-21T07:00:00Z'), '2026-07-21', 'the editorial day must follow Mexico City');

assert.match(dailyBrief.editorialDate, /^\d{4}-\d{2}-\d{2}$/);
assert.ok(dailyBrief.stories.every((story) => Date.parse(story.date) <= Date.parse(dailyBrief.editorialDate)), 'the brief must not contain future-dated stories');
assert.ok(dailyBrief.stories.length <= 5, 'the brief must never show more than five key developments');
assert.ok(dailyBrief.stories.every((story) => story.analysisV >= 7 && story.bg && story.view && story.prediction), 'every key development must include a complete approved BE unit');
assert.ok(dailyBrief.summaryLead && dailyBrief.summaryLead.trim().length >= 40, 'the homepage must always contain a substantive Brief');
assert.ok(latestStories.every((story) => Date.parse(story.date) <= Date.parse(dailyBrief.editorialDate)), 'recent headlines must not contain future-dated stories');
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
assert.equal(acrossDays.length, 2, 'a new editorial day must get its own event state');
assert.deepEqual(coverageForDay('2026-07-21', acrossDays[1].event, acrossDays[1].event.coverage || [], acrossDays[0].event), [
  { source: 'Today', url: 'https://example.com/today', publishedAt: '2026-07-21T14:00:00Z', date: '2026-07-21', title: 'USTR updates the USMCA review talks', summary: '' },
], 'today’s card must not retain a prior-day report');

const officialThenNewer = groupEvents([
  { date: '2026-07-21', title: 'USTR opens the USMCA review talks', source: 'USTR', url: 'https://ustr.gov/example', publishedAt: '2026-07-21T12:00:00Z' },
  { date: '2026-07-21', title: 'USTR opens the USMCA review discussions', source: 'Outlet C', url: 'https://example.com/c', publishedAt: '2026-07-21T15:00:00Z' },
]);
assert.equal(officialThenNewer[0].event.source, 'Outlet C', 'a newer report must define the current state even when an older source is first-party');

const requiredNumbers = new Set(['banxico-usdmxn-fix', 'banxico-inflacion', 'banxico-tasa-objetivo', 'banxico-igae', 'banxico-exports-total', 'banxico-remesas']);
assert.deepEqual(new Set(nowBoard.map((item) => item.id)), requiredNumbers, 'Latest numbers must remain a finite first-party set');
assert.ok(nowBoard.every((item) => item.date && item.source && item.compare && !/\btoday\b/i.test(item.compare)), 'every number needs its own date, source, and honest comparison');
assert.ok(nowBoard.every((item) => item.dateLead && item.updateLabel && item.actionLabel), 'every number must explain its observation date, update schedule, and destination');
assert.equal(nowBoard.find((item) => item.id === 'banxico-usdmxn-fix')?.href, 'https://www.google.com/finance/quote/USD-MXN?hl=en', 'the peso card must open a clearly labeled live quote');
assert.equal(nowBoard.find((item) => item.id === 'banxico-tasa-objetivo')?.updateLabel, 'Can change at policy meetings', 'the policy rate must not imply that it changes daily');

assert.ok(lintReportText({ text: 'One claim; another claim.', inputs: ['One claim', 'another claim'] }).flags.includes('semicolon'), 'public model copy must reject semicolons');
assert.ok(lintReportText({
  text: 'Federal transfers are losing momentum and tightening fiscal room.',
  inputs: ['Federal transfers are losing momentum and tightening fiscal room.'],
}).flags.some((flag) => flag.startsWith('vague newsroom phrase')), 'automated copy must reject vague pseudo-analysis');
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

const homepageTemplate = fs.readFileSync(path.join(root, 'index.njk'), 'utf8');
const happeningBuilder = fs.readFileSync(path.join(root, 'pipeline/build-happening.js'), 'utf8');
const briefBuilder = fs.readFileSync(path.join(root, 'pipeline/build-brief.js'), 'utf8');
assert.doesNotMatch(homepageTemplate, /from ['"]\/assets\/mb\.js/, 'the homepage must not download the full render toolkit for one time helper');
assert.doesNotMatch(homepageTemplate, /fetch\(['"]\/data\/health\.json/, 'homepage source status must be embedded at build time');
assert.match(homepageTemplate, /\(not isAll\).*story\.analysisV >= 7.*story\.bg and story\.view and story\.prediction/, 'only versioned, complete key-development analysis may expose the disclosure');
assert.match(homepageTemplate, /storyCard\(story, true\)/, 'ordinary headlines must use the no-analysis card mode');
assert.ok(homepageTemplate.indexOf('<section class="brief" id="brief"') < homepageTemplate.indexOf('<section class="news"'), 'the Brief must render before key developments');
assert.match(briefBuilder, /return gate\.ok && analysisReady\(e\) && e\.url && e\.source/, 'an unreviewed story must not enter key developments');
assert.match(briefBuilder, /if \(priorApproved\)[\s\S]*keeping the last reviewed brief/, 'an incomplete refresh must preserve the last reviewed Brief');
for (const phrase of [/\bThe base case is\b/i, /\bThat view would change if\b/i]) {
  assert.ok(dailyBrief.stories.filter((story) => phrase.test(story.prediction || '')).length <= 1, 'BE predictions must not repeat a stock forecast phrase');
}
assert.match(happeningBuilder, /strictForecast: field === 'prediction'/, 'every generated BE forecast must include a base case and a change-of-mind condition');
assert.match(happeningBuilder, /CORE\.every\(\(field\) => proposed\[field\]\)/, 'the three BE fields must be approved together, never assembled across runs');
assert.match(briefBuilder, /Number\(e\.analysisV\) >= 7/, 'the brief builder must withhold unapproved BE analysis');

console.log('homepage-feed-contract: ok');
