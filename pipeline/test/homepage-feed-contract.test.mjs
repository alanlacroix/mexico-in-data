import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dailyBrief = require('../../_data/dailyBrief.js');
const edition = require('../../data/edition.json');
const feed = require('../../_data/feed.js');
const feedEs = require('../../_data/feedEs.js');
const weeklyTop = require('../../_data/weeklyTop.js');

const dayAfter = new Date(`${edition.editorialDate}T12:00:00Z`);
dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
const carried = dailyBrief(dayAfter, { edition }, 'en');
assert.equal(carried.editorialDate, edition.editorialDate, 'the dateline must remain the last-good edition date');
assert.equal(carried.carryingLastBrief, true);
assert.equal(carried.stories.length, edition.stories.length, 'a failed next day must not hide last-good cards');
assert.match(carried.summaryLead, /last complete edition/i);
assert.ok(carried.stories.every((story) => story.bg && story.view && story.prediction));
assert.ok(carried.stories.every((story) => story.analysisSources.length >= 1));

const exact = dailyBrief(new Date(`${edition.editorialDate}T18:00:00Z`), { edition }, 'en');
assert.equal(exact.carryingLastBrief, false);
assert.equal(exact.todayStories.length + exact.keyDevelopments.length, exact.stories.length);
assert.ok(exact.todayStories.every((story) => story.date === edition.editorialDate));
assert.deepEqual(feed().storySections.map((section) => section.kind), ['latest'],
  'the built weekday label must remain honest when served unchanged on a later day');

const spanish = dailyBrief(new Date(`${edition.editorialDate}T18:00:00Z`), { edition }, 'es');
assert.deepEqual(spanish.stories.map((story) => story.id), exact.stories.map((story) => story.id));
assert.equal(spanish.stories[0].title, edition.stories[0].es.headline);
assert.notEqual(spanish.stories[0].title, edition.stories[0].en.headline);

const built = feed();
assert.equal(built.stories.length, edition.stories.length, 'the live feed must keep the full last-good edition');
assert.ok(built.stories.every((story) => story.be), 'every edition card must expose Briefly Explained');
assert.deepEqual(feedEs().stories.map((story) => story.id), built.stories.map((story) => story.id));
assert.deepEqual(
  weeklyTop('en').groups.flatMap((group) => group.items).map((story) => story.id).sort(),
  edition.weekStories.map((story) => story.id).sort(),
  'the topic shelf must come only from the same edition artifact',
);
assert.equal(
  weeklyTop('es').groups.flatMap((group) => group.items)[0].title,
  edition.weekStories[0].es.headline,
  'the weekly shelf must use the Spanish copy published atomically with English',
);

console.log('homepage-feed contract: ok');
