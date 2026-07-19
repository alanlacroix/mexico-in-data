// collect-news.js — the news collector. Every run: fetch every RSS/API source in
// news-sources.json, normalize + dedup, append new items to this week's ledger
// (data/news/YYYY-Www.json), rebuild the rolling 72h wire (data/news/wire.json)
// that the site reads, and update health (data/news/health.json). No LLM anywhere;
// headlines + deks only. Zero dependencies. Fail-soft: one dead feed never stops
// the run. This is the daily foundation both the site Wire and the weekly email
// draw from.
//
//   node collect-news.js

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const NEWSDIR = path.join(ROOT, 'data', 'news');
const REG = JSON.parse(fs.readFileSync(path.join(__dirname, 'news-sources.json'), 'utf8'));
const UA = 'Mozilla/5.0 (compatible; mexico-brief news collector; +https://mexicobrief.com)';

// Mexico relevance filter for pan-LatAm / global feeds (mx:true).
const MX = /m[eé]xic|mexican|\bcdmx\b|banxico|\bcnbv\b|sheinbaum|\bpemex\b|\bmorena\b|nearshor|monterrey|guadalajara|\bbmv\b|banorte|\bfemsa\b|\boxxo\b|\bpeso(s)?\b|remittanc|remesas|maquila/i;

// ---- tiny fetch (node fetch, curl fallback) ----
async function fetchText(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*' },
      redirect: 'follow', signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } catch (e) {
    const { execFileSync } = await import('node:child_process');
    return execFileSync('curl', ['-sL', '--compressed', '--max-time', '25', '-A', UA, url], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  }
}

// ---- minimal RSS/Atom parsing (zero-dep) ----
const stripCdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ');
const decodeOnce = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&nbsp;/g, ' ');
// Decode before stripping tags. Otherwise an encoded `<img onerror=...>` survives
// the tag pass and becomes markup later when a page renders the headline.
const decodeAll = (s) => {
  let value = String(s || '');
  for (let i = 0; i < 3; i += 1) {
    const next = decodeOnce(value);
    if (next === value) break;
    value = next;
  }
  return value;
};
const clean = (s) => stripTags(decodeAll(stripCdata(s || ''))).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
function pick(block, tag) {
  const m = block.match(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return m ? m[1] : '';
}
function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks) {
    const title = clean(pick(b, 'title'));
    let link = clean(pick(b, 'link'));
    if (!link) { const m = b.match(/<link[^>]*href=["']([^"']+)["']/i); if (m) link = m[1]; }
    const dek = clean(pick(b, 'description') || pick(b, 'summary') || pick(b, 'content')).slice(0, 320);
    const date = clean(pick(b, 'pubDate') || pick(b, 'published') || pick(b, 'updated') || pick(b, 'dc:date'));
    if (title && link) items.push({ title, link, dek, date });
  }
  return items;
}

// Mexico Business News does not publish a usable RSS feed, but its public
// Drupal JSON:API exposes the same article metadata. Keep this adapter small:
// headline, direct article URL, summary and publication date only.
function parseJsonApi(text, baseUrl) {
  const json = JSON.parse(text);
  return (Array.isArray(json.data) ? json.data : []).flatMap((node) => {
    const a = node && node.attributes;
    const alias = a && a.path && a.path.alias;
    if (!a || !a.title || !alias || !alias.includes('/news/')) return []; // reported news only
    const link = new URL(alias, baseUrl).toString();
    const dek = clean((a.body && (a.body.summary || a.body.value)) || '').slice(0, 320);
    return [{ title: clean(a.title), link, dek, date: a.created || a.changed || '' }];
  });
}

function beatFor(s, url) {
  if (s.id !== 'mexico-business-news') return s.beat;
  if (/\/(finance|payments)\//i.test(url)) return 'fintech';
  if (/\/(trade-and-investment|policyandeconomy)\//i.test(url)) return 'economy';
  if (/\/(cloudanddata|tech)\//i.test(url)) return 'companies';
  return 'companies';
}

// ---- normalize ----
function canonical(u) {
  try {
    const url = new URL(u.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    url.protocol = 'https:';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const k of [...url.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$|^ref$/i.test(k)) url.searchParams.delete(k);
    return url.toString();
  } catch { return ''; }
}
const idOf = (u) => crypto.createHash('sha1').update(u).digest('hex').slice(0, 12);
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
function toISO(d) { const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toISOString() : null; }
function isoWeek(dt) {
  const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((d - ys) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
}
const weekFile = (w) => path.join(NEWSDIR, w + '.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

async function main() {
  fs.mkdirSync(NEWSDIR, { recursive: true });
  const now = new Date();
  const thisWeek = isoWeek(now);
  const prevWeek = isoWeek(new Date(now.getTime() - 7 * 864e5));

  const ledger = readJson(weekFile(thisWeek), []);
  const prevLedger = readJson(weekFile(prevWeek), []);
  const seen = new Set([...ledger, ...prevLedger].map((x) => x.id));

  const health = {};
  let added = 0;

  for (const s of REG.sources) {
    let n = 0, ok = false;
    try {
      const xml = await fetchText(s.url);
      const items = s.format === 'jsonapi' ? parseJsonApi(xml, s.baseUrl || s.url) : parseFeed(xml);
      ok = items.length > 0;
      for (const it of items) {
        const url = canonical(it.link);
        if (!url) continue;
        const id = idOf(url);
        if (seen.has(id)) continue;
        if (s.mx && !MX.test(it.title + ' ' + it.dek)) continue;   // Mexico filter on pan-LatAm feeds
        seen.add(id);
        ledger.push({
          id, url, title: it.title, dek: it.dek,
          source: domainOf(url) || s.id, sourceName: s.name, tier: s.tier, beat: beatFor(s, url), lang: s.lang,
          published_at: toISO(it.date) || now.toISOString(),
          first_seen: now.toISOString(),
        });
        n++; added++;
        if (n >= (s.tier === 'aggregator' ? 15 : 40)) break;   // no single feed floods the ledger
      }
    } catch (e) {
      ok = false;
    }
    const prior = readJson(path.join(NEWSDIR, 'health.json'), {})[s.id] || {};
    health[s.id] = {
      name: s.name, last_run: now.toISOString(),
      last_success: ok ? now.toISOString() : (prior.last_success || null),
      new_items: n, consecutive_failures: ok ? 0 : (prior.consecutive_failures || 0) + 1,
    };
    console.log(`  ${ok ? '✓' : '✗'} ${s.id.padEnd(20)} +${n}`);
  }

  // merge GDELT wire (build-news.js output) into the ledger, if present
  const gdelt = readJson(path.join(ROOT, 'data', 'news.json'), null);
  if (gdelt && Array.isArray(gdelt.articles)) {
    for (const a of gdelt.articles) {
      const url = canonical(a.url); const id = idOf(url);
      if (seen.has(id)) continue; seen.add(id);
      const publisher = a.domain || domainOf(url);
      ledger.push({ id, url, title: a.title, dek: '', source: publisher, sourceName: publisher,
        tier: 1, beat: a.tag === 'trade' ? 'us-mexico' : (a.tag === 'markets' ? 'economy' : a.tag || 'politics'),
        lang: 'en', published_at: a.date || now.toISOString(), first_seen: now.toISOString() });
      added++;
    }
  }

  ledger.sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
  fs.writeFileSync(weekFile(thisWeek), JSON.stringify(ledger));

  // rolling 72h wire the site reads — shape mirrors the old news.json
  const cutoff = Date.now() - 72 * 3600 * 1000;
  const tagOf = REG.meta.beatToTag;
  const recent = [...ledger, ...prevLedger]
    .filter((x) => Date.parse(x.published_at) >= cutoff)
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
  const wireSeen = new Set(), perDom = {}; const articles = [];
  for (const x of recent) {
    if (wireSeen.has(x.id)) continue;
    if (x.source === 'news.google.com') continue;        // aggregator stays in the ledger, not the public wire
    if ((perDom[x.source] || 0) >= 6) continue;          // no single outlet floods the wire
    wireSeen.add(x.id); perDom[x.source] = (perDom[x.source] || 0) + 1;
    articles.push({ title: x.title, url: x.url, domain: x.source, date: x.published_at, tag: tagOf[x.beat] || 'economy', beat: x.beat, sourceName: x.sourceName });
  }
  const wire = {
    meta: { source: 'Multi-source RSS + GDELT', sourceUrl: 'https://mexicobrief.com/sources',
      note: 'Headlines from a trusted-source allowlist, last 72 hours, each linked to its origin and unsummarized.',
      cadence: 'continuous', fetchedAt: now.toISOString(), count: articles.length },
    articles: articles.slice(0, 60),
  };
  fs.writeFileSync(path.join(NEWSDIR, 'wire.json'), JSON.stringify(wire));
  fs.writeFileSync(path.join(NEWSDIR, 'health.json'), JSON.stringify(health, null, 2));

  const alive = Object.values(health).filter((h) => h.consecutive_failures === 0).length;
  console.log(`\nnews: +${added} new · ledger ${thisWeek} now ${ledger.length} · wire ${wire.articles.length} · ${alive}/${REG.sources.length} sources alive`);
}

main().catch((e) => { console.error('collect-news failed:', e.message); process.exit(1); });
