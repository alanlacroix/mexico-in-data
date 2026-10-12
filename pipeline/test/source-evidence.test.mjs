import assert from 'node:assert/strict';
import { MAX_ARTICLE_EVIDENCE_BYTES, shapeEvidenceRecord } from '../lib/source-evidence.mjs';
import { plainSourceName } from '../lib/plain-language.cjs';
import dns from 'node:dns/promises';
import { evidenceFor, evidenceReady } from '../build-edition.mjs';

const input = {
  id: ' article ',
  kind: ' article-body ',
  source: ' INEGI ',
  url: ' https://www.inegi.org.mx/example ',
  text: '  First paragraph.\n\nSecond  paragraph.  ',
};
const before = structuredClone(input);
assert.deepEqual(shapeEvidenceRecord(input), {
  id: 'article',
  kind: 'article-body',
  source: plainSourceName('INEGI'),
  url: 'https://www.inegi.org.mx/example',
  text: 'First paragraph.\n\nSecond  paragraph.',
}, 'metadata is normalized without rewriting internal source whitespace');
assert.deepEqual(input, before, 'shaping must not mutate the supplied source');

for (const kind of ['article-body', 'prior-article-body']) {
  const caveat = ' Relief applies only after both conditions are met and never retroactively.';
  const complete = 'The measure describes eligibility. '.repeat(100) + caveat;
  assert.ok(complete.indexOf(caveat) > 2200);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: complete }).text, complete,
    `${kind} retains the complete tail caveat beyond the former excerpt boundary`);

  const metadataBytes = Buffer.byteLength(JSON.stringify(shapeEvidenceRecord({ ...input, kind, text: '' })), 'utf8');
  const availableBytes = MAX_ARTICLE_EVIDENCE_BYTES - metadataBytes;
  const asciiBoundary = 'x'.repeat(availableBytes);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: asciiBoundary }).text, asciiBoundary,
    `${kind} accepts a serialized record exactly at the byte limit`);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: asciiBoundary + 'x' }), null,
    `${kind} rejects an oversized source rather than returning an excerpt`);

  const multibyteBoundary = 'é'.repeat(Math.floor(availableBytes / 2)) + 'x'.repeat(availableBytes % 2);
  assert.equal(Buffer.byteLength(multibyteBoundary, 'utf8') + metadataBytes, MAX_ARTICLE_EVIDENCE_BYTES);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: `  ${multibyteBoundary}\n` }).text, multibyteBoundary,
    `${kind} measures UTF-8 bytes after trimming outer whitespace`);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: multibyteBoundary + 'x' }), null,
    `${kind} rejects one byte over the limit even with fewer than 16,384 characters`);
  const supplementaryBoundary = '🌎'.repeat(Math.floor(availableBytes / 4)) + 'x'.repeat(availableBytes % 4);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: supplementaryBoundary }).text, supplementaryBoundary,
    `${kind} preserves complete supplementary Unicode characters`);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: supplementaryBoundary + '🌎' }), null);
  const escapedBoundary = '"'.repeat(Math.floor(availableBytes / 2)) + 'x'.repeat(availableBytes % 2);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: escapedBoundary }).text, escapedBoundary,
    `${kind} includes JSON escaping in its byte measurement`);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text: escapedBoundary + 'x' }), null);
  assert.equal(shapeEvidenceRecord({ ...input, kind, url: 'x'.repeat(MAX_ARTICLE_EVIDENCE_BYTES), text: 'Short body.' }), null,
    `${kind} includes metadata in its byte bound`);
}

for (const kind of ['article', 'coverage', 'standing', 'calendar']) {
  const text = 'x'.repeat(2300);
  assert.equal(shapeEvidenceRecord({ ...input, kind, text }).text, text.slice(0, 2200),
    `${kind} retains the existing non-body snippet contract`);
}

assert.deepEqual(shapeEvidenceRecord({}), { id: '', kind: '', source: '', url: '', text: '' },
  'the helper preserves existing empty-value normalization; admission belongs to the caller');

const leadUrl = 'https://publisher.example/report?release=1';
const lead = { id: 'article', kind: 'article-body', source: 'Publisher', url: leadUrl,
  text: 'Complete located reporting. '.repeat(25) + 'The exchange must still approve the transaction.' };
const ready = evidence => evidenceReady({ item: { url: leadUrl }, evidence });
assert.equal(ready([lead]), true, 'one located complete lead is enough structurally; an undated next step is not rejected');
for (const extra of ['coverage', 'standing', 'calendar', 'prior-article-body']) {
  assert.equal(ready([{ ...lead, kind: 'article' }, { ...lead, id: extra, kind: extra, url: 'https://context.example/report' }]), false,
    `${extra} cannot replace a missing complete lead`);
}
for (const changed of [{ id: 'coverage' }, { text: '  ' }, { url: leadUrl + '&other=2' },
  { url: leadUrl.replace('publisher.', 'www.publisher.') }, { url: leadUrl + '#section' }]) {
  assert.equal(ready([{ ...lead, ...changed }]), false, 'readiness does not invent URL or record equivalence');
}
assert.equal(ready([]), false);

// Exercise the real fetch/extraction/shaping path. Feed claims and canonical tags
// cannot promote snippets to bodies; only redirects already allowed by URL safety
// can lead to extracted text, still bound to the requested story URL.
const savedLookup = dns.lookup;
const savedFetch = globalThis.fetch;
try {
  dns.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  const item = { url: leadUrl, title: 'A documented development', dek: 'Short feed summary.', sourceName: 'Publisher',
    articleBody: true, kind: 'article-body', text: lead.text,
    _coverage: [{ url: 'https://context.example/report', source: 'Context', title: 'Another summary' }] };
  for (const html of [
    `<nav>${lead.text}</nav><link rel="canonical" href="${leadUrl}">`,
    '<article class="article-body"><p>A short teaser.</p></article>',
    `<script type="application/ld+json">${JSON.stringify({ articleBody: lead.text })}</script><p>Feed summary</p>`,
  ]) {
    globalThis.fetch = async () => new Response(html, { headers: { 'content-type': 'text/html' } });
    const evidence = await evidenceFor(item, [], [], []);
    assert.equal(evidence.length, 2, 'the regression includes supplementary evidence that formerly admitted the snippet');
    assert.equal(evidence[0].kind, 'article');
    assert.equal(evidenceReady({ item, evidence }), false, 'untrusted full-body labels do not establish extraction');
  }
  const finalUrl = 'https://publisher.example/actual-report';
  const requested = [];
  globalThis.fetch = async url => {
    requested.push(String(url));
    return String(url) === leadUrl
      ? new Response('', { status: 302, headers: { location: finalUrl } })
      : new Response(`<article class="article-body"><p>${lead.text}</p></article>`);
  };
  const redirected = await evidenceFor(item, [], [], []);
  assert.deepEqual(requested, [leadUrl, finalUrl]);
  assert.equal(redirected[0].url, leadUrl);
  assert.equal(evidenceReady({ item, evidence: redirected }), true, 'existing validated same-host redirect remains usable');
  globalThis.fetch = async () => new Response('', { status: 302, headers: { location: 'https://unapproved.example/report' } });
  assert.equal(evidenceReady({ item, evidence: await evidenceFor(item, [], [], []) }), false,
    'an unapproved redirect cannot supply a complete lead');
} finally {
  dns.lookup = savedLookup;
  globalThis.fetch = savedFetch;
}

console.log('source-evidence tests: ok');
