// fetch-article.js — shared article fetch + text extraction. Used by build-email.js
// (to summarize lead stories from real text) and archive-bodies.js (to capture the
// body of every item before its link rots). Zero-dependency: node fetch with a curl
// fallback, crude tag-stripping. The captured text is for internal derivation only
// (summaries, later structure), never republished.

// A realistic browser identity + language/accept headers. A crawler UA ("compatible;
// mexico-brief") gets served a bot/consent-stripped page by some publishers (El País,
// notably) — which drops the og:image the page otherwise carries, so images vanished on CI
// while the same fetch worked from a normal machine (Audit 2026-07-18). We only read the
// public link-preview markup a page publishes for sharing; a normal UA gets the real page.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8' };
import { fetchBoundedText } from './url-safety.js';

export async function fetchArticle(url, { allowedHosts } = {}) {
  try {
    const initial = new URL(url);
    const hosts = allowedHosts?.length ? allowedHosts : [initial.hostname];
    const result = await fetchBoundedText(url, { allowedHosts: hosts, headers: HEADERS, timeoutMs: 15000, maxBytes: 6 * 1024 * 1024 });
    const html = result.text;
    const extracted = extractArticleText(html, { url: result.url });
    const ok = extracted.text.length >= 400;
    return {
      ok,
      text: extracted.text,
      articleBody: ok && extracted.bodyFound,
      image: extractOgImage(html),
      fetched: true,
      finalUrl: result.url,
    };
  } catch { return { ok: false, text: '', articleBody: false, image: '', fetched: false, finalUrl: '' }; }
}

// The article's own link-preview image (og:image / twitter:image) — the thumbnail the
// publisher explicitly marks up for sharing. Used as a SMALL preview on story cards that
// link out, unfurl-style, attributed via the story's source line. https only; empty when
// the page declares none.
export function extractOgImage(html) {
  if (!html) return '';
  const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["']/i);
  const url = m ? m[1].replace(/&amp;/g, '&').trim() : '';
  return /^https:\/\//i.test(url) ? url.slice(0, 500) : '';
}

function balancedElementContent(html, opening) {
  if (!opening || !opening[1] || !Number.isInteger(opening.index)) return '';
  const tag = opening[1].toLowerCase();
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  token.lastIndex = opening.index;
  let depth = 0;
  for (let match = token.exec(html); match; match = token.exec(html)) {
    const closing = /^<\//.test(match[0]);
    const selfClosing = /\/\s*>$/.test(match[0]);
    if (closing) depth--;
    else if (!selfClosing) depth++;
    if (depth === 0) {
      const start = opening.index + opening[0].length;
      return html.slice(start, match.index);
    }
  }
  return '';
}

function substantialParagraphCount(html) {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length >= 80).length;
}

function isDofSource(url) {
  try {
    return ['dof.gob.mx', 'www.dof.gob.mx', 'diariooficial.gob.mx', 'www.diariooficial.gob.mx']
      .includes(new URL(url).hostname);
  } catch { return false; }
}

// Attribute values may themselves contain markup-like text. Consume each complete
// value so data-id, quoted examples and similarly named IDs cannot select a body.
function attributeValues(opening, name) {
  const attributes = opening.replace(/^<[^\s>]+/, '').replace(/\/?\s*>$/, '');
  return [...attributes.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)]
    .filter((match) => match[1].toLowerCase() === name)
    .map((match) => match[2] ?? match[3] ?? match[4] ?? '');
}

// DOF's embedded document needs exact, quote-aware boundaries: </body> text
// inside an attribute is not a closing tag, and BODY-extra is not BODY. Keep
// this stricter scanner local so ordinary publisher extraction is unchanged.
function dofTags(html) {
  const tags = [];
  let offset = 0;
  while (offset < html.length) {
    const index = html.indexOf('<', offset);
    if (index < 0) break;
    if (html.startsWith('<!--', index)) {
      const end = html.indexOf('-->', index + 4);
      if (end < 0) return null;
      tags.push({ index, end: end + 3, ignored: true });
      offset = end + 3;
      continue;
    }
    const declaration = html.slice(index).match(/^<!DOCTYPE\b(?:[^<>"']|"[^"]*"|'[^']*')*>/i);
    if (declaration) {
      offset = index + declaration[0].length;
      tags.push({ index, end: offset, ignored: true });
      continue;
    }
    const match = html.slice(index).match(/^<(\/?)([a-z][\w:-]*)(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*>/i);
    if (!match) return null;
    const tag = { raw: match[0], name: match[2].toLowerCase(), closing: Boolean(match[1]),
      index, end: index + match[0].length, selfClosing: /\/\s*>$/.test(match[0]) };
    // Inert template descendants are outside the supported legacy DOF layout.
    // Reject live templates instead of mistaking hidden markup for evidence.
    if (tag.name === 'template') return null;
    if (!tag.closing && tag.name === 'plaintext') return null;
    if (!tag.closing && /^(?:script|style|title|textarea|xmp|iframe|noembed|noframes|noscript)$/.test(tag.name)) {
      if (tag.selfClosing) return null;
      // Raw-text/RCDATA descendants are not live elements. Quoted examples
      // were consumed with their containing tag and never enter this branch.
      const close = new RegExp(`<\\/${tag.name}(?=[\\s/>])[^>]*>`, 'gi');
      close.lastIndex = tag.end;
      const ending = close.exec(html);
      if (!ending || !/^<\/[a-z]+\s*>$/i.test(ending[0])) return null;
      tag.end = ending.index + ending[0].length;
      tag.ignored = true;
    }
    tags.push(tag);
    offset = tag.end;
  }
  return tags;
}

function dofElementContent(html, tags, opening) {
  if (!opening || opening.closing || opening.selfClosing) return '';
  let depth = 0;
  for (const tag of tags) {
    if (tag.index < opening.index || tag.ignored) continue;
    // Closing tags cannot carry attributes or a self-closing slash. Treat a
    // malformed live close as ambiguous instead of accepting a clipped prefix.
    if (tag.closing && !/^<\/[a-z][\w:-]*\s*>$/i.test(tag.raw)) return '';
    if (tag.name !== opening.name) continue;
    if (tag.closing) depth--;
    else if (!tag.selfClosing) depth++;
    if (depth === 0) return html.slice(opening.end, tag.index);
  }
  return '';
}

function dofTextContent(html) {
  const tags = dofTags(html);
  if (!tags) return '';
  let offset = 0;
  let text = '';
  for (const tag of tags) {
    text += `${html.slice(offset, tag.index)} `;
    offset = tag.end;
  }
  return `${text}${html.slice(offset)}`;
}

function dofArticleContent(html) {
  const tags = dofTags(html);
  if (!tags) return '';
  const containers = tags.filter((tag) => !tag.ignored && !tag.closing && attributeValues(tag.raw, 'id').includes('DivDetalleNota'));
  if (containers.length !== 1 || containers[0].name !== 'div'
    || attributeValues(containers[0].raw, 'id').length !== 1) return '';
  const container = dofElementContent(html, tags, containers[0]);
  // The observed legacy DOF template embeds a complete HTML document, followed
  // by a conversion disclaimer, inside DivDetalleNota. Only its unique BODY is
  // evidence. Missing/duplicate boundaries fail closed, including related cards.
  const containerTags = dofTags(container);
  if (!containerTags) return '';
  const bodies = containerTags.filter((tag) => tag.name === 'body' && !tag.closing);
  if (bodies.length !== 1 || containerTags.filter((tag) => tag.name === 'body' && tag.closing).length !== 1) return '';
  const content = dofElementContent(container, containerTags, bodies[0]);
  const contentTags = dofTags(content);
  if (!contentTags) return '';
  // Text controls/fallbacks are outside the observed official document shape;
  // reject instead of silently dropping potentially visible policy content.
  if (contentTags.some((tag) => /^(?:textarea|xmp|iframe|noembed|noframes|noscript)$/.test(tag.name))) return '';
  const contentOpenings = contentTags.filter((tag) => !tag.ignored && !tag.closing);
  if (contentOpenings.some((tag) => /^(?:nav|aside|header|footer|article)$/.test(tag.name))) return '';
  const hasClass = (opening, token) => attributeValues(opening.raw, 'class')
    .some((value) => value.split(/\s+/).includes(token));
  const headings = contentOpenings.filter((tag) => tag.name === 'h1' && hasClass(tag, 'Titulo_1'));
  const paragraphs = contentOpenings.filter((tag) => tag.name === 'div' && hasClass(tag, 'Texto'));
  let substantialParagraphs = 0;
  if (headings.length !== 1 || !dofTextContent(dofElementContent(content, contentTags, headings[0])).trim()
    || !paragraphs.some((opening) => dofTextContent(dofElementContent(content, contentTags, opening))
      .replace(/\s+/g, ' ').trim().length >= 80 && ++substantialParagraphs >= 2)) return '';
  // The retained document uses named Spanish entities, not literal accents.
  // Decode those here without changing ordinary publishers' extraction behavior.
  const entities = { Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
    aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Ntilde: 'Ñ', ntilde: 'ñ', Uuml: 'Ü', uuml: 'ü' };
  return dofTextContent(content).replace(/&([a-z]+);/gi, (entity, name) => Object.hasOwn(entities, name) ? entities[name] : entity);
}

export function extractArticleText(html, { url = '' } = {}) {
  if (!html) return { text: '', bodyFound: false };
  let s;
  let bodyFound = false;
  if (isDofSource(url)) {
    s = dofArticleContent(html);
    if (!s) return { text: '', bodyFound: false };
    bodyFound = true;
  }
  else {
    s = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    // Prefer the publisher's actual story-body container. Some WordPress themes do not
    // wrap the story in <article>; they reserve <article> for the related-story cards
    // below it. Taking the first <article> made a perfectly readable source look empty
    // and prevented Briefly Explained from running. The tags marker is a useful, narrow
    // end boundary for those themes, while the ordinary single-article fallback still
    // handles cleaner publisher markup.
    const body = s.match(/<(div|section|article)\b(?=[^>]*(?:itemprop=["']articleBody["']|property=["']schema:text["']|class=["'][^"']*\b(?:content-inner|entry-content|article-content|article-body|story-body|content-body|post-content|article-body-wrapper)\b[^"']*["']))[^>]*>/i);
    if (body) {
      const content = balancedElementContent(s, body);
      if (content) {
        s = content;
        bodyFound = true;
      }
    }
    else {
      const articles = [...s.matchAll(/<(article)\b[^>]*>/gi)];
      // Multiple <article> elements are commonly a list of cards, not the story body.
      // A singleton is still trusted only when it has the shape of a story rather than
      // a recommendation card: no card-like marker and at least two substantial paragraphs.
      if (articles.length === 1) {
        const content = balancedElementContent(s, articles[0]);
        const cardLike = /\b(?:card|related|recommended|recommendation|promo|teaser|sponsored)\b/i
          .test(`${articles[0][0]} ${content.slice(0, 300)}`);
        if (content && !cardLike && substantialParagraphCount(content) >= 2) {
          s = content;
          bodyFound = true;
        }
      }
    }
  }
  const text = s.replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;/g, "'").replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ').trim();
  return { text, bodyFound };
}

export function extractText(html) {
  return extractArticleText(html).text;
}
