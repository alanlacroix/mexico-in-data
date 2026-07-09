// build-news.js — compile the latest Mexico economy/politics news from the
// GDELT DOC 2.0 API (free, no token, ~15-min global news index). We store only
// headline + source domain + date + link — real, sourced, dated. No LLM, no
// summary, no fabrication (nada se inventa). Writes data/news.json.
//
//   node build-news.js
//
// GDELT is IP rate-limited (429 under load); lib/http retries with backoff.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJson } from './lib/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data', 'news.json');

// English-language coverage of Mexico's economy + politics. GDELT rate-limits
// (429) aggressively on long boolean queries, so we keep it lean and let the
// scheduled cron absorb transient throttling.
// In GDELT, a space is AND: require "Mexico" AND one economy/politics term.
const QUERY =
  'Mexico (economy OR peso OR Banxico OR Sheinbaum OR nearshoring OR ' +
  'USMCA OR tariff OR inflation OR remittances) sourcelang:english';

const URL =
  'https://api.gdeltproject.org/api/v2/doc/doc' +
  `?query=${encodeURIComponent(QUERY)}` +
  '&mode=artlist&format=json&maxrecords=120&sort=datedesc&timespan=14d';

// A second guard against off-topic bleed-through: the headline must mention
// Mexico (the country) or a Mexico-specific entity — and must NOT be a known
// false positive. Bare "peso" is dropped (Colombian/Argentine/Chilean/Philippine
// pesos leaked in); "New Mexico" (the US state) is excluded explicitly.
const RELEVANT = /\bmexic|banxico|sheinbaum|\bpemex\b|\bmorena\b|\bamlo\b|nearshor|usmca|claudia sheinbaum/i;
const EXCLUDE  = /new mexico/i;
const isRelevant = (t) => RELEVANT.test(t) && !EXCLUDE.test(t);

// Curated allow-list of trusted outlets — a headline wire is only as credible as
// its sources. Wire agencies, majors, financial press, ratings, and reputable
// Mexico-focused English outlets. Everything else is dropped (no random blogs).
const TRUSTED = new Set([
  'reuters.com','apnews.com','bloomberg.com','ft.com','wsj.com','economist.com',
  'nytimes.com','washingtonpost.com','theguardian.com','bbc.com','bbc.co.uk',
  'cnbc.com','marketwatch.com','forbes.com','fortune.com','barrons.com','axios.com',
  'politico.com','foreignpolicy.com','americasquarterly.org','as-coa.org','csis.org',
  'brookings.edu','piie.com','imf.org','worldbank.org','oecd.org',
  'mexiconewsdaily.com','mexicobusiness.news','bnamericas.com','latinfinance.com',
  'spglobal.com','fitchratings.com','moodys.com','aljazeera.com','france24.com',
  'dw.com','cnn.com','npr.org','pbs.org','time.com','thehill.com','elpais.com',
]);
function domainTrusted(d) {
  d = (d || '').toLowerCase().replace(/^www\./, '');
  if (TRUSTED.has(d)) return true;
  for (const t of TRUSTED) if (d === t || d.endsWith('.' + t)) return true;
  return false;
}

// "20260709T113000Z" -> ISO
function seenToIso(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(s));
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

// Basic quality/tag hints so the UI can group without an LLM.
function tagOf(title) {
  const t = (title || '').toLowerCase();
  if (/sheinbaum|morena|senate|congress|election|president|political|reform/.test(t)) return 'politics';
  if (/peso|inflation|banxico|rate|gdp|growth|remittanc|fitch|moody|s&p|bond/.test(t)) return 'markets';
  if (/tariff|usmca|trade|export|nearshor|investment|fdi|factory|plant/.test(t)) return 'trade';
  return 'economy';
}

// GDELT's endpoint frequently drops node's fetch (undici) mid-handshake but
// answers curl fine. Try the shared http client first; fall back to curl.
async function fetchGdelt() {
  try {
    return await getJson(URL);
  } catch (e) {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync('curl', [
      '-s', '--compressed', '--max-time', '40',
      '-A', 'Mozilla/5.0 (mexico-in-data news builder)', URL,
    ], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    return JSON.parse(out);
  }
}

// Low-quality / hyperlocal / propaganda domains never make the wire, even as fill.
const JUNK = /aginfo|farm|fox\d|houston|abc\d|nbc\d|cbs\d|patch\.com|\.tv$|dailymail|breitbart|infowars|zerohedge|\brt\.com|sputnik|newsbreak|msn\.com|yahoo\.com|prnewswire|businesswire|globenewswire|presswire|newswire|cecildaily|dailytimes|\bstar\.com|mexicostar/i;

async function main() {
  const raw = await fetchGdelt();
  const arts = Array.isArray(raw?.articles) ? raw.articles : [];
  const seen = new Set();
  const trusted = [], backup = [];
  for (const a of arts) {
    if (!a.url || !a.title) continue;
    if (!isRelevant(a.title)) continue;   // must be about Mexico
    const domain = (a.domain || (a.url.match(/^https?:\/\/([^/]+)/) || [])[1] || '').replace(/^www\./, '');
    const key = (a.title || '').toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;          // crude title dedupe
    seen.add(key);
    const item = { title: a.title.trim(), url: a.url, domain, date: seenToIso(a.seendate), tag: tagOf(a.title) };
    if (domainTrusted(domain)) trusted.push(item);
    else if (!JUNK.test(domain)) backup.push(item);   // reputable-enough fill, never junk
  }
  // Prefer the trusted allow-list; only fall back to non-junk sources if the wire would be thin.
  let items = trusted.slice(0, 20);
  if (items.length < 6) items = items.concat(backup.slice(0, 8 - items.length));
  if (!items.length) throw new Error('GDELT returned no usable articles');

  const out = {
    meta: {
      source: 'GDELT Project',
      sourceUrl: 'https://www.gdeltproject.org/',
      note: 'Titulares indexados por GDELT (fuentes en inglés). Cada nota enlaza a su fuente original; encabezados sin resumir.',
      query: QUERY,
      cadence: 'continuous',
      fetchedAt: new Date().toISOString(),
      count: items.length,
    },
    articles: items,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`news -> data/news.json  (${items.length} articles, newest ${items[0].date})`);
  for (const it of items.slice(0, 5)) console.log(`  · [${it.tag}] ${it.title.slice(0, 70)}  (${it.domain})`);
}

main().catch((e) => { console.error('news build failed:', e.message); process.exit(1); });
