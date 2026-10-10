import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchBounded } from '../lib/url-safety.js';
import { shapeEvidenceRecord } from '../lib/source-evidence.mjs';
import { INEGI_NEWS_URL, isMonthlyInegiCpi, requiresInegiMonthlySource, parseMonthlyMetadata,
  validateMonthlyPages, extractInegiPdf, createInegiMonthlyLoader, validatedInegiArticle, alreadyPublishedMonthlyCpi, alreadyPublishedMonthlyCpiInHistory } from '../lib/inegi-monthly-cpi.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = name => fs.readFileSync(new URL(`fixtures/${name}`, import.meta.url));
const records = JSON.parse(fixture('inegi-inpc-september-2026.json'));
const fortnight = JSON.parse(fixture('inegi-inpc-first-half-september-2026.json'));
const pdf = new Uint8Array(fixture('inegi-inpc-september-2026.pdf'));
const row = JSON.parse(fs.readFileSync(path.join(root, 'data/events.json'))).events.find(r => r.id === 'inegi-cpi-2026-10-08');
const now = new Date('2026-10-08T12:05:00Z');
const { default: publicEdition } = await import('../lib/public-edition.cjs');
const published = JSON.parse(fs.readFileSync(path.join(root, 'data/editions/2026-10-08.json')));
assert.equal(alreadyPublishedMonthlyCpi(row, published, '2026-10-09'), true);
assert.equal(alreadyPublishedMonthlyCpi(row, published, row.date), false, 'same-day obligation remains due');
assert.equal(alreadyPublishedMonthlyCpi({...row, id:'inegi-cpi-2026-11-09',date:'2026-11-09',label:'INEGI CPI — monthly (INPC, October; headline + core)'},published,'2026-11-10'),false,'new monthly outcome remains due');
assert.equal(alreadyPublishedMonthlyCpi(row,null,'2026-10-09'),false);
assert.equal(alreadyPublishedMonthlyCpi(row,{...published,artifactHash:'0'.repeat(64)},'2026-10-09'),false,'hash-invalid publication');
for (const mutate of [
 e => e.publicationStatus = 'candidate',
 e => e.publicationStatus = 'draft',
 e => e.editorialDate = '2026-09-31',
 e => e.stories[0].evidence[0].id = 'unrelated-body',
 e => e.stories[0].url += '?copy=1',
 e => e.stories[0].url = e.stories[0].url.replace('2q','1q'),
 e => e.stories[0].url = e.stories[0].url.replace('_10.pdf','_09.pdf'),
 e => e.stories[0].url = e.stories[0].url.replace('www.inegi.org.mx','evil.example'),
 e => e.stories[0].date = '2026-10-07',
 e => e.stories[0].publishedAt = '2026-10-07',
 e => e.stories[0].evidence[0].kind = 'calendar',
 e => e.stories[0].evidence[0].url += '#page=1',
 e => e.stories[0].evidenceRefs.headline = ['inflation-august'],
 e => e.stories = e.stories.slice(1),
]) {
 const changed=structuredClone(published);mutate(changed);
 assert.equal(alreadyPublishedMonthlyCpi(row,publicEdition.withArtifactHash(changed),'2026-10-09'),false,'no topic, shelf or evidence-only discharge');
}

const receipt = { editorialDate: published.editorialDate, slot: 'morning', state: 'published', artifactHash: published.artifactHash, calls: 0, costUSD: 0 };
const ledger = value => ({ schemaVersion: 1, attempts: value });
assert.equal(alreadyPublishedMonthlyCpiInHistory(row, [published], ledger([receipt]), '2026-10-10'), true);
for (const changed of [null, ledger([]), ledger([{...receipt, state:'failed'}]), ledger([{...receipt, state:'review-required'}]),
  ledger([{...receipt, editorialDate:'2026-10-07'}]), ledger([{...receipt, artifactHash:'0'.repeat(64)}])]) {
  assert.equal(alreadyPublishedMonthlyCpiInHistory(row, [published], changed, '2026-10-10'), false, 'history needs exact published receipt');
}
assert.equal(alreadyPublishedMonthlyCpiInHistory(row, [{...published, artifactHash:'0'.repeat(64)}], ledger([{...receipt, artifactHash:'0'.repeat(64)}]), '2026-10-10'), false, 'matching corrupted hashes cannot establish publication');
assert.equal(alreadyPublishedMonthlyCpiInHistory(row, [published], ledger([receipt]), row.date), false, 'same-day receipt cannot discharge obligation');
assert.equal(alreadyPublishedMonthlyCpiInHistory({...row, id:'inegi-cpi-2026-11-09',date:'2026-11-09',label:'INEGI CPI — monthly (INPC, October; headline + core)'}, [published], ledger([receipt]), '2026-11-10'), false, 'newer monthly release still required');

const original = published.stories[0].url;
const cases = [
  ['query', e => { e.stories[0].url += '?copy=1'; e.stories[0].evidence[0].url = e.stories[0].url; }],
  ['fragment', e => { e.stories[0].url += '#page=1'; e.stories[0].evidence[0].url = e.stories[0].url; }],
  ['host alias', e => { e.stories[0].url = e.stories[0].url.replace('www.inegi', 'inegi'); e.stories[0].evidence[0].url = e.stories[0].url; }],
  ['fortnight', e => { e.stories[0].url = e.stories[0].url.replace('2q', '1q'); e.stories[0].evidence[0].url = e.stories[0].url; }],
  ['old month', e => { e.stories[0].url = e.stories[0].url.replace('_10.pdf', '_09.pdf'); e.stories[0].evidence[0].url = e.stories[0].url; }],
  ['wrong story day', e => { e.stories[0].date = '2026-10-07'; e.stories[0].lane = 'key-development'; }],
  ['timestamp not exact date', e => { e.stories[0].publishedAt = '2026-10-08T12:00:00Z'; }],
  ['secondary body exact URL', e => { e.stories[0].evidence[0].kind = 'rss'; e.stories[0].evidence.push({ ...e.stories[0].evidence[0], id: 'other', kind: 'article-body' }); e.stories[0].evidenceRefs.headline = ['other']; }],
  ['evidence only', e => { e.stories[0].url = 'https://www.inegi.org.mx/another-story'; e.stories[0].evidence[0].url = e.stories[0].url; e.stories[0].evidence.push({ ...e.stories[0].evidence[0], id: 'other', url: original }); e.stories[0].evidenceRefs.headline = ['other']; }],
  ['weekly only', e => { e.stories = e.stories.slice(1); }],
  ['draft', e => { e.publicationStatus = 'draft'; }],
  ['headline other source', e => { e.stories[0].evidenceRefs.headline = ['inflation-august']; }],
];

for (const [name, mutate] of cases) {
  let edition = structuredClone(published);
  mutate(edition);
  for (const story of edition.stories) {
    const weekly = edition.weekStories.find(item => item.id === story.id);
    for (const field of ['url', 'date', 'publishedAt']) weekly[field] = story[field];
  }
  edition = publicEdition.withArtifactHash(edition);
  assert.equal(publicEdition.validateEdition(edition).ok, true, `${name}: not testing an invalid artifact`);
  assert.equal(alreadyPublishedMonthlyCpi(row, edition, '2026-10-09'), false, name);
  assert.equal(alreadyPublishedMonthlyCpiInHistory(row, [edition], ledger([{...receipt, artifactHash:edition.artifactHash}]), '2026-10-10'), false, `history: ${name}`);

}

assert.equal(isMonthlyInegiCpi(row), true);
const metadata = parseMonthlyMetadata(records, row);
assert.ok(metadata);
assert.equal(metadata.period, 'septiembre de 2026');
assert.equal(parseMonthlyMetadata(fortnight, row), null, 'actual first-fortnight release is not the monthly outcome');
assert.equal(parseMonthlyMetadata([...records, ...records], row), null, 'ambiguous response');
for (const mutate of [
  r => r.fechaInformacion = '09/09/2026', r => r.fechaPublicacion = '07 de octubre de 2026',
  r => r.fechaInformacion = '08/10/2027', r => r.periodoInformacion = 'Agosto de 2026',
  r => r.periodoInformacion = 'Primera quincena de septiembre de 2026',
  r => r.idFuente = '949', r => r.tipoPublicacion = '9', r => r.programa = 'Producto Interno Bruto',
  r => r.titulo = ['La inflación anual fue de 3.45% en septiembre de 2026'], r => delete r.fechaInformacion,
]) {
  const changed = structuredClone(records); mutate(changed[0]); assert.equal(parseMonthlyMetadata(changed, row), null);
}
for (const url of ['https://evil.example/report.pdf', '//www.inegi.org.mx/report.pdf',
  '/saladeprensa/boletines/2026/inpc/../report.pdf', '/saladeprensa/boletines/2026/inpc/%2e%2e/report.pdf',
  '/saladeprensa/boletines/2026/inpc/inpc_1q2026_10.pdf', '/saladeprensa/boletines/2025/inpc/inpc_2q2025_10.pdf',
  `${records[0].urlPdf}?key=secret`, `${records[0].urlPdf}#page=1`, `${records[0].urlPdf}/extra`]) {
  const changed = structuredClone(records); changed[0].urlPdf = url; assert.equal(parseMonthlyMetadata(changed, row), null, url);
}
const january = { ...row, id: 'inegi-cpi-2027-01-07', date: '2027-01-07',
  label: 'INEGI CPI — monthly (INPC, December; headline + core)',
  sourceUrl: 'https://www.inegi.org.mx/contenidos/saladeprensa/doc/cal_2027.pdf' };
const december = [{ ...records[0], fechaInformacion: '07/01/2027', fechaPublicacion: '7 de enero de 2027',
  periodoInformacion: 'Diciembre de 2026', titulo: 'La inflación anual fue de 3.45% en diciembre de 2026',
  urlPdf: '/saladeprensa/boletines/2027/inpc/inpc_2q2027_01.pdf' }];
assert.equal(parseMonthlyMetadata(december, january)?.period, 'diciembre de 2026', 'January observes prior December');
assert.equal(requiresInegiMonthlySource({ ...row, source: 'Wrong' }), true, 'bad monthly configuration cannot fall back to generic seeding');
assert.equal(isMonthlyInegiCpi({ ...row, source: 'Wrong' }), false);
assert.equal(requiresInegiMonthlySource({ id: 'banxico-policy-2026-10-08' }), false);

const pages = await extractInegiPdf(pdf);
assert.equal(pages.length, 6);
const body = validateMonthlyPages(pages, metadata);
assert.ok(body && body.includes('3.45') && body.includes('4.40') && body.includes('3.75'));
assert.ok(body.includes('ISO'), 'complete methodology/footer retained, not a first-page excerpt');
assert.ok(shapeEvidenceRecord({ id: 'article', kind: 'article-body', source: 'INEGI', url: metadata.url, text: `${metadata.title}\n${body}` }));
const augustPages = await extractInegiPdf(new Uint8Array(fixture('inegi-inpc-august-2026.pdf')));
assert.equal(validateMonthlyPages(augustPages, metadata), null, 'old PDF cannot be relabelled by new metadata');
for (const mutate of [
  p => p.pop(), p => p.reverse(), p => p[2] = '', p => p[1] = p[0],
  p => p[1] = p[1].replace('619/26', '618/26'),
  p => p[1] = p[1].slice(0, p[1].indexOf('Página 2/6') + 'Página 2/6'.length),
  p => p[0] = p[0].replace('8 de octubre de 2026', '7 de octubre de 2026'),
  p => p[0] = p[0].replace('En septiembre de 2026', 'En agosto de 2026'),
  p => p[5] += ' Complete but oversized source.'.repeat(900),
]) { const changed = structuredClone(pages); mutate(changed); assert.equal(validateMonthlyPages(changed, metadata), null); }
await assert.rejects(extractInegiPdf(new TextEncoder().encode('<html>Not a PDF</html>')));
await assert.rejects(extractInegiPdf(new TextEncoder().encode('%PDF-malformed')));
await assert.rejects(extractInegiPdf(pdf, { timeoutMs: 40,
  workerUrl: new URL('data:text/javascript,while(true){}') }), /deadline/, 'synchronous parser work is terminable');

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const requests = [];
const fetchImpl = async (url, options) => {
  requests.push({ url: String(url), method: options.method, body: options.body });
  if (String(url) === INEGI_NEWS_URL) return new Response(JSON.stringify(records), { headers: { 'content-type': 'application/json' } });
  assert.equal(String(url), metadata.url);
  return new Response(pdf, { headers: { 'content-type': 'application/pdf' } });
};
const bounded = (url, options) => {
  assert.equal(options.redirects, 0);
  assert.equal(options.maxBytes, url === INEGI_NEWS_URL ? 128 * 1024 : 2 * 1024 * 1024);
  assert.equal(options.timeoutMs, url === INEGI_NEWS_URL ? 10000 : 15000);
  return fetchBounded(url, { ...options, lookup: publicLookup });
};
const load = createInegiMonthlyLoader({ now, fetchBytes: bounded, fetchImpl });
const [item, same] = await Promise.all([load(row), load(row)]);
assert.ok(item); assert.equal(item, same); assert.equal(requests.length, 2, 'one metadata/PDF fetch per obligation');
assert.equal(requests[0].method, 'POST'); assert.equal(requests[0].body, 'acronimo=INPC&idNoticia=0&ingles=0');
assert.equal(requests[1].method, undefined, 'PDF is GET');
assert.equal(item.published_at, '2026-10-08', 'date precision preserved');
assert.equal(item.first_seen, now.toISOString());
assert.equal(validatedInegiArticle(item).text, body);
assert.equal(validatedInegiArticle({ ...item, _articleBody: body }), null, 'JSON properties cannot grant evidence trust');
const originalUrl = item.url; item.url = 'https://example.com/changed.pdf';
assert.equal(validatedInegiArticle(item), null); item.url = originalUrl;
await createInegiMonthlyLoader({ now, fetchBytes: bounded, fetchImpl })(row);
assert.equal(requests.length, 4, 'new invocation fetches fresh evidence');
assert.equal(await createInegiMonthlyLoader({ now: new Date('2026-10-07T12:00:00Z'), fetchImpl: () => { throw Error('must not fetch'); } })(row), null);
assert.equal(await createInegiMonthlyLoader({ fetchImpl })(row), null, 'no implicit current-clock assumption');
for (const response of [new Response('', { status: 302, headers: { location: metadata.url } }),
  new Response('x'.repeat(128 * 1024 + 1)), new Response('{broken')]) {
  let calls = 0;
  const failed = createInegiMonthlyLoader({ now, fetchBytes: bounded, fetchImpl: async () => { calls++; return response; } });
  assert.deepEqual(await Promise.all([failed(row), failed(row)]), [null, null]); assert.equal(calls, 1);
}

// Actual candidateUniverse and evidenceFor boundaries, isolated from all real data/network.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-inegi-integration-'));
try {
  fs.cpSync(path.join(root, 'pipeline'), path.join(temp, 'pipeline'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'data/news'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}');
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'));
  fs.writeFileSync(path.join(temp, 'data/news/2026-W41.json'), JSON.stringify([{
    id: 'old-inflation', url: 'https://www.elfinanciero.com.mx/economia/2026/10/08/inflacion/',
    title: 'INEGI: inflación en México fue de 3.76% en septiembre de 2025', dek: 'Las cifras muestran el resultado anual.',
    sourceId: 'elfin-economia', sourceName: 'El Financiero', source: 'elfinanciero.com.mx', tier: 2,
    published_at: '2026-10-08T12:00:00Z',
  }]));
  fs.writeFileSync(path.join(temp, 'pipeline/lib/fetch-article.js'), `export async function fetchArticle(){throw Error('HTML fetch must not replace official PDF');}`);
  fs.writeFileSync(path.join(temp, 'pipeline/lib/url-safety.js'), fs.readFileSync(path.join(root, 'pipeline/lib/url-safety.js'), 'utf8')
    .replace('lookup = dns.lookup, fetchImpl', 'lookup = async()=>[{address:"93.184.216.34",family:4}], fetchImpl'));
  const runner = `
    import assert from 'node:assert/strict';import fs from 'node:fs';
    import { candidateUniverse,evidenceFor } from './pipeline/build-edition.mjs';
    import scheduled from './pipeline/lib/scheduled-candidate.cjs';
    const row=${JSON.stringify(row)},records=${JSON.stringify(records)};
    const pdf=new Uint8Array(fs.readFileSync(${JSON.stringify(path.join(root,'pipeline/test/fixtures/inegi-inpc-september-2026.pdf'))}));
    let api=0,files=0;globalThis.fetch=async(url,options)=>{if(String(url)===${JSON.stringify(INEGI_NEWS_URL)}){api++;return new Response(JSON.stringify(records));}if(String(url)===${JSON.stringify(metadata.url)}){files++;return new Response(pdf);}throw Error('unexpected network');};
    const now=new Date('2026-10-08T12:05:00Z');
    assert.equal(scheduled.linkScheduledCandidate(JSON.parse(fs.readFileSync('data/news/2026-W41.json'))[0],[row],row.date)?.id,row.id,'fixture demonstrates the generic old-period false match');
    const universe=await candidateUniverse(now,{events:[row]},'2026-10-08');
    const official=universe.filter(x=>x._scheduled?.id===row.id);assert.equal(official.length,1);assert.equal(official[0].url,${JSON.stringify(metadata.url)});assert.equal(api,1);assert.equal(files,1);
    assert.equal(universe.find(x=>x.id==='old-inflation')?._scheduled,null,'retrospective RSS cannot satisfy the monthly obligation');
    const evidence=await evidenceFor(official[0],[],[],[]);assert.equal(evidence[0].kind,'article-body');assert.equal(evidence[0].url,official[0].url);assert.ok(evidence[0].text.includes('Página 6/6'));assert.equal(files,1,'trusted PDF is not fetched as HTML');
    await assert.rejects(evidenceFor({...official[0]},[],[],[]),/no trusted complete/);
    fs.writeFileSync('data/edition.json',JSON.stringify(${JSON.stringify(published)}));
    const next=await candidateUniverse(new Date('2026-10-09T12:05:00Z'),{events:[row]},'2026-10-09');
    assert.ok(!next.some(x=>x._scheduled?.id===row.id),'covered yesterday is not forced again');
    assert.ok(next.some(x=>x.id==='old-inflation'),'different source reporting remains eligible without broad topic suppression');
    assert.equal(api,1,'covered outcome requires no source fetch');assert.equal(files,1);
    fs.unlinkSync('data/edition.json');
    const uncovered=await candidateUniverse(new Date('2026-10-09T12:05:00Z'),{events:[row]},'2026-10-09');
    assert.ok(uncovered.some(x=>x._scheduled?.id===row.id),'uncovered yesterday remains required');
    assert.equal(api,2);assert.equal(files,2);
    fs.mkdirSync('data/editions',{recursive:true});
    fs.writeFileSync('data/editions/2026-10-08.json',JSON.stringify(${JSON.stringify(published)}));
    fs.writeFileSync('data/edition.json',JSON.stringify(${fs.readFileSync(path.join(root,'data/editions/2026-10-09.json'),'utf8')}));
    fs.writeFileSync('data/edition-attempts.json',JSON.stringify(${JSON.stringify(ledger([receipt]))}));
    const weekend=await candidateUniverse(new Date('2026-10-10T12:05:00Z'),{events:[row]},'2026-10-10');
    assert.ok(!weekend.some(x=>x._scheduled?.id===row.id),'exact historical published receipt discharges weekend repeat');
    assert.ok(weekend.some(x=>x.id==='old-inflation'),'new reporting remains eligible');
    assert.equal(api,2,'historical proof performs no new source calls');assert.equal(files,2);
    fs.writeFileSync('data/edition-attempts.json',JSON.stringify({schemaVersion:1,attempts:[]}));
    const unreceipted=await candidateUniverse(new Date('2026-10-10T12:05:00Z'),{events:[row]},'2026-10-10');
    assert.ok(unreceipted.some(x=>x._scheduled?.id===row.id),'archive without receipt remains required');
    assert.equal(api,3);assert.equal(files,3);
    records[0].periodoInformacion='Primera quincena de septiembre de 2026';
    await assert.rejects(candidateUniverse(now,{events:[row]},'2026-10-08'),/required scheduled outcome unavailable/,'RSS cannot bypass failed official validation');
  `;
  fs.writeFileSync(path.join(temp, 'check.mjs'), runner);
  const result = spawnSync(process.execPath, ['check.mjs'], { cwd: temp, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log('INEGI monthly CPI: exact official period, complete bounded PDF, trusted evidence and no RSS bypass pass');
