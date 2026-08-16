import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const english = require(path.join(root, '_data', 'feed.js'))();
const nativeInclusive = require(path.join(root, '_data', 'feed.js')).forLocale('es');
const spanish = require(path.join(root, '_data', 'feedEs.js'))();
const {
  cached, criticalStrings, missingCritical, resolveSpanishBrief,
} = require(path.join(root, 'pipeline', 'lib', 'es-translation.cjs'));
const cache = JSON.parse(fs.readFileSync(path.join(root, 'data', 'es', 'strings.json'), 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'data', 'es', 'brief.json'), 'utf8'));
const brief = JSON.parse(fs.readFileSync(path.join(root, 'data', 'brief.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, '_data', 'feedEs.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'happening.yml'), 'utf8');

const missing = missingCritical(english, cache);
if (!missing.length) {
  assert.equal(spanish.translationCarrying, false,
    'a fully translated current edition must not be labelled as carried');
  assert.equal(snapshot.contentSig, brief.meta.contentSig,
    'the current Spanish snapshot must identify the exact visible Brief');
  assert.equal(spanish.stories.length, english.stories.length,
    'the current Spanish Brief must contain the same selected stories as English');
  assert.equal(spanish.weekend, english.weekend,
    'a complete Spanish snapshot must preserve the edition type');
  assert.deepEqual(spanish.stories.map((story) => story.lane), english.stories.map((story) => story.lane),
    'translation must preserve the honest dated lane for every story');
} else {
  assert.equal(spanish.translationCarrying, true,
    'an incomplete translation must carry the last complete Spanish Brief');
  assert.equal(spanish.brief, snapshot.brief);
  const visibleIds = new Set(english.stories.map((story) => story.id));
  const visibleSnapshot = snapshot.editorialDate === english.date
    ? snapshot.stories.filter((story) => visibleIds.has(story.id)) : snapshot.stories;
  assert.equal(spanish.stories.length, visibleSnapshot.length,
    'the Spanish snapshot must obey the same exact-day visibility filter as English');
  assert.equal(spanish.date, snapshot.editorialDate,
    'a carried Spanish Brief must keep its actual edition date');
}

for (const sourceText of criticalStrings(english).filter((text) => cached(cache, text))) {
  const translated = cached(cache, sourceText);
  assert.ok(translated, `missing critical Spanish string: ${sourceText.slice(0, 60)}`);
  const figures = (sourceText.match(/\d[\d,.]*/g) || []).map((value) => value.replace(/[,.]$/, ''));
  assert.ok(figures.every((figure) => translated.includes(figure)),
    `Spanish translation changed a figure in: ${sourceText.slice(0, 60)}`);
}
for (let index = 0; !missing.length && index < english.stories.length; index++) {
  assert.notEqual(spanish.stories[index].title, english.stories[index].title,
    `story ${index + 1} fell back to its English title`);
  assert.notEqual(spanish.stories[index].dek, english.stories[index].dek,
    `story ${index + 1} fell back to its English summary`);
}

const future = {
  ...english,
  brief: 'A new English-only edition.',
  stories: [{ ...english.stories[0], title: 'A new English-only headline.' }],
};
const carried = resolveSpanishBrief(future, {}, snapshot);
assert.equal(carried.translationCarrying, true);
assert.equal(carried.brief, snapshot.brief,
  'missing translations must carry the last complete Spanish Brief');
assert.deepEqual(resolveSpanishBrief(future, {}, null).stories, [],
  'without a snapshot, Spanish must render no stories rather than English stories');
assert.doesNotMatch(source, /cache\[[^\]]+\]\s*\|\|\s*clean/,
  'Spanish free text must never silently fall back to English');
assert.match(source, /\.filter\(\(w\) => w\.title\)/,
  'optional untranslated wire items must be omitted from Spanish');
assert.match(workflow, /node translate-es\.mjs --critical/,
  'the publication workflow must translate the exact selected Brief before release');
assert.match(fs.readFileSync(path.join(root, '_includes', 'partials', 'header.njk'), 'utf8'),
  /not feedEs\.translationCarrying/,
  'English must not advertise a stale Spanish snapshot as the current translation');
const englishWeekByUrl = new Map(english.week.map((item) => [item.url, item]));
for (const item of nativeInclusive.week.filter((entry) => entry.lang === 'ES' && entry.title === entry.orig)) {
  const englishItem = englishWeekByUrl.get(item.url);
  assert.ok(!englishItem || englishItem.title !== item.title,
    'an untranslated Spanish headline must not appear under the English toggle');
}

console.log('spanish-edition-contract: ok');
