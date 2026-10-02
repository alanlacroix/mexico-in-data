import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import history from '../lib/edition-history.cjs';
import publicEdition from '../lib/public-edition.cjs';

const edition = JSON.parse(fs.readFileSync(new URL('../../data/edition.json', import.meta.url), 'utf8'));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-history-'));
try {
  history.archivePublishedEdition(edition, { directory });
  history.archivePublishedEdition(edition, { directory });
  const candidate = { ...edition, publicationStatus: 'candidate' };
  candidate.artifactHash = publicEdition.editionHash(candidate);
  assert.throws(() => history.archivePublishedEdition(candidate, { directory }), /editorially approved/);
  assert.equal(fs.readdirSync(directory).length, 1, 'same artifact is idempotent');
  assert.deepEqual(history.loadHistory({ directory, current: edition }), [edition]);
  const invalid = structuredClone(edition);
  invalid.stories[0].en.dek = 'Unverified edit';
  assert.throws(() => history.archivePublishedEdition(invalid, { directory }), /invalid edition/);
  assert.deepEqual(history.loadHistory({ directory }), [edition], 'invalid content leaves history unchanged');
  const conflict = structuredClone(edition);
  conflict.candidateSignature = 'f'.repeat(64);
  conflict.artifactHash = publicEdition.editionHash(conflict);
  assert.throws(() => history.loadHistory({ directory, current: conflict }), /conflicts with archive/);
  const old = structuredClone(edition);
  old.generatedAt = new Date(Date.parse(edition.generatedAt) - 1000).toISOString();
  old.artifactHash = publicEdition.editionHash(old);
  assert.throws(() => history.archivePublishedEdition(old, { directory }), /older or conflicting/);
  const routes = history.archiveRoutes([edition]);
  assert.equal(routes.length, 4);
  assert(routes.some(route => route.route === `/es/editions/${edition.editorialDate}/`));
  assert.throws(() => history.editionPath('../secret'), /Invalid/);
  assert.equal(history.issueMemory([edition], { before: edition.editorialDate }).length, 0);
  const memory = history.issueMemory([edition, edition], { before: '2099-01-01' });
  assert.equal(memory.length, edition.stories.length);
  assert(memory.every(row => row.evidenceStatus === 'retrieval-only-recheck-original-sources'));
  assert(memory.every(row => row.sourceUrls.includes(edition.stories.find(story => story.id === row.id).url)));
  assert.equal(history.relatedMemory({ title: 'Mexico business news today' }, memory).length, 0);
  assert.equal(history.relatedMemory({ url: edition.stories[0].url }, memory)[0].id, edition.stories[0].id);
  const publishedUrls = history.publishedArticleUrls([edition], { through: edition.editorialDate });
  assert(edition.stories.every(story => publishedUrls.has(story.url)));
  assert(edition.weekStories.every(story => publishedUrls.has(story.url)),
    'the current weekly shelf retains earlier published lead URLs');
  assert.equal(history.publishedArticleUrls([candidate]).size, 0,
    'an unpublished candidate must not hide its own reporting during recovery');
  assert.equal(history.publishedArticleUrls([edition], { through: '2000-01-01' }).size, 0,
    'later editions cannot suppress an earlier historical replay');
  const backgroundUrl = 'https://example.com/background-only';
  const citedOnly = structuredClone(edition);
  citedOnly.stories[0].evidence.push({ url: backgroundUrl });
  assert.equal(history.publishedArticleUrls([citedOnly]).has(backgroundUrl), false,
    'a citation alone does not mean its article was a published lead');
  fs.writeFileSync(path.join(directory, '2000-01-01.json'), '{}');
  assert.throws(() => history.loadHistory({ directory }), /invalid edition/);
  console.log('edition history: ok');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

// Exercise the real candidate selection against isolated current/archive files.
// No collection, article fetch, model request, or production data write is needed.
const selectionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-repeat-selection-'));
try {
  fs.cpSync(new URL('../', import.meta.url), path.join(selectionRoot, 'pipeline'), { recursive: true });
  fs.mkdirSync(path.join(selectionRoot, 'data/news'), { recursive: true });
  const fixture = JSON.parse(fs.readFileSync(new URL('../../data/editions/2026-10-01.json', import.meta.url)));
  const lead = fixture.stories[0];
  const followupUrl = `${lead.url.replace(/\/$/, '')}-followup/`;
  const source = JSON.parse(fs.readFileSync(new URL('../news-sources.json', import.meta.url))).sources
    .find(row => row.id === 'elfin-economia');
  const repeated = {
    id: 'published-url', url: lead.url, title: lead.es.headline, dek: `${lead.es.dek} Información de México.`,
    source: new URL(lead.url).hostname, sourceId: source.id, sourceName: source.name,
    tier: source.tier, published_at: '2026-10-01T12:00:00Z',
  };
  const followup = { ...repeated, id: 'new-followup', url: followupUrl };
  const currentFile = path.join(selectionRoot, 'data/edition.json');
  const newsFile = path.join(selectionRoot, 'data/news/2026-W40.json');
  fs.writeFileSync(currentFile, JSON.stringify(fixture));
  fs.writeFileSync(newsFile, JSON.stringify([repeated, followup]));
  const { candidateUniverse } = await import(pathToFileURL(path.join(selectionRoot, 'pipeline/build-edition.mjs')));
  for (const day of ['2026-10-01', '2026-10-02']) {
    const selected = await candidateUniverse(new Date(`${day}T12:30:00Z`), [], day);
    assert.deepEqual(selected.map(item => item.url), [followupUrl],
      `${day}: exclude the exact published URL while retaining a new URL on the same topic`);
  }

  fs.mkdirSync(path.join(selectionRoot, 'data/editions'));
  fs.writeFileSync(path.join(selectionRoot, 'data/editions/2026-10-01.json'), JSON.stringify(fixture));
  fs.rmSync(currentFile);
  assert.deepEqual((await candidateUniverse(new Date('2026-10-02T12:30:00Z'), [], '2026-10-02')).map(item => item.url),
    [followupUrl], 'archived editions protect against repeats even without a current artifact');

  fs.writeFileSync(newsFile, JSON.stringify([{ ...repeated,
    title: 'Banxico mantiene sin cambios la tasa de interés',
    dek: 'Banco de México dejó sin cambios la tasa objetivo.',
  }]));
  const required = {
    id: 'banxico-repeat-test', date: '2026-10-01', outcomeRequired: true, requiredForBrief: true,
    importanceFloor: 8, outcome: { actor: 'banxico', topic: 'policy-rate' },
    label: 'Banxico monetary-policy decision', source: 'Banco de México', sourceUrl: 'https://www.banxico.org.mx/rates',
  };
  const scheduled = await candidateUniverse(new Date('2026-10-02T12:30:00Z'), [required], '2026-10-02');
  assert.equal(scheduled.length, 1, 'required scheduled outcomes survive exact-URL repeat filtering');
  assert.equal(scheduled[0]._scheduled.id, required.id);
  assert.equal(scheduled[0].url, lead.url);
  console.log('published article repeat selection: ok');
} finally {
  fs.rmSync(selectionRoot, { recursive: true, force: true });
}
