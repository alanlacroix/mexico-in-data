// translate-wire.mjs — put the wire into English.
//
// The curated lane already reads in English: build-happening rewrites every event it
// keeps. The per-section lists on the homepage do not go through that pass, they come
// straight off the wire, and most of the registered sources are Spanish-language trade
// and regional press. Measured 2026-08-02: 40 of the 60 headlines rendered under "This
// week" were Spanish, which is most of the reading surface Alan asked for.
//
// So this translates the headlines and deks that the homepage can actually show, and
// caches them by URL. A story is translated once, ever. Nothing else in the item is
// touched: the link, the outlet, the date and the ordering all stay as collected, and
// the Spanish original is kept beside the translation so the record is not lost.
//
// Fail-soft, like every other model touchpoint here: with no ANTHROPIC_API_KEY the cache
// simply does not grow. The English feed omits untranslated ES items; /es/ keeps the native copy.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askJSON, hasLLM, usage, models } from './lib/anthropic.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = path.join(ROOT, 'data', 'news');
const CACHE = path.join(NEWS, 'translations.json');

const BATCH = 20;          // headlines per call
const MAX_ITEMS = 200;     // ceiling per run, so a backlog cannot become a surprise bill
const WINDOW_DAYS = 8;

// Spanish function words that essentially never appear in an English headline. This is
// the fallback for a source with no registered language, NOT the primary test: the
// comment used to say a false positive was free ("returns the text unchanged"), and that
// was wrong. A false positive rewrites an English headline, which makes originalTitle
// differ from title, which makes _data/feed.js label the item lang:'ES' — and the Spanish
// edition then skips it as already-Spanish and prints English. One Spanish word in an
// English dek was enough to do it (InSight Crime, seen live 2026-08-03).
const SPANISH = /\b(de|del|la|las|el|los|una|para|con|por|que|su|sus|más|año|años|millones|desde|entre|sobre|tras|ante|hacia|según|mientras|pesos)\b/i;

// pipeline/news-sources.json declares a language for every registered source, and
// collect-news.js stamps it onto each ledger item. That declaration beats any guess made
// from the text, so an English source is never sent to the English translator.
const isSpanish = (item) => {
  const declared = String(item.lang || '').toLowerCase();
  if (declared === 'en') return false;
  if (declared === 'es') return true;
  return SPANISH.test(`${item.title} ${item.dek || ''}`);
};

const isoWeek = (dt) => {
  const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil((((d - ys) / 86400000) + 1) / 7)).padStart(2, '0')}`;
};

const readJSON = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};

const SYSTEM = [
  'You translate Mexican news headlines and standfirsts from Spanish into English.',
  'Rules, all of them hard:',
  '- Translate only. Never summarise, never sharpen, never add a fact that is not there.',
  '- Keep proper nouns as they are: Pemex, CFE, Banxico, Sheinbaum, Nuevo León, IEPS, SAT.',
  '- Keep every figure, unit and date exactly as written.',
  '- Plain newspaper English. No headline capitalisation, no exclamation marks, no questions.',
  '- If the text is already English, return it unchanged.',
  '- If a headline is promotional or empty of news, translate it anyway. Judgment is not your job.',
].join('\n');

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['i', 'title'],
        properties: {
          i: { type: 'integer' },
          title: { type: 'string' },
          dek: { type: 'string' },
        },
      },
    },
  },
};

async function main() {
  const now = new Date();
  const ledger = [
    ...readJSON(path.join(NEWS, `${isoWeek(now)}.json`), []),
    ...readJSON(path.join(NEWS, `${isoWeek(new Date(now.getTime() - 7 * 864e5))}.json`), []),
  ];

  const cache = readJSON(CACHE, {});
  const cutoff = now.getTime() - WINDOW_DAYS * 864e5;

  const pending = [];
  const seen = new Set();
  for (const item of ledger) {
    if (!item || !item.url || !item.title) continue;
    if (seen.has(item.url) || cache[item.url]) continue;
    if (item.source === 'news.google.com' || item.tier === 'aggregator') continue;
    const when = Date.parse(item.published_at);
    if (!Number.isFinite(when) || when < cutoff) continue;
    if (!isSpanish(item)) continue;
    seen.add(item.url);
    pending.push(item);
    if (pending.length >= MAX_ITEMS) break;
  }

  if (!pending.length) {
    console.log('translate-wire: nothing new to translate.');
    return;
  }
  if (!hasLLM()) {
    console.log(`translate-wire: ${pending.length} untranslated, but no ANTHROPIC_API_KEY — omitting them from EN and keeping them native on /es/.`);
    return;
  }

  let done = 0;
  for (let start = 0; start < pending.length; start += BATCH) {
    const batch = pending.slice(start, start + BATCH);
    const payload = batch.map((item, i) => ({ i, title: item.title, dek: (item.dek || '').slice(0, 300) }));
    const answer = await askJSON({
      system: SYSTEM,
      user: `Translate each item into English. Return one object per input index.\n\n${JSON.stringify(payload)}`,
      schema: SCHEMA,
      maxTokens: 4000,
      // Haiku, per the tier rule in lib/anthropic.js: this is literal translation of
      // a headline, it is mechanical, and a wrong one is visible on the page rather
      // than buried in a judgment. It was also the most expensive line in the
      // pipeline ($0.44 in a single refresh). A meaning-changing translation reaching
      // the page sends this job back to Sonnet permanently — accuracy outranks the
      // saving, and the wire is the surface where a bad translation is most visible.
      model: models.HAIKU,
      effort: 'low',           // literal translation; there is nothing to deliberate about
    });
    if (!answer || !Array.isArray(answer.items)) {
      console.warn(`  batch ${start / BATCH + 1}: no usable answer, leaving these as collected`);
      continue;
    }
    for (const row of answer.items) {
      const item = batch[row.i];
      if (!item || !row.title) continue;
      cache[item.url] = {
        title: String(row.title).trim(),
        dek: String(row.dek || '').trim(),
        originalTitle: item.title,
        translatedAt: new Date().toISOString().slice(0, 10),
      };
      done += 1;
    }
  }

  fs.writeFileSync(CACHE, `${JSON.stringify(cache, null, 1)}\n`);
  const { calls, costUSD, byModel } = usage();
  const tiers = Object.keys(byModel).join(', ') || 'none';
  console.log(`translate-wire: ${done} translated · ${Object.keys(cache).length} cached · ${calls} calls · ${tiers} · ~$${costUSD.toFixed(4)}`);
}

main().catch((error) => {
  // Never block a refresh over a translation. Each language surface fails closed.
  console.warn('translate-wire: skipped —', error.message);
});
