import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { editorialDay } = require(path.join(root, 'pipeline/lib/news-day.cjs'));
const { coverageForDay, groupEvents } = require(path.join(root, 'pipeline/lib/news-threads.cjs'));
const dailyBriefFactory = require(path.join(root, '_data/dailyBrief.js'));
const latestStoriesFactory = require(path.join(root, '_data/latestStories.js'));
const homeEditorialFactory = require(path.join(root, '_data/homeEditorial.js'));
const dailyBrief = dailyBriefFactory();
const latestStories = latestStoriesFactory();
const currentEditorial = homeEditorialFactory();
const nowBoard = require(path.join(root, '_data/nowBoard.js'))();

assert.equal(editorialDay('2026-07-21T03:00:00Z'), '2026-07-20', 'the editorial day must not roll over at UTC midnight');
assert.equal(editorialDay('2026-07-21T07:00:00Z'), '2026-07-21', 'the editorial day must follow Mexico City');

assert.match(dailyBrief.editorialDate, /^\d{4}-\d{2}-\d{2}$/);
assert.ok(dailyBrief.stories.every((story) => story.date === dailyBrief.editorialDate), 'Worth knowing must contain today’s stories only');
assert.ok(latestStories.every((story) => story.date === dailyBrief.editorialDate), 'All headlines must contain today’s stories only');
if (currentEditorial) assert.ok(['My read', 'Connection to watch'].includes(currentEditorial.myRead?.label), 'a connection must state whether it is reviewed or deterministic');
assert.equal(dailyBriefFactory({}).editorialDate, dailyBrief.editorialDate, 'Eleventy’s data argument must not be mistaken for a clock');

const staleNow = new Date('2099-12-31T12:00:00Z');
const staleBrief = dailyBriefFactory(staleNow);
assert.equal(staleBrief.editorialDate, '2099-12-31', 'the wall-clock Mexico City day must be authoritative');
assert.equal(staleBrief.stories.length, 0, 'a failed next-day refresh must render an empty brief, not yesterday as today');
assert.match(staleBrief.summaryLead, /No major developments/i);
assert.equal(latestStoriesFactory(staleNow).length, 0, 'a failed next-day refresh must not retain yesterday’s headlines');
assert.equal(homeEditorialFactory(staleNow), null, 'a prior-day My read must disappear on the next day');

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

console.log('homepage-feed-contract: ok');
