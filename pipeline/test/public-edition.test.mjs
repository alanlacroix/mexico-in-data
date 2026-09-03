import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import publicEdition from '../lib/public-edition.cjs';

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
