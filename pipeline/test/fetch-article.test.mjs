import assert from 'node:assert/strict';
import { extractArticleText, extractText } from '../lib/fetch-article.js';

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

console.log('fetch-article tests: ok');
