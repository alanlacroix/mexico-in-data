import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
assert.equal(exact.todayStories.length + exact.keyDevelopments.length + exact.weekendStories.length + exact.weekRecapStories.length, exact.stories.length);
assert.ok(exact.todayStories.every((story) => story.date === edition.editorialDate));
assert.deepEqual(feed().storySections.map((section) => section.kind), edition.editionType === 'weekend-recap' ? ['week-recap'] : ['latest'],
  'the built weekday label must remain honest when served unchanged on a later day');

const spanish = dailyBrief(new Date(`${edition.editorialDate}T18:00:00Z`), { edition }, 'es');
assert.deepEqual(spanish.stories.map((story) => story.id), exact.stories.map((story) => story.id));
assert.equal(spanish.stories[0].title, edition.stories[0].es.headline);
assert.notEqual(spanish.stories[0].title, edition.stories[0].en.headline);

const built = feed();
assert.equal(built.stories.length, edition.stories.length, 'the live feed must keep the full last-good edition');
assert.ok(built.stories.every((story) => story.be), 'every edition card must expose Briefly Explained');
assert.deepEqual(feedEs().stories.map((story) => story.id), built.stories.map((story) => story.id));
function assertShelfCopies(shelf, artifact, locale) {
  const sourceById = new Map(artifact.weekStories.map(story => [story.id, story]));
  const rows = shelf.groups.flatMap(group => group.items);
  assert.ok(rows.length >= Math.min(4, artifact.weekStories.length));
  assert.equal(new Set(rows.map(story => story.id)).size, rows.length);
  for (const group of shelf.groups) assert.ok(group.items.length <= 4);
  for (const story of rows) {
    const source = sourceById.get(story.id);
    assert.ok(source, 'the topic shelf must come only from the same edition artifact');
    assert.equal(story.title, source[locale].headline,
      'each grouped story must use its own atomically published language copy');
    assert.equal(story.dek, source[locale].dek);
  }
}
for (const locale of ['en', 'es']) assertShelfCopies(weeklyTop(locale), edition, locale);
assert.deepEqual(weeklyTop('en').groups.map(group => group.items.map(story => story.id)),
  weeklyTop('es').groups.map(group => group.items.map(story => story.id)));

// Topic grouping can move yesterday's economy story ahead of today's energy story.
// Exercise the actual renderer against a valid fixture in memory; never edit data/.
const publicEdition = require('../lib/public-edition.cjs');
const rendererPath = fileURLToPath(new URL('../../_data/weeklyTop.js', import.meta.url));
function renderFixture(artifact) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(rendererPath, 'utf8'), {
    module, __dirname: path.dirname(rendererPath),
    require: id => id === 'node:fs' ? { readFileSync: () => JSON.stringify(artifact) }
      : id === '../pipeline/lib/public-edition.cjs' ? publicEdition : require(id),
  });
  return module.exports;
}
// Synthetic one-story editions must keep an exact-day card and cannot borrow
// Sunday's special current-story mirror after removing its corresponding card.
const baseCurrentStory = edition.editionType === 'daily'
  ? edition.stories.find(story => story.date === edition.editorialDate) : edition.stories[0];
const baseWeekStory = edition.weekStories.find(story => story.id === baseCurrentStory.id);
const currentWeekStart = edition.weeklyBrief?.start || edition.editorialDate;
const otherWeekStory = edition.weekStories.find(story => story.id !== baseWeekStory.id
  && story.url !== baseWeekStory.url && story.date >= currentWeekStart)
  || { ...baseWeekStory, url: `${baseWeekStory.url}#fixture-economy` };
const fixture = publicEdition.withArtifactHash({ ...edition, stories: [{ ...baseCurrentStory, section: 'energy' }], weekStories: [
  { ...baseWeekStory, section: 'energy' },
  { ...otherWeekStory, id: 'fixture-economy', section: 'economy' },
] });
const reordered = renderFixture(fixture)('es');
assert.equal(reordered.groups[0].items[0].id, 'fixture-economy');
assertShelfCopies(reordered, fixture, 'es');
const wrongCopy = JSON.parse(JSON.stringify(reordered));
wrongCopy.groups[0].items[0].title = fixture.weekStories[0].en.headline;
assert.throws(() => assertShelfCopies(wrongCopy, fixture, 'es'), /atomically published/);

const crowded = publicEdition.withArtifactHash({ ...edition, stories: [{ ...baseCurrentStory, id: 'fixture-crowded-0', section: 'economy' }], weekStories: Array.from({ length: 6 }, (_, i) => ({
  ...baseWeekStory, id: `fixture-crowded-${i}`, section: i % 2 ? 'money' : 'economy',
  url: i === 0 ? baseWeekStory.url : `${baseWeekStory.url}#fixture-${i}`,
})) });
const limited = renderFixture(crowded)('es');
assert.deepEqual(Array.from(limited.groups[0].items, story => story.id),
  ['fixture-crowded-0', 'fixture-crowded-1', 'fixture-crowded-2', 'fixture-crowded-3'],
  'the topic shelf intentionally displays the first four per topic');
assertShelfCopies(limited, crowded, 'es');
assert.equal(limited.totalWeek, 6, 'the count includes artifact stories beyond the visible topic cap');

console.log('homepage-feed contract: ok');
