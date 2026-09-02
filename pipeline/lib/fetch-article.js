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
    const text = extractText(html);
    return { ok: text.length >= 400, text, image: extractOgImage(html), fetched: true, finalUrl: result.url };
  } catch { return { ok: false, text: '', image: '', fetched: false, finalUrl: '' }; }
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

export function extractText(html) {
  if (!html) return '';
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // Prefer the publisher's actual story-body container. Some WordPress themes do not
  // wrap the story in <article>; they reserve <article> for the related-story cards
  // below it. Taking the first <article> made a perfectly readable source look empty
  // and prevented Briefly Explained from running. The tags marker is a useful, narrow
  // end boundary for those themes, while the ordinary single-article fallback still
  // handles cleaner publisher markup.
  const body = s.match(/<div[^>]+class=["'][^"']*\bcontent-inner\b[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]+class=["'][^"']*\b(?:jeg_post_tags|post-tags|article-tags)\b)/i)
    || s.match(/<div[^>]+(?:itemprop=["']articleBody["']|class=["'][^"']*\b(?:entry-content|article-content|post-content)\b[^"']*["'])[^>]*>([\s\S]*?)(?=<div[^>]+class=["'][^"']*\b(?:related|author|share-bottom|post-tags|article-tags)\b)/i);
  if (body) s = body[1];
  else {
    const articles = [...s.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((match) => match[0]);
    // Multiple <article> elements are commonly a list of cards, not the story body.
    // Keep the full document in that case instead of confidently extracting a teaser.
    if (articles.length === 1) s = articles[0];
  }
  return s.replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;/g, "'").replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ').trim();
}
