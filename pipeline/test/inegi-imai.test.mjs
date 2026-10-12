import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { INEGI_NEWS_URL } from '../lib/inegi-monthly-cpi.mjs';
import { fetchBounded } from '../lib/url-safety.js';
import { mergeOptionalCandidates } from '../build-edition.mjs';
import { createImaiLoader, isOptionalImaiRelease, parseImaiMetadata, validateImaiDocument,
  validatedImaiArticle, validatedImaiReleaseDescriptor } from '../lib/inegi-imai.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = file => JSON.parse(fs.readFileSync(new URL(`./fixtures/inegi-imai/${file}`, import.meta.url)));
const records = read('august-2026-metadata.json');
const pages = read('august-2026-pages.json');
const provenance = read('source.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(JSON.stringify(pages)), provenance.jsonStringifyPagesSha256, 'all retained page strings remain exact');
const row = JSON.parse(fs.readFileSync(path.join(root, 'data/events.json'))).events.find(r => r.id === 'inegi-imai-2026-10-12');
assert.ok(isOptionalImaiRelease(row));
for (const changed of [{ requiredForBrief: true }, { outcomeRequired: true }, { advisoryOnly: false },
  { referencePeriod: '2026-13' }, { referencePeriod: '2026-10' }, { referencePeriod: '' },
  { date: '2026-02-30' }, { releaseAt: '2026-10-12' }, { releaseAt: '2026-10-12T25:00:00Z' },
  { releaseAt: '2026-10-12T00:00:00Z' }, { timeZone: 'UTC' }, { source: 'Other' }]) {
  assert.equal(isOptionalImaiRelease({ ...row, ...changed }), false);
}
const metadata = parseImaiMetadata(records, row);
assert.ok(metadata); assert.equal(metadata.referencePeriod, '2026-08');
for (const changed of [{ idFuente: '950' }, { tipoPublicacion: '1' }, { fechaInformacion: '11/09/2026' },
  { fechaPublicacion: '13 de octubre de 2026' }, { periodoInformacion: 'Julio de 2026' },
  { programa: records[0].programa.replace('2018', '2013') }, { programa: 'IMAI por entidad federativa' },
  { urlPdf: records[0].urlPdf + '?x=1' }, { urlPdf: records[0].urlPdf + '#page1' },
  { titulo: records[0].titulo.replace('agosto', 'julio') }]) {
  assert.equal(parseImaiMetadata([{ ...records[0], ...changed }], row), null);
}
assert.equal(parseImaiMetadata([...records, ...records], row), null);
const document = validateImaiDocument(pages, metadata);
assert.ok(document); assert.equal(document.bulletin, '623/26');
assert.ok(document.text.includes('Próxima publicación: 11 de noviembre de 2026'));
for (const mutate of [p => p.pop(), p => p.reverse(), p => { p[1] = p[0]; },
  p => { p[1] = p[1].replace('623/26', '622/26'); },
  p => { p[1] = p[1].replace('12 de octubre', '11 de octubre'); },
  p => { p[1] = p[1].replace('INDICADOR MENSUAL', 'INDICADOR ESTATAL'); },
  p => { p[0] = p[0].replaceAll('agosto de 2026', 'julio de 2026'); },
  p => { p[0] = p[0].slice(0, 150); }, p => { p[4] += ' Overlong source.'.repeat(2000); }]) {
  const changed = structuredClone(pages); mutate(changed); assert.equal(validateImaiDocument(changed, metadata), null);
}

// Explicitly synthetic transport bytes: the extraction stub returns the separately
// verified page fixture. Production hashes its actual downloaded PDF, not this fixture's provenance hash.
const bytes = new TextEncoder().encode('%PDF-1.7 synthetic adapter transport fixture');
const now = new Date('2026-10-12T12:05:00Z');
const requests = [];
const fetchImpl = async (url, options) => {
  requests.push({ url: String(url), method: options.method, body: options.body });
  return String(url) === INEGI_NEWS_URL ? new Response(JSON.stringify(records)) : new Response(bytes);
};
const bounded = (url, options) => {
  assert.equal(options.redirects, 0);
  assert.equal(options.maxBytes, url === INEGI_NEWS_URL ? 128 * 1024 : 2 * 1024 * 1024);
  assert.equal(options.timeoutMs, url === INEGI_NEWS_URL ? 10000 : 15000);
  return fetchBounded(url, { ...options, lookup: async () => [{ address: '93.184.216.34', family: 4 }] });
};
const load = createImaiLoader({ now, fetchBytes: bounded, fetchImpl, extractPdf: async value => {
  assert.deepEqual(value, bytes); return pages;
} });
const [item, same] = await Promise.all([load(row), load(row)]);
assert.ok(item); assert.equal(item, same); assert.equal(requests.length, 2);
assert.equal(await load({ ...row, referencePeriod: '2026-07' }), null, 'same ID cannot reuse a different configured period');
assert.equal(await load({ ...row, releaseAt: '2026-10-12T12:01:00Z' }), null, 'same ID cannot reuse a different availability time');
assert.equal(requests.length, 2, 'conflicting duplicate configuration cannot introduce retries');
assert.equal(requests[0].method, 'POST'); assert.equal(requests[0].body, 'acronimo=IMAI&idNoticia=0&ingles=0');
assert.equal(item._scheduled, undefined); assert.equal(item.published_at, row.date);
assert.equal(validatedImaiArticle(item).text, document.text);
const descriptor = validatedImaiReleaseDescriptor(item);
assert.equal(descriptor.sourceSha256, sha(bytes)); assert.notEqual(descriptor.sourceSha256, provenance.pdfSha256);
assert.equal(descriptor.referencePeriod, '2026-08'); assert.equal(descriptor.bulletin, '623/26');
assert.equal(descriptor.revision, null); assert.equal(descriptor.series, 'imai.national.monthly.base2018');
assert.ok(Object.isFrozen(descriptor));
assert.throws(() => { descriptor.referencePeriod = '2026-07'; }, TypeError);
assert.equal(validatedImaiArticle({ ...item, _articleBody: document.text }), null);
assert.equal(validatedImaiReleaseDescriptor({ ...item, descriptor }), null);
item._scheduled = row; assert.equal(validatedImaiArticle(item), null); delete item._scheduled;
item.url += '?other=1'; assert.equal(validatedImaiArticle(item), null); item.url = metadata.url;
assert.ok(validatedImaiArticle(item));
const ordinaryCopy = { ...item };
assert.deepEqual(mergeOptionalCandidates([], [ordinaryCopy], [item, item], []), [item]);
assert.equal(mergeOptionalCandidates([], [ordinaryCopy], [item], [])[0], item, 'dedupe preserves the private trusted object');
const requiredCopy = { ...ordinaryCopy, _scheduled: { id: 'required-existing' } };
assert.deepEqual(mergeOptionalCandidates([], [requiredCopy], [item], []), [requiredCopy], 'optional source cannot displace a linked obligation');
assert.deepEqual(mergeOptionalCandidates([requiredCopy], [], [item], []), [requiredCopy], 'optional source cannot displace a seeded obligation');
const queryDistinct = { ...ordinaryCopy, url: ordinaryCopy.url + '?revision=2' };
assert.deepEqual(mergeOptionalCandidates([], [queryDistinct], [item], []), [item, queryDistinct], 'meaningful query distinctions are retained');
let premature = 0;
assert.equal(await createImaiLoader({ now: new Date('2026-10-12T11:59:59Z'), fetchBytes: async () => { premature++; } })(row), null);
assert.equal(premature, 0, 'no source calls before the configured availability time');
assert.equal(await createImaiLoader({ now: new Date('2026-10-11T12:05:00Z') })(row), null);
for (const mode of ['html', 'stale', 'redirect', 'timeout']) {
  let calls = 0;
  const failed = createImaiLoader({ now, fetchBytes: bounded, fetchImpl: async url => {
    calls++;
    if (mode === 'timeout') throw Error('source timeout');
    if (mode === 'redirect') return new Response('', { status: 302, headers: { location: metadata.url } });
    if (String(url) === INEGI_NEWS_URL) return new Response(JSON.stringify(mode === 'stale'
      ? [{ ...records[0], fechaInformacion: '11/09/2026', periodoInformacion: 'Julio de 2026' }] : records));
    return new Response('<html>PDF not yet uploaded</html>');
  } });
  assert.deepEqual(await Promise.all([failed(row), failed(row)]), [null, null]);
  assert.equal(calls, mode === 'html' ? 2 : 1, 'no internal retry policy');
}

// Actual selector/evidence integration uses the real safe transport and PDF byte
// guard with a fixture-only worker. No model, source network or repository data writes.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-imai-integration-'));
try {
  fs.cpSync(path.join(root, 'pipeline'), path.join(temp, 'pipeline'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'data/news'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(temp, 'pipeline/lib/inegi-pdf-worker.mjs'),
    `import { parentPort } from 'node:worker_threads';parentPort.postMessage({pages:${JSON.stringify(pages)}});`);
  fs.writeFileSync(path.join(temp, 'pipeline/lib/fetch-article.js'), "export async function fetchArticle(){throw Error('HTML must not replace trusted IMAI');}");
  fs.writeFileSync(path.join(temp, 'pipeline/lib/url-safety.js'), fs.readFileSync(path.join(root, 'pipeline/lib/url-safety.js'), 'utf8')
    .replace('lookup = dns.lookup, fetchImpl', 'lookup = async()=>[{address:"93.184.216.34",family:4}], fetchImpl'));
  const runner = `import assert from 'node:assert/strict';import fs from 'node:fs';
    import { candidateUniverse,evidenceFor,evidenceReady,publicationCoverage } from './pipeline/build-edition.mjs';
    const row=${JSON.stringify(row)},records=${JSON.stringify(records)};
    let calls=0;globalThis.fetch=async url=>{calls++;if(String(url)===${JSON.stringify(INEGI_NEWS_URL)})return new Response(JSON.stringify(records));
      if(String(url)===${JSON.stringify(metadata.url)})return new Response(${JSON.stringify(new TextDecoder().decode(bytes))});throw Error('Unexpected network');};
    const now=new Date('2026-10-12T12:05:00Z');
    const universe=await candidateUniverse(now,{events:[row]},row.date,[]);assert.equal(universe.length,1);const item=universe[0];
    assert.equal(item._scheduled,undefined);assert.equal(item.url,${JSON.stringify(metadata.url)});assert.equal(calls,2);
    const evidence=await evidenceFor(item,[],[],[]);assert.equal(evidence[0].kind,'article-body');assert.ok(evidence[0].text.includes('Página 5/5'));assert.equal(calls,2);
    assert.ok(evidenceReady({item,evidence}));await assert.rejects(evidenceFor({...item},[],[],[]),/no trusted complete/);
    const ordinary=[1,2,3].map(index=>({index,item:{url:'https://example.com/new-'+index,_editorialDate:row.date}}));
    assert.ok(publicationCoverage(ordinary,[{index:0,item},...ordinary],row.date),'omitting optional IMAI does not fail required coverage');
    const published=${fs.readFileSync(path.join(root,'data/editions/2026-10-12.json'),'utf8')};
    assert.ok(published.stories.some(story=>story.url===item.url),'fixture contains exact published IMAI lead');
    const repeated=await candidateUniverse(now,{events:[row]},row.date,[published]);assert.equal(repeated.length,0,'optional seed obeys exact published URL exclusion');
    records[0].periodoInformacion='Julio de 2026';
    assert.equal((await candidateUniverse(now,{events:[row]},row.date,[])).length,0,'optional source failure does not become a mandatory obligation');
  `;
  fs.writeFileSync(path.join(temp, 'check.mjs'), runner);
  const result = spawnSync(process.execPath, ['check.mjs'], { cwd: temp, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log('IMAI: optional exact official release, complete pages, private source identity and safe selector integration pass');
