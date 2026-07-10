// build-tariffs.js — the Tariff & USMCA Watch feed. Compiles US federal actions
// that set or change what the United States charges on imports from Mexico, from
// the Federal Register API (free, no token, the official record of US executive
// action). We store only the primary document: title, type, agency, date, the
// official link, and the government's own abstract. No LLM, no summary, no
// fabrication (nada se inventa). Writes data/tariffs.json.
//
//   node build-tariffs.js
//
// Why this exists: US tariff and trade policy is the single biggest story about
// Mexico right now, and it was the Brief's largest blind spot. Every item here is
// a primary source document, dated, and one tap from federalregister.gov.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJson } from './lib/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data', 'tariffs.json');

// Look back ~18 months so a full policy cycle is visible without unbounded growth.
const SINCE = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 18);
  return d.toISOString().slice(0, 10);
})();

const BASE = 'https://www.federalregister.gov/api/v1/documents.json';
const q = (params) => {
  const parts = [];
  for (const [k, v] of params) parts.push(`${k}=${encodeURIComponent(v)}`);
  return `${BASE}?${parts.join('&')}`;
};

// Two nets, merged and de-duped:
//  Q1 — Presidential documents (proclamations, executive orders) ranked on
//       "Mexico tariff". This is where the headline tariff actions live.
//  Q2 — All document types ranked on Mexico + trade-action terms, to catch the
//       USTR / Commerce / USITC notices and rules that implement them.
const Q1 = q([
  ['conditions[term]', 'Mexico tariff'],
  ['conditions[type][]', 'PRESDOCU'],
  ['conditions[publication_date][gte]', SINCE],
  ['order', 'newest'],
  ['per_page', '40'],
]);
const Q2 = q([
  ['conditions[term]', 'Mexico tariff duties USMCA'],
  ['conditions[publication_date][gte]', SINCE],
  ['order', 'newest'],
  ['per_page', '60'],
]);

// A document makes the feed only if it is actually about a US charge/rule on
// trade (the title or the government's abstract must say so).
const TARIFF = /tariff|\bduty\b|duties|section\s?30[12]|section\s?232|USMCA|T-MEC|import surcharge|antidumping|countervailing|rules of origin|imports of|trade agreement|de minimis/i;
// Obvious non-trade uses of "Mexico" (place names, unrelated dockets) never qualify.
const EXCLUDE = /flood hazard|gulf of mexico|new mexico\b|drug transit|migratory bird|fishery|agency information collection|paperwork reduction|combined notice of filings|sunshine act meeting|privacy act/i;

function tagOf(text) {
  const t = (text || '').toLowerCase();
  if (/section\s?232|steel|aluminum|copper|imports of (medium|aluminum|steel|copper|automobiles|vehicles)/.test(t)) return 'section-232';
  if (/section\s?301/.test(t)) return 'section-301';
  if (/usmca|t-mec|rules of origin|trade agreement/.test(t)) return 'usmca';
  if (/antidumping|countervailing/.test(t)) return 'ad-cvd';
  if (/surcharge|de minimis/.test(t)) return 'tariff';
  return 'tariff';
}

// Federal Register occasionally drops node's fetch mid-handshake; curl fallback,
// same pattern as the news builder.
async function fetchFR(url) {
  try {
    return await getJson(url);
  } catch (e) {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync('curl', [
      '-s', '--compressed', '--max-time', '40',
      '-A', 'Mozilla/5.0 (mexico-brief tariff watch)', url,
    ], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    return JSON.parse(out);
  }
}

function agencyOf(r) {
  const a = (r.agencies || []).map((x) => x && (x.name || x.raw_name)).filter(Boolean);
  return a[0] || 'U.S. federal government';
}

async function main() {
  const [r1, r2] = await Promise.all([fetchFR(Q1), fetchFR(Q2)]);
  const rows = [...(r1.results || []), ...(r2.results || [])];

  const seen = new Set();
  const items = [];
  for (const r of rows) {
    const num = r.document_number;
    if (!num || seen.has(num)) continue;
    const hay = `${r.title || ''} ${r.abstract || ''}`;
    if (!TARIFF.test(hay)) continue;
    if (EXCLUDE.test(hay)) continue;
    seen.add(num);
    items.push({
      title: (r.title || '').trim(),
      type: r.type || 'Document',
      agency: agencyOf(r),
      date: r.publication_date || null,
      url: r.html_url || null,
      abstract: r.abstract ? r.abstract.trim().slice(0, 320) : '',
      tag: tagOf(hay),
      documentNumber: num,
    });
  }
  items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const top = items.slice(0, 24);
  if (!top.length) throw new Error('Federal Register returned no usable tariff documents');

  const out = {
    meta: {
      source: 'U.S. Federal Register',
      sourceUrl: 'https://www.federalregister.gov/',
      note: 'US federal actions that set or change what the United States charges on imports from Mexico. Each item is a primary government document; titles and abstracts are the government’s own words, unsummarized.',
      cadence: 'as-published',
      window: `since ${SINCE}`,
      fetchedAt: new Date().toISOString(),
      count: top.length,
    },
    documents: top,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`tariffs -> data/tariffs.json  (${top.length} documents, newest ${top[0].date})`);
  for (const it of top.slice(0, 6)) console.log(`  · [${it.tag}] ${it.date}  ${it.title.slice(0, 66)}`);
}

main().catch((e) => { console.error('tariff build failed:', e.message); process.exit(1); });
