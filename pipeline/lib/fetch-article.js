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
    } catch { return { ok: false, text: '' }; }
  }
  const text = extractText(html);
  return { ok: text.length >= 400, text };
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
