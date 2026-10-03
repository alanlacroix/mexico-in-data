import assert from 'node:assert/strict';
import fs from 'node:fs';
import { articleIdentity, publishedProvenanceUrls } from '../lib/article-identity.mjs';
import publicEdition from '../lib/public-edition.cjs';

const hosts = ['eleconomista.com.mx', 'www.elfinanciero.com.mx', 'elceo.com'];
for (const host of ['eleconomista.com.mx', 'elfinanciero.com.mx', 'elceo.com']) {
  assert.equal(articleIdentity(`https://www.${host}/report`, hosts), `https://${host}/report`);
  assert.equal(articleIdentity(`https://${host}/report`, hosts), `https://${host}/report`);
}
for (const suffix of [
  '/report?reportId=12&edition=final#table-2', '/report?edition=final&reportId=12#table-2',
  '/report?item=1&item=2', '/report?item=2&item=1', '/report?value=a+b', '/report?value=a%20b',
  '/report?utm_content=new-report', '/report?edition=preliminary', '/report#table-1',
  '/report?', '/report#', '/Report', '/report/', '/x/../report', '/%2e%2e/report', '/%2Freport',
  ':443/report?reportId=12#table-2', ':8443/report', '', '?reportId=12',
]) {
  assert.equal(articleIdentity(`https://www.elceo.com${suffix}`, hosts), `https://elceo.com${suffix}`,
    `preserve every part besides the registered host alias: ${suffix}`);
}
for (const url of [
  'https://www.unknown.example/report', 'https://www.elceo.com.attacker.example/report',
  'https://www.news.elceo.com/report', 'https://news.elceo.com/report', 'https://www.www.elceo.com/report',
  'https://www.elceo.com./report', 'http://www.elceo.com/report',
  'https://user@www.elceo.com/report', 'https://www.elceo.com\\attacker/report',
  ' https://www.elceo.com/report', 'not a URL',
]) assert.equal(articleIdentity(url, hosts), url, 'unregistered or malformed identities remain exact');
assert.equal(articleIdentity('https://www.elceo.com/report'), 'https://www.elceo.com/report',
  'normalization is opt-in for registered hosts');
assert.throws(() => articleIdentity(null, hosts), /URL string/);

// Read a real validated public artifact, then change only in-memory fixtures.
// No collection, fetch, model call, or public artifact write is performed.
const edition = JSON.parse(fs.readFileSync(new URL('../../data/editions/2026-10-01.json', import.meta.url)));
const story = edition.stories[0];
const record = {
  editorialDate: edition.editorialDate, artifactHash: edition.artifactHash,
  storyId: story.id, publishedUrl: story.url,
  feedUrl: 'https://www.elceo.com/original-report?edition=final#detail',
};
const sidecar = { schemaVersion: 1, records: [record] };
const options = { through: edition.editorialDate, registeredHosts: hosts };
const expected = [articleIdentity(record.feedUrl, hosts)];
const results = (editions = [edition], provenance = sidecar, overrides = {}) =>
  [...publishedProvenanceUrls(editions, provenance, { ...options, ...overrides })];
assert.deepEqual(results(), expected);
assert.deepEqual(results([edition, edition], { ...sidecar, records: [record, record] }), expected,
  'identical publication/provenance repeats are idempotent');
assert.deepEqual(results([], sidecar), [], 'a sidecar alone does not establish publication');
assert.deepEqual([...publishedProvenanceUrls([edition], undefined, options)], [], 'a missing sidecar is empty');
assert.deepEqual(results([edition], sidecar, { through: '2000-01-01' }), [],
  'future editions cannot suppress a historical replay');
for (const changed of [
  { editorialDate: '2026-10-02' }, { artifactHash: 'f'.repeat(64) }, { storyId: 'another-story' },
  { publishedUrl: 'https://elceo.com/another-report' },
  { publishedUrl: story.url.includes('://www.') ? story.url.replace('://www.', '://') : story.url.replace('://', '://www.') },
]) assert.deepEqual(results([edition], { ...sidecar, records: [{ ...record, ...changed }] }), [],
  'every publication anchor field must match exactly, including the raw chosen lead URL');

for (const status of ['candidate', 'held', 'failed', 'published']) {
  const unpublished = publicEdition.withArtifactHash({ ...edition, publicationStatus: status });
  const unpublishedRecord = { ...record, artifactHash: unpublished.artifactHash };
  assert.deepEqual(results([unpublished], { ...sidecar, records: [unpublishedRecord] }), [],
    `${status} is not an eligible published artifact status`);
}
const approved = publicEdition.withArtifactHash({ ...edition, publicationStatus: 'approved' });
assert.deepEqual(results([approved], { ...sidecar, records: [{ ...record, artifactHash: approved.artifactHash }] }), expected);

const tampered = structuredClone(edition);
tampered.stories[0].en.dek = 'An unvalidated mutation';
assert.throws(() => results([tampered]), /Invalid published edition/,
  'the original artifact hash must validate before provenance is trusted');
const evidenceOnly = story.evidence.find(item => item.url !== story.url)?.url || 'https://elceo.com/background';
assert.deepEqual(results([edition], { ...sidecar, records: [{ ...record, publishedUrl: evidenceOnly }] }), [],
  'a cited URL is not a chosen lead');
assert.deepEqual(results([edition], { schemaVersion: 1, records: [] }), [],
  'ordinary evidence does not infer feed provenance');

const weeklyOnly = edition.weekStories.find(item => !edition.stories.some(story => story.id === item.id));
assert.ok(weeklyOnly, 'fixture includes previously published weekly shelf cards');
assert.deepEqual(results([edition], { ...sidecar, records: [{ ...record,
  storyId: weeklyOnly.id, publishedUrl: weeklyOnly.url,
}] }), expected, 'exact weekly shelf cards also establish publication');

for (const malformed of [null, [], {}, { schemaVersion: 2, records: [] }, { schemaVersion: 1, records: {} },
  { schemaVersion: 1, records: [null] }, { schemaVersion: 1, records: [{}] },
  ...[
    { editorialDate: '2026-02-30' }, { artifactHash: 'wrong' }, { storyId: '' }, { storyId: ' spaced ' },
    { publishedUrl: 'http://elceo.com/report' }, { feedUrl: 'not a URL' },
    { feedUrl: 'https://user:password@elceo.com/report' }, { feedUrl: 'https://127.0.0.1/report' },
    { feedUrl: 'https://elceo.com/report\n' },
  ].map(change => ({ ...sidecar, records: [{ ...record, ...change }] })),
]) assert.throws(() => results([edition], malformed), /Invalid article provenance/,
  'malformed sidecars must be visible errors, not silently ignored');
assert.throws(() => results([edition], { ...sidecar, records: [record, { ...record, feedUrl: 'https://elceo.com/other' }] }),
  /Conflicting article provenance/, 'one exact card cannot assert two different original selected feed URLs');
assert.throws(() => results([edition], sidecar, { through: '2026-02-30' }), /through date/);
assert.throws(() => results(null), /editions array/);
console.log('article identity and published provenance: ok');
