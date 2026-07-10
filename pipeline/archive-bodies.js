// archive-bodies.js — the capture step. Runs on the data cron (every 6h). For every
// item in the recent news ledger, it makes sure the item's metadata and its raw
// article text are in the capture store before the link rots. This is the one thing
// the pipeline cannot do later: a headline saved today whose body we skip is gone in
// a few months when the URL 404s or goes behind a paywall.
//
//   node archive-bodies.js
//
// Fail-soft: with no SUPABASE_URL + SUPABASE_SERVICE_KEY it prints a note and exits
// 0. Bodies are private (internal derivation only), never republished.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchArticle } from './lib/fetch-article.js';
import { hasStore, upsertItems, upsertBodies, existingBodyIds } from './lib/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NEWSDIR = path.join(__dirname, '..', 'data', 'news');
const MAX_FETCH = 200;   // cap bodies fetched per run so an Action never runs long

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
function isoWeek(dt) {
  const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return d.getUTCFullYear() + '-W' + String(Math.ceil((((d - ys) / 864e5) + 1) / 7)).padStart(2, '0');
}
const itemRow = (x) => ({
  id: x.id, url: x.url, source: x.source, source_name: x.sourceName, tier: String(x.tier ?? ''),
  beat: x.beat, lang: x.lang, title: x.title, dek: x.dek,
  published_at: x.published_at || null, first_seen: x.first_seen || null,
});

async function main() {
  if (!hasStore()) { console.log('archive-bodies: no SUPABASE_URL/SUPABASE_SERVICE_KEY — skipping capture (pipeline unaffected).'); return; }

  const now = new Date();
  const weeks = [isoWeek(now), isoWeek(new Date(now.getTime() - 7 * 864e5))];
  const byId = new Map();
  for (const w of weeks) for (const x of readJson(path.join(NEWSDIR, w + '.json'), [])) if (x && x.id && x.url) byId.set(x.id, x);
  const items = [...byId.values()];
  if (!items.length) { console.log('archive-bodies: no ledger items found.'); return; }

  // 1. make sure every item's metadata is captured (idempotent upsert)
  await upsertItems(items.map(itemRow));

  // 2. fetch + store bodies only for items we don't already have
  const have = await existingBodyIds(items.map((x) => x.id));
  const todo = items.filter((x) => !have.has(x.id)).slice(0, MAX_FETCH);
  console.log(`archive-bodies: ${items.length} items · ${have.size} already captured · fetching ${todo.length}`);

  const bodies = [];
  let ok = 0;
  for (const x of todo) {
    const { ok: got, text } = await fetchArticle(x.url);
    bodies.push({ item_id: x.id, body: got ? text.slice(0, 200000) : '', char_count: text.length, ok: got });
    if (got) ok++;
    if (bodies.length >= 20) { await upsertBodies(bodies.splice(0)); }   // flush in chunks
  }
  if (bodies.length) await upsertBodies(bodies);

  console.log(`archive-bodies: captured ${ok}/${todo.length} bodies (${todo.length - ok} thin/failed, recorded so we don't retry).`);
}

main().catch((e) => { console.error('archive-bodies failed:', e.message); process.exit(1); });
