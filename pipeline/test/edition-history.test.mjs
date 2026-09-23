import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  fs.writeFileSync(path.join(directory, '2000-01-01.json'), '{}');
  assert.throws(() => history.loadHistory({ directory }), /invalid edition/);
  console.log('edition history: ok');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
