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
    const extracted = extractArticleText(html);
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

export function extractArticleText(html) {
  if (!html) return { text: '', bodyFound: false };
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // Prefer the publisher's actual story-body container. Some WordPress themes do not
  // wrap the story in <article>; they reserve <article> for the related-story cards
  // below it. Taking the first <article> made a perfectly readable source look empty
  // and prevented Briefly Explained from running. The tags marker is a useful, narrow
  // end boundary for those themes, while the ordinary single-article fallback still
  // handles cleaner publisher markup.
  const body = s.match(/<(div|section|article)\b(?=[^>]*(?:itemprop=["']articleBody["']|property=["']schema:text["']|class=["'][^"']*\b(?:content-inner|entry-content|article-content|article-body|story-body|content-body|post-content|article-body-wrapper)\b[^"']*["']))[^>]*>/i);
  let bodyFound = false;
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
