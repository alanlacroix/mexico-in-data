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
// charset: DOF serves ISO-8859-1; decoding it as UTF-8 mangles every accent, so
// sources may declare `charset` and we decode the raw bytes accordingly.
async function fetchText(url, charset) {
  const decode = (buf) => charset ? new TextDecoder(charset === 'latin1' ? 'iso-8859-1' : charset).decode(buf) : new TextDecoder().decode(buf);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*' },
      redirect: 'follow', signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return decode(await r.arrayBuffer());
  } catch (e) {
    const { execFileSync } = await import('node:child_process');
    return decode(execFileSync('curl', ['-sL', '--compressed', '--max-time', '25', '-A', UA, url], { maxBuffer: 32 * 1024 * 1024 }));
  }
}

// ---- minimal RSS/Atom parsing (zero-dep) ----
const stripCdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ');
const NAMED_ENTITIES = { aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü', iquest: '¿', iexcl: '¡', laquo: '«', raquo: '»', deg: '°', ordm: 'º', ordf: 'ª', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', ndash: '–', mdash: '—', hellip: '…' };
const decodeOnce = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&nbsp;/g, ' ')
  .replace(/&([A-Za-z]+);/g, (m, name) => NAMED_ENTITIES[name] || m);
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
// WordPress feeds append "The post X appeared first on Y" / "El artículo X apareció
// primero en Y" to descriptions; that is feed plumbing, not a dek.
const stripFeedBoilerplate = (s) => String(s || '').replace(/\s*(The post |El art[ií]culo |La entrada ).*$/i, '').trim();
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
    const dek = stripFeedBoilerplate(clean(pick(b, 'description') || pick(b, 'summary') || pick(b, 'content'))).slice(0, 320);
    const date = clean(pick(b, 'pubDate') || pick(b, 'published') || pick(b, 'updated') || pick(b, 'dc:date'));
    if (title && link) items.push({ title, link, dek, date });
  }
  return items;
}

// Mexico Business News does not publish a usable RSS feed, but its public
// Drupal JSON:API exposes the same article metadata. Keep this adapter small:
// headline, direct article URL, summary and publication date only.
//
// Provenance is the whole game here. The site files expert-contributor columns,
// press releases and weekly roundups under the SAME /news/ path as reported
// journalism, so the URL tells us nothing — filtering on it let a vendor op-ed
// onto the front page (an HR platform's executive writing up the 40-hour reform,
// with his own headshot as the story image). field_document_type is the honest
// signal. Take only originally-reported work: an expert column is a company
// promoting itself and a press release is a company quoting itself, and neither
// belongs in a ledger of what happened. Roundups are aggregations of stories we
// already carry, so they only duplicate.
const REPORTED_TYPES = new Set(['article', 'analysis']);
function parseJsonApi(text, baseUrl) {
  const json = JSON.parse(text);
  return (Array.isArray(json.data) ? json.data : []).flatMap((node) => {
    const a = node && node.attributes;
    const alias = a && a.path && a.path.alias;
    if (!a || !a.title || !alias) return [];
    if (!REPORTED_TYPES.has(String(a.field_document_type || ''))) return [];
    const link = new URL(alias, baseUrl).toString();
    const dek = clean((a.body && (a.body.summary || a.body.value)) || '').slice(0, 320);
    return [{ title: clean(a.title), link, dek, date: a.created || a.changed || '' }];
  });
}

// DOF sumario.xml — the official gazette's own feed, but shaped like no other:
// <title> is the issuing department in ALL CAPS, the actual act lives in
// <description>, there is no pubDate (the date rides in the link's fecha= param),
// and the charset is ISO-8859-1 (handled at fetch). The gazette prints every
// convenio and aviso; a reader-facing ledger only wants acts that change rules
// or money, so a documented allowlist keeps decrees, laws, reforms, tariffs and
// financial-regulator acts and drops routine administrative notices.
// Keep: acts that change rules or money (decrees, laws, reforms, tariffs/quotas,
// numbered regulatory circulars like Banxico's "Circular 8/2026", disposiciones de
// carácter general, financial-regulator and trade/FDI acts, minimum-wage rulings).
// Drop even when a keeper pattern matches: the gazette's daily administrative
// prints (FX fixing, TIIE, UDIs — the data board already carries those), routine
// procurement notices, property desincorporación transfers, and fishing vedas.
const DOF_SIGNIFICANT = /\bdecretos?\b|\bley(es)?\b|reforma|arancel|\bcupos?\b|circular\s*(n[uú]m\.?\s*)?\d|disposiciones de car[aá]cter general|comisi[oó]n nacional bancaria|\bcnbv\b|comercio exterior|inversi[oó]n extranjera|salarios? m[ií]nimos?/i;
const DOF_ROUTINE = /tipo de cambio para solventar|tasas? de inter[eé]s interbancari|unidad(es)? de inversi[oó]n|se comunica a las dependencias|desincorpora del r[eé]gimen|veda temporal|ingresos, egresos, saldos/i;
function parseDof(xml) {
  const items = [];
  for (const b of xml.match(/<item\b[\s\S]*?<\/item>/gi) || []) {
    const dept = clean(pick(b, 'title'));
    const desc = clean(pick(b, 'description'));
    const link = clean(pick(b, 'link'));
    if (!desc || !link) continue;
    if (DOF_ROUTINE.test(desc) || !DOF_SIGNIFICANT.test(dept + ' ' + desc)) continue;
    const m = link.match(/fecha=(\d{2})\/(\d{2})\/(\d{4})/);
    const date = m ? `${m[3]}-${m[2]}-${m[1]}T12:00:00Z` : '';
    const cut = desc.length > 200 ? desc.slice(0, 200).replace(/\s+\S*$/, '') + '…' : desc;
    items.push({ title: cut, link, dek: 'DOF · ' + dept, date });
  }
  return items;
}

// Pemex's SharePoint feed titles items with an internal slug ("2026_69_nacional");
// the real headline rides in the description as "Title: … Article Date: …".
function fixPemex(it) {
  if (!/^\d{4}_\d+_/.test(it.title)) return it;
  const m = it.dek.match(/Title:\s*(.+?)\s*(Article Date:|$)/i);
  return m ? { ...it, title: m[1], dek: '' } : it;
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
      const xml = await fetchText(s.url, s.charset);
      let items = s.format === 'jsonapi' ? parseJsonApi(xml, s.baseUrl || s.url)
        : s.format === 'dof' ? parseDof(xml)
        : parseFeed(xml);
      if (s.id === 'pemex-nacionales') items = items.map(fixPemex);
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
