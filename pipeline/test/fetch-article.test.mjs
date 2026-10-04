import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import { extractArticleText, extractText, fetchArticle } from '../lib/fetch-article.js';

const prose = 'A documented sentence about the development and what happened. '.repeat(12);

const explicit = extractArticleText(`<html><body><nav>${prose}</nav><article class="b-article-body article-body-wrapper"><p>${prose}</p></article><aside>${prose}</aside></body></html>`);
assert.equal(explicit.bodyFound, true, 'an explicit publisher story-body container is trusted');
assert.ok(explicit.text.length >= 400);

const schemaBody = extractArticleText(`<html><body><section property="schema:text"><p>${prose}</p></section></body></html>`);
assert.equal(schemaBody.bodyFound, true, 'schema-marked article text is trusted');

const nestedBody = extractArticleText(`<html><body><div class="entry-content"><div>Photo</div><p>${prose}</p></div></body></html>`);
assert.equal(nestedBody.bodyFound, true, 'a marked body may contain nested containers');
assert.ok(nestedBody.text.length >= 400, 'nested markup must not truncate the story body at the first inner closing tag');

const singleArticle = extractArticleText(`<html><body><article><p>${prose}</p><p>${prose}</p></article></body></html>`);
assert.equal(singleArticle.bodyFound, true, 'one article with multiple substantial paragraphs is trusted');

const singletonCard = extractArticleText(`<html><body><main><div class="story-container">Unrecognized story shell</div><article class="recommended-card"><h2>Recommended</h2><p>${prose}</p><p>${prose}</p></article></main></body></html>`);
assert.equal(singletonCard.bodyFound, false, 'one unrelated recommendation card is not trusted as the selected article body');

const singletonTeaser = extractArticleText(`<html><body><article><h2>Recommended</h2><p>${prose}</p></article></body></html>`);
assert.equal(singletonTeaser.bodyFound, false, 'one long teaser paragraph is not trusted as a story body');

const navigationOnly = extractArticleText(`<html><body><nav>${prose}</nav><main><div class="consent">${prose}</div></main><footer>${prose}</footer></body></html>`);
assert.equal(navigationOnly.bodyFound, false, 'long navigation and consent text is not an article body');
assert.equal(extractText(`<article><p>${prose}</p><p>${prose}</p></article>`), singleArticle.text,
  'the legacy text helper stays compatible');

const dofUrl = 'https://www.dof.gob.mx/nota_detalle.php?codigo=5799964&fecha=30/09/2026';
const dofFixture = fs.readFileSync(new URL('./fixtures/dof-legacy-note-5799964.html', import.meta.url), 'utf8');
const official = extractArticleText(dofFixture, { url: dofUrl });
assert.equal(official.bodyFound, true, 'the retained DOF policy document has a verified body');
assert.equal(official.text.length, 14199, 'all retained policy text is extracted without clipping');
assert.equal(Buffer.byteLength(official.text), 14581);
assert.ok(official.text.startsWith('ACUERDO de la Comisión Nacional de Energía'));
assert.ok(official.text.includes('entre el 19 de octubre de 2026 y el 6 de octubre de 2028'));
assert.ok(official.text.includes('sin que pueda iniciar antes del 19 de octubre de 2026 ni tener efectos retroactivos'));
assert.ok(official.text.endsWith('Juan Carlos Solís Ávila .- Rúbrica.'), 'the final transitory provision and signature survive nested divs');
assert.doesNotMatch(official.text, /Inicio \||Top Notas|RELATED STORY|En el documento que usted|&[a-z]+;/i,
  'navigation, related stories, conversion disclaimer and Spanish entities do not pollute evidence');

const dofProse = `<div><h1 class='Titulo_1'>ACUERDO oficial</h1><div class='Texto'>${prose}</div><div><div class='Texto'>${prose}Final clause.</div></div></div>`;
const dofBody = `<HTML><head><title>Truncated duplicate title</title></head><BODY>${dofProse}</BODY></HTML>`;
const dofContainer = `<div id='DivDetalleNota'>${dofBody}</div>`;
const dofExtract = (html) => extractArticleText(html, { url: dofUrl });
const rejectDof = (html, description) => assert.deepEqual(dofExtract(html), { text: '', bodyFound: false }, description);
const related = `<article class='entry-content'><p>${prose}</p><p>${prose}</p></article>`;
const cleanDof = dofExtract(dofContainer);
assert.equal(cleanDof.bodyFound, true, 'nested ordinary containers preserve official text');
assert.ok(cleanDof.text.endsWith('Final clause.'));
assert.ok(!cleanDof.text.includes('Truncated duplicate title'), 'the embedded head is outside the evidence body');
assert.deepEqual(dofExtract(`${related}${dofContainer}${related}`), cleanDof, 'unrelated publisher-style bodies cannot override the DOF boundary');

rejectDof(`${dofBody}${related}`, 'a missing official container must not fall back to a related story');
rejectDof(dofContainer + dofContainer, 'duplicate sibling official containers are ambiguous');
rejectDof(`<div id='DivDetalleNota'>${dofContainer}</div>`, 'nested official containers are ambiguous');
rejectDof(dofContainer.slice(0, -6), 'an unclosed official container is rejected');
rejectDof(dofContainer.replace("id='DivDetalleNota'", "data-id='DivDetalleNota'"), 'data-id is not the official ID');
rejectDof(dofContainer.replace("id='DivDetalleNota'", "id='DivDetalleNota-extra'"), 'similarly named containers are not official');
rejectDof(dofContainer.replace("id='DivDetalleNota'", `title="id='DivDetalleNota'"`), 'a quoted ID example is not an attribute');
rejectDof(dofContainer.replace("id='DivDetalleNota'", "id='unrelated' id='DivDetalleNota'"), 'duplicate ID attributes are rejected');
rejectDof(`<section id='DivDetalleNota'>${dofBody}</section>`, 'an unsupported container tag fails closed');
rejectDof(`<!-- ${dofContainer} -->${related}`, 'a commented-out official container cannot qualify a related story');
assert.deepEqual(dofExtract(`<!-- ${dofContainer} -->${dofContainer}`), cleanDof, 'commented examples do not create duplicate live containers');
rejectDof(`<div id='DivDetalleNota'>${dofProse}${related}</div>`, 'a missing embedded BODY fails closed');
rejectDof(dofContainer.replace('</BODY>', ''), 'an unclosed embedded BODY is rejected');
rejectDof(`<div id='DivDetalleNota'>${dofBody}${dofBody}</div>`, 'duplicate embedded BODY documents are ambiguous');
rejectDof(dofContainer.replace('<BODY>', '<BODY><BODY>'), 'nested embedded BODY elements are rejected');
rejectDof(`<div id='DivDetalleNota'><BODY><nav>${prose}${prose}</nav></BODY></div>`, 'long navigation is not policy text');
rejectDof(`<div id='DivDetalleNota'><BODY><nav>${dofProse}</nav></BODY></div>`, 'navigation containing lookalike text classes is rejected');
rejectDof(`<div id='DivDetalleNota'><BODY>${related}</BODY></div>`, 'a related story inside the shell is not a policy document');
rejectDof(dofContainer.replace('</BODY>', `${related}</BODY>`), 'an official document mixed with story cards fails closed');
rejectDof(dofContainer.replace("class='Titulo_1'", "class='other'"), 'the observed official title marker is required');
rejectDof(dofContainer.replace('ACUERDO oficial', '<span></span>'), 'a marked but empty heading is not a policy title');
rejectDof(dofContainer.replaceAll("class='Texto'", "class='other'"), 'the observed substantial official paragraphs are required');
assert.ok(dofExtract(dofContainer.replace('ACUERDO oficial', 'ACUERDO &constructor;')).text.includes('&constructor;'),
  'unknown named entities are retained without consulting inherited object properties');

// Put misleading delimiters AFTER enough genuine prose to qualify. A truncated
// prefix must never pass as a complete body while losing the final condition.
const boundaryPrefix = `<div id='DivDetalleNota'><BODY><h1 class='Titulo_1'>ACUERDO</h1><div class='Texto'>${prose}</div><div class='Texto'>${prose}</div>`;
const boundarySuffix = `<div class='Texto'>FINAL REQUIRED CONDITION</div></BODY></div>`;
const completeBoundary = dofExtract(boundaryPrefix + boundarySuffix);
assert.equal(completeBoundary.bodyFound, true);
assert.ok(completeBoundary.text.endsWith('FINAL REQUIRED CONDITION'));
for (const delimiter of ['</body ignored>', '</body>', '<BODY>', '</div ignored>', '</div>', '</h1>', '<BODY-extra>', '<template>', '</template>']) {
  for (const quote of ['"', "'"]) {
    assert.deepEqual(dofExtract(`${boundaryPrefix}<span title=${quote}${delimiter}${quote}></span>${boundarySuffix}`), completeBoundary,
      `quoted ${delimiter} is attribute text and cannot truncate or contaminate the body`);
  }
}
for (const delimiter of ['</body ignored>', '</body/>', '</div ignored>', '</h1 ignored>']) {
  rejectDof(`${boundaryPrefix}${delimiter}${boundarySuffix}`, `malformed live closing ${delimiter} fails closed`);
}
rejectDof(dofContainer.replace('<BODY>', '<BODY-extra>'), 'BODY-extra cannot open the required BODY');
rejectDof(dofContainer.replaceAll('BODY>', 'BODY-extra>'), 'a BODY-extra pair is not a BODY document');
rejectDof(dofContainer.replace('</BODY>', '</BODY-extra>'), 'BODY-extra cannot close the required BODY');
assert.deepEqual(dofExtract(`${boundaryPrefix}<BODY-extra></BODY-extra>${boundarySuffix}`), completeBoundary,
  'exact tag names keep a BODY-extra pair from altering genuine BODY boundaries');

for (const [opening, closing] of [['<script>', '</script>'], ['<style>', '</style>'], ['<!--', '-->']]) {
  const quoted = `${boundaryPrefix}<span title="${opening}">FINAL REQUIRED CONDITION</span><span title="${closing}">Unrelated</span></BODY></div>`;
  const extracted = dofExtract(quoted);
  assert.equal(extracted.bodyFound, true, `quoted ${opening} does not start preprocessing`);
  assert.equal(extracted.text, `${completeBoundary.text} Unrelated`, `quoted ${opening} preserves all visible prose and strips complete attributes`);
  assert.deepEqual(dofExtract(`${boundaryPrefix}${opening}IGNORE THIS HIDDEN TEXT${closing}${boundarySuffix}`), completeBoundary,
    `real ${opening} content is excluded without altering following policy text`);
  rejectDof(`${boundaryPrefix}${opening}Unclosed hidden text${boundarySuffix}`, `unclosed ${opening} fails closed`);
}
rejectDof(`${boundaryPrefix}<span title="unterminated>${boundarySuffix}`, 'an unclosed attribute fails closed');
for (const rawTag of ['title', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']) {
  rejectDof(`<${rawTag}>${dofContainer}</${rawTag}>`, `${rawTag} text cannot supply live official containers`);
  rejectDof(`<div id='DivDetalleNota'><${rawTag}><BODY>${dofProse}</BODY></${rawTag}></div>`, `${rawTag} text cannot supply live BODY boundaries`);
}
rejectDof(`${boundaryPrefix}<textarea>FINAL REQUIRED CONDITION</textarea></BODY></div>`,
  'unsupported text controls fail closed instead of silently dropping visible conditions');
rejectDof(`<plaintext>${dofContainer}`, 'plaintext content cannot supply live official containers');
rejectDof(`<template>${dofContainer}</template>`, 'an inert template cannot supply a live official container');
rejectDof(`${boundaryPrefix}<template>UNRELATED HIDDEN CLAIM</template>${boundarySuffix}`,
  'template contents cannot be included as visible official prose');

for (const host of ['dof.gob.mx', 'www.dof.gob.mx', 'diariooficial.gob.mx', 'www.diariooficial.gob.mx']) {
  assert.deepEqual(extractArticleText(dofContainer, { url: `https://${host}/nota_detalle.php?codigo=5799964` }), cleanDof,
    `the known official alias ${host} uses the same strict extraction`);
}
assert.equal(extractArticleText(dofContainer).bodyFound, false, 'the DOF ID alone does not change ordinary publisher rules');
assert.equal(extractArticleText(dofContainer, { url: 'https://www.dof.gob.mx.evil.example/' }).bodyFound, false,
  'an official-looking hostname is not the official source');
const ordinaryHtml = `<nav>${prose}</nav><div id='DivDetalleNota'>Unrelated widget</div><section property='schema:text'><p>Ordinary publisher. ${prose}</p></section>`;
assert.deepEqual(extractArticleText(ordinaryHtml, { url: 'https://publisher.example/story' }), extractArticleText(ordinaryHtml),
  'ordinary publishers preserve their existing extraction and marked story boundary');

// Verify that fetchArticle passes the verified final URL through the real bounded
// fetch path. DNS and HTTP are stubbed, so this regression test is wholly offline.
const savedLookup = dns.lookup;
const savedFetch = globalThis.fetch;
try {
  dns.lookup = async () => [{ address: '8.8.8.8', family: 4 }];
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return requestedUrls.length === 1
      ? new Response('', { status: 302, headers: { location: dofUrl } })
      : new Response(dofFixture, { status: 200 });
  };
  const fetched = await fetchArticle('https://dof.gob.mx/nota_detalle.php?codigo=5799964');
  assert.equal(requestedUrls.length, 2);
  assert.equal(fetched.finalUrl, dofUrl);
  assert.equal(fetched.ok, true);
  assert.equal(fetched.articleBody, true, 'HTTP 200 official body is usable after extraction');
  assert.equal(fetched.text, official.text);
  globalThis.fetch = async () => new Response(`<nav>${prose}</nav>${related}`, { status: 200 });
  const noBody = await fetchArticle(dofUrl);
  assert.equal(noBody.fetched, true);
  assert.equal(noBody.ok, false, 'HTTP 200 navigation does not become usable official evidence');
  assert.equal(noBody.articleBody, false);
  assert.equal(noBody.text, '');
} finally {
  dns.lookup = savedLookup;
  globalThis.fetch = savedFetch;
}

console.log('fetch-article tests: ok');
