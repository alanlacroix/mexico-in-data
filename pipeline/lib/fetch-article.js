// fetch-article.js — shared article fetch + text extraction. Used by build-email.js
// (to summarize lead stories from real text) and archive-bodies.js (to capture the
// body of every item before its link rots). Zero-dependency: node fetch with a curl
// fallback, crude tag-stripping. The captured text is for internal derivation only
// (summaries, later structure), never republished.

const UA = 'Mozilla/5.0 (compatible; mexico-brief; +https://mexicobrief.com)';

export async function fetchArticle(url) {
  let html = '';
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    html = await r.text();
  } catch {
    try {
      const { execFileSync } = await import('node:child_process');
      html = execFileSync('curl', ['-sL', '--compressed', '--max-time', '22', '-A', UA, url], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
    } catch { return { ok: false, text: '', image: '', fetched: false }; }
  }
  const text = extractText(html);
  // `fetched` = we actually obtained the page (vs a network failure). Lets callers tell a
  // legitimately image-less page from a transient failure that should be retried.
  return { ok: text.length >= 400, text, image: extractOgImage(html), fetched: true };
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
  const art = s.match(/<article\b[\s\S]*?<\/article>/i);
  if (art) s = art[0];
  return s.replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;/g, "'").replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ').trim();
}
