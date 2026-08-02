// write-why.mjs — the explanation that lets a wire story onto the page.
//
// The contract this site publishes under is that an item earns its place by having
// something written about it. The curated lane writes that for ~37 events a week, and
// they skew to economy and US & Mexico, which is why "This week" collapsed to two topics
// once the rule was enforced. The answer is to fill the pipeline, not to thin the
// standard (Fable, 2026-08-02): this writes a why and a watch for the few stories per
// section that are worth one.
//
// Guard rails, because a confidently invented explanation is worse than the empty
// section it replaced:
//   - It writes from the fullest text collected, never from a headline alone.
//   - It may only say what the input supports, and may not introduce a figure that is
//     not in the source text.
//   - It is told to skip an item whose input is too thin. A skipped card costs a slot;
//     an invented why costs the premise.
// Every authored line is cached with the input it was written from, so a wrong one can
// be traced back to what produced it.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { askJSON, hasLLM, usage } from './lib/anthropic.js';
import { TRUST, BAN } from './lib/voice.js';

// The work list comes from the page itself. This file used to run its own scan of the
// ledger with its own routing, dedup and ordering, which quietly disagreed with the one
// _data/weeklyTop.js runs to build "This week": on 2026-08-02 it wrote 33 explanations,
// 19 of them for stories the page never lists, while 23 listed stories got none. Asking
// weeklyTop which stories it is about to render is the only way the join can hold.
const requireCJS = createRequire(import.meta.url);
const weeklyTop = requireCJS('../_data/weeklyTop.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = path.join(ROOT, 'data', 'news');
const CACHE = path.join(NEWS, 'why.json');

const PER_SECTION = 6;      // a full section's worth; This week is written to carry 3 to 6
const POOL = 12;            // candidates offered to the ranking pass per section
const WINDOW_DAYS = 7;
const MIN_INPUT = 90;       // characters of real text below which we do not even ask

// The seven rooms, for labelling the ranking prompt only. Routing an item into a room is
// weeklyTop's job now; keeping a second copy of the match rules here is what let the two
// disagree in the first place.
const SECTIONS = [
  { key: 'payments', label: 'Payments & fintech' },
  { key: 'deals', label: 'Deals & investment' },
  { key: 'economy', label: 'Economy & money' },
  { key: 'usmexico', label: 'US & Mexico' },
  { key: 'politics', label: 'Politics' },
  { key: 'society', label: 'Security & society' },
  { key: 'energy', label: 'Energy & infrastructure' },
];
const OFFICIAL = /(^|\.)gob\.mx$|^pemex\.com$|^diariooficial\.gob\.mx$|^blog\.amvo\.org\.mx$/;
const TIER_W = { 1: 3, specialist: 3, 2: 2 };

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
const words = (t) => new Set(String(t).toLowerCase().replace(/[^a-z0-9áéíóúñü]+/g, ' ').split(' ').filter((w) => w.length > 3));
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; for (const w of a) if (b.has(w)) i++; return i / (a.size + b.size - i); };

const RANK_SYSTEM = [
  'You rank Mexican business and policy headlines by consequence for a reader who follows the economy,',
  'policy and security: what moves money, rules or outcomes. A company milestone, an award, a product',
  'launch, a conference or a human-interest piece is low consequence however large the outlet.',
  'Return the ids in order, most consequential first. Do not invent ids.',
].join(' ');

const WHY_SYSTEM = [
  TRUST,
  BAN,
  'For each story you are given a headline and whatever description was collected with it.',
  'Write two things, a why and a watch.',
  // Length law (Fable, 2026-08-02): length is a claim about stakes, so make it true. The
  // curated lane gets the same principle as prose in BRIEF-RUBRIC.md; here it is sentence
  // arity, because arity is the shape's grammar and a model with no human in the loop needs
  // it. Sentences are units of claims. Words are units of ink, and Alan is not counting ink.
  'Length:',
  '- why: verdict first, then the single mechanism that carries it. One sentence if the story',
  '  is routine; two at most, and only when the second adds a magnitude or consequence the',
  '  summary does not contain. If the story matters less than the headline suggests, say so',
  '  and stop. That is a complete why.',
  '- watch: exactly one observable, in one sentence, with the date, data release or event that',
  '  will reveal it when the given text names one. Never invent a date to satisfy this.',
  '- Never restate a number or fact already visible in the headline or summary. Every sentence',
  '  must add something new: a fact, a mechanism, or a magnitude.',
  '- Do not hedge to fill space. The shortest honest why beats a padded one.',
  'Hard limits, they win over completeness:',
  '- Say only what the given text supports. You may not add a figure, a date, a name or a',
  '  consequence that is not in it.',
  '- If the input is too thin to support a real explanation, set skip to true and leave',
  '  why and watch empty. A missing card is fine. A confident invention is not.',
  '- Plain newspaper English. No headline capitalisation, no questions, no hype.',
].join('\n\n');

const RANK_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['order'],
  properties: { order: { type: 'array', items: { type: 'string' } } },
};
const WHY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'skip'],
        properties: {
          id: { type: 'string' }, skip: { type: 'boolean' },
          why: { type: 'string' }, watch: { type: 'string' },
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
  const translations = readJSON(path.join(NEWS, 'translations.json'), {});
  const cache = readJSON(CACHE, {});
  const cutoff = now.getTime() - WINDOW_DAYS * 864e5;

  // The ledger is still the source of the fullest text we hold for a story: weeklyTop
  // trims its dek for display, and the guard rail is that an explanation is written from
  // the fullest collected text, never from a headline alone.
  const fullest = new Map();
  for (const raw of ledger) {
    if (!raw || !raw.url || !raw.title) continue;
    const when = Date.parse(raw.published_at);
    if (!Number.isFinite(when) || when < cutoff) continue;
    const english = translations[raw.url];
    const text = english?.dek || raw.dek || '';
    const prior = fullest.get(raw.url);
    if (prior && String(prior.dek).length >= String(text).length) continue;
    fullest.set(raw.url, {
      url: raw.url,
      title: english?.title || raw.title,
      dek: text,
      source: raw.sourceName || raw.source,
      tier: raw.tier,
      published: raw.published_at,
    });
  }

  // Which stories the page is about to render, in the sections it will render them under.
  const bySection = new Map();
  const seen = [];
  for (const group of weeklyTop().groups) {
    for (const listed of group.items) {
      if (!listed || !listed.url || listed.shownToday) continue;
      if (listed.view || listed.bg) continue;              // already explained, curated or cached
      if (OFFICIAL.test(String(listed.sourceName || ''))) continue;
      const item = fullest.get(listed.url) || {
        url: listed.url,
        title: listed.title,
        dek: listed.dek || '',
        source: listed.sourceName,
        tier: listed.tier,
        published: listed.date,
      };
      if (seen.some((k) => jaccard(words(k), words(item.title)) >= 0.5)) continue;
      seen.push(item.title);
      if (!bySection.has(group.key)) bySection.set(group.key, []);
      bySection.get(group.key).push(item);
    }
  }

  const pending = [];
  for (const [key, items] of bySection) {
    const ranked = items
      .filter((item) => !cache[item.url])
      .filter((item) => `${item.title} ${item.dek}`.trim().length >= MIN_INPUT)
      .sort((a, b) => (TIER_W[b.tier] || 1) - (TIER_W[a.tier] || 1) || String(b.published).localeCompare(String(a.published)))
      .slice(0, POOL);
    if (!ranked.length) continue;
    let order = ranked.map((item) => item.url);
    if (hasLLM() && ranked.length > PER_SECTION) {
      const answer = await askJSON({
        system: RANK_SYSTEM,
        user: `Section: ${(SECTIONS.find((s) => s.key === key) || { label: key }).label}\n\n${JSON.stringify(
          ranked.map((item) => ({ id: item.url, title: item.title, dek: item.dek.slice(0, 200) })), null, 1)}`,
        schema: RANK_SCHEMA,
        maxTokens: 1200,
      });
      // Fall back to tier-then-recency if the ranking pass errors, so this never blocks.
      if (answer?.order?.length) order = answer.order.filter((id) => ranked.some((item) => item.url === id));
    }
    for (const id of order.slice(0, PER_SECTION)) {
      const item = ranked.find((candidate) => candidate.url === id);
      if (item) pending.push({ ...item, section: key });
    }
  }

  if (!pending.length) { console.log('write-why: nothing new to explain.'); return; }
  if (!hasLLM()) {
    console.log(`write-why: ${pending.length} stories are waiting on an explanation, but no ANTHROPIC_API_KEY — This week renders only what is already explained.`);
    return;
  }

  let written = 0, skipped = 0;
  for (let start = 0; start < pending.length; start += 8) {
    const batch = pending.slice(start, start + 8);
    const answer = await askJSON({
      system: WHY_SYSTEM,
      user: `Explain each story, or skip it.\n\n${JSON.stringify(
        batch.map((item) => ({ id: item.url, title: item.title, text: item.dek.slice(0, 700), source: item.source })), null, 1)}`,
      schema: WHY_SCHEMA,
      maxTokens: 3000,
    });
    for (const row of answer?.items || []) {
      const item = batch.find((candidate) => candidate.url === row.id);
      if (!item) continue;
      if (row.skip || !row.why) { skipped += 1; continue; }
      cache[item.url] = {
        why: row.why.trim(),
        watch: (row.watch || '').trim(),
        section: item.section,
        // Kept so a wrong explanation can be traced to the text it was written from.
        writtenFrom: { title: item.title, text: item.dek.slice(0, 700), source: item.source },
        writtenAt: new Date().toISOString().slice(0, 10),
      };
      written += 1;
    }
  }

  fs.writeFileSync(CACHE, `${JSON.stringify(cache, null, 1)}\n`);
  const { calls, costUSD } = usage();
  console.log(`write-why: ${written} explained · ${skipped} skipped as too thin · ${Object.keys(cache).length} cached · ${calls} calls · ~$${costUSD.toFixed(4)}`);
}

main().catch((error) => {
  console.warn('write-why: skipped —', error.message);
});
