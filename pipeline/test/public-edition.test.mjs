import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import publicEdition from '../lib/public-edition.cjs';
import { buildWeeklyBrief } from '../build-edition.mjs';

const copy = (value) => JSON.parse(JSON.stringify(value));
const story = (overrides = {}) => {
  const value = {
    id: 'story-1', date: '2026-09-02', lane: 'today', section: 'economy',
    source: 'Official source', url: 'https://example.com/story', publishedAt: '2026-09-02T13:00:00Z',
    evidence: [
      { id: 'article', kind: 'article', source: 'Official source', url: 'https://example.com/story' },
      { id: 'standing:context', kind: 'standing', source: 'Official record', url: 'https://example.gov/context' },
    ],
    evidenceRefs: {
      headline: ['article'], dek: ['article'], background: ['standing:context'],
      view: ['article', 'standing:context'], watch: ['standing:context'],
    },
    en: { headline: 'Mexico changes a rule', dek: 'The new rule takes effect next month.', background: 'The prior rule had applied since 2020.', view: 'The change reduces one documented cost.', watch: 'Watch next month for the first reported result.' },
    es: { headline: 'México cambia una regla', dek: 'La nueva regla entra en vigor el próximo mes.', background: 'La regla anterior se aplicaba desde 2020.', view: 'El cambio reduce un costo documentado.', watch: 'Habrá que observar el próximo mes el primer resultado publicado.' },
    ...overrides,
  };
  if (overrides.url && !overrides.evidence) value.evidence[0].url = overrides.url;
  return value;
};
const edition = (stories = [story()]) => publicEdition.withArtifactHash({
  schemaVersion: 1, editorialDate: '2026-09-02', generatedAt: '2026-09-02T14:00:00Z',
  slot: 'morning', editionType: 'daily', candidateSignature: 'a'.repeat(64),
  summary: { en: 'The new rule takes effect next month.', es: 'La nueva regla entra en vigor el próximo mes.' },
  stories,
  weekStories: stories.map((item) => ({
    id: item.id, date: item.date, section: item.section, source: item.source,
    url: item.url, publishedAt: item.publishedAt,
    en: { headline: item.en.headline, dek: item.en.dek },
    es: { headline: item.es.headline, dek: item.es.dek },
  })),
});

assert.deepEqual(publicEdition.validateEdition(edition()).errors, []);
assert.match(edition().artifactHash, /^[a-f0-9]{64}$/);

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mexico-edition-'));
const file = path.join(directory, 'edition.json');
publicEdition.atomicWriteEdition(file, edition());
const lastGood = fs.readFileSync(file);

const invalidCandidates = [
  { label: 'zero stories', value: edition([]) },
  { label: 'six stories', value: edition(Array.from({length:6},(_,i)=>story({id:`story-${i}`,url:`https://example.com/story-${i}`}))) },
  { label: 'no exact-day story', value: edition([story({ date: '2026-09-01', lane: 'key-development' })]) },
  { label: 'partial English', value: (() => { const value = edition(); value.stories[0].en.view = ''; return value; })() },
  { label: 'partial Spanish', value: (() => { const value = edition(); value.stories[0].es.watch = ''; return value; })() },
  { label: 'unknown evidence ref', value: (() => { const value = edition(); value.stories[0].evidenceRefs.view = ['missing']; return value; })() },
  { label: 'independent evidence ignored by background', value: (() => { const value = edition(); value.stories[0].evidenceRefs.background = ['article']; return value; })() },
  { label: 'title and dek only', value: (() => { const value = edition(); value.stories[0].evidence = value.stories[0].evidence.slice(0, 1); value.stories[0].evidenceRefs.background = ['article']; return value; })() },
  { label: 'body marker on wrong URL', value: (() => { const value = edition(); value.stories[0].evidence = [{ id: 'article', kind: 'article-body', source: 'Official source', url: 'https://example.com/wrong' }]; value.stories[0].evidenceRefs = Object.fromEntries(Object.keys(value.stories[0].evidenceRefs).map((field) => [field, ['article']])); return value; })() },
  { label: 'missing weekly copy', value: (() => { const value = edition(); value.weekStories[0].es.dek = ''; return value; })() },
  { label: 'weekly copy disagreement', value: (() => { const value = edition(); value.weekStories[0].en.headline = 'A different headline'; return value; })() },
  { label: 'credential URL', value: (() => { const value = edition(); value.stories[0].url = 'https://user:pass@example.com/story'; value.stories[0].evidence[0].url = value.stories[0].url; value.weekStories[0].url = value.stories[0].url; return value; })() },
  { label: 'Spanish factual contradiction', value: (() => { const value = edition(); value.stories[0].es.headline = 'Banxico aprobó una reforma definitiva'; value.weekStories[0].es.headline = value.stories[0].es.headline; return value; })() },
];
for (const fixture of invalidCandidates) {
  assert.throws(() => publicEdition.atomicWriteEdition(file, fixture.value), /invalid edition/, fixture.label);
  assert.deepEqual(fs.readFileSync(file), lastGood, `${fixture.label} must leave last-good bytes unchanged`);
}

const twoStory = edition([
  story(),
  story({ id: 'story-2', date: '2026-09-01', lane: 'key-development', url: 'https://example.com/story-2', publishedAt: '2026-09-01T18:00:00Z' }),
]);
assert.equal(publicEdition.validateEdition(twoStory).ok, true, 'a dated prior-day key development may accompany today');

const articleBodyOnly = edition();
articleBodyOnly.stories[0].evidence = [{
  id: 'article', kind: 'article-body', source: 'Official source', url: articleBodyOnly.stories[0].url,
}];
articleBodyOnly.stories[0].evidenceRefs = Object.fromEntries(
  Object.keys(articleBodyOnly.stories[0].evidenceRefs).map((field) => [field, ['article']]),
);
articleBodyOnly.artifactHash = publicEdition.editionHash(articleBodyOnly);
assert.equal(publicEdition.validateEdition(articleBodyOnly).ok, true,
  'a verified body from the exact article may support a one-source story');

const weekend = publicEdition.withArtifactHash({
  ...edition([story({ date: '2026-09-05', lane: 'weekend' })]),
  editorialDate: '2026-09-06', editionType: 'weekend-recap', slot: 'noon',
});
assert.equal(publicEdition.validateEdition(weekend).ok, true, 'weekend recap accepts current-week stories');

console.log('public-edition tests: ok');

assert.equal(publicEdition.validateEdition(edition(Array.from({length:5},(_,i)=>story({id:`five-${i}`,url:`https://example.com/five-${i}`})))).ok,true,'five fully verified stories are supported');

// The daily prior-day lane must also work across the Sunday/Monday boundary.
const monday = publicEdition.withArtifactHash({
  ...edition([
    story({ id: 'monday-one', date: '2026-10-05', url: 'https://example.com/monday-one', publishedAt: '2026-10-05T07:00:00Z' }),
    story({ id: 'monday-two', date: '2026-10-05', url: 'https://example.com/monday-two', publishedAt: '2026-10-05' }),
    story({ id: 'sunday-current', date: '2026-10-04', lane: 'key-development', url: 'https://example.com/sunday-current', publishedAt: '2026-10-05T04:43:58Z' }),
  ]), editorialDate: '2026-10-05', generatedAt: '2026-10-05T12:05:00Z',
});
monday.weeklyBrief = buildWeeklyBrief(monday.stories, monday.editorialDate);
monday.artifactHash = publicEdition.editionHash(monday);
assert.deepEqual(publicEdition.validateEdition(monday).errors, [],
  'the weekly mirror preserves the exact Sunday date of a valid Monday prior-day story');
publicEdition.atomicWriteEdition(file, monday);
const mondayBytes = fs.readFileSync(file);
const invalidMonday = [
  ['unrelated Sunday archive', value => {
    value.weekStories.push({ ...copy(value.weekStories[2]), id: 'old-archive', url: 'https://example.com/old-archive' });
  }, /falls outside the edition week/],
  ['Saturday is too old', value => {
    value.stories[2].date = value.weekStories[2].date = '2026-10-03';
  }, /key-development must be from the previous day/],
  ['Sunday cannot become today', value => { value.stories[2].lane = 'today'; }, /today lane has the wrong date/],
  ['no Monday story', value => {
    value.stories = [value.stories[2]]; value.weekStories = [value.weekStories[2]];
  }, /needs at least one exact-day story/],
  ['mismatched mirror source', value => { value.weekStories[2].url += '?different=1'; }, /disagrees with weekStories.url/],
  ['old row on weekend', value => {
    value.editorialDate = '2026-10-10'; value.editionType = 'weekend-recap';
    for (const row of value.stories) row.lane = 'week-recap';
  }, /falls outside the edition week/],
];
for (const [label, mutate, expected] of invalidMonday) {
  const value = copy(monday); mutate(value); value.artifactHash = publicEdition.editionHash(value);
  assert.match(publicEdition.validateEdition(value).errors.join('; '), expected, label);
  assert.throws(() => publicEdition.atomicWriteEdition(file, value), /invalid edition/, label);
  assert.deepEqual(fs.readFileSync(file), mondayBytes, `${label} leaves the last good artifact unchanged`);
}
console.log('Monday prior-day mirror: ok');
