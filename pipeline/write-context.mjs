// write-context.mjs — the authored lines the feed cannot compute.
//
// Build review 01 (2026-08-02) named the root cause: the feed was rendering source
// strings and format templates where the design expects written copy. Two surfaces were
// still generated:
//
//   1. The "Where the economy stands" note. A format string can say "Prices rose 3.37%
//      over the year to June". It cannot say "still above the 3% the central bank aims
//      for, but cooler than May's 3.94%", which is the sentence that tells a reader what
//      to think.
//   2. Coming up. The calendar carries one description; the design wants a short human
//      title, a one-line WHAT it updates, and a one-line WHY a reader should care.
//
// This writes both against the real figures and caches them, keyed by the vintage they
// describe, so a line is written once per release and never rewritten for a build. It
// runs in the scheduled refresh and fails soft: with no ANTHROPIC_API_KEY the cache does
// not grow and the feed falls back to the deterministic factual line.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askJSON, hasLLM, usage } from './lib/anthropic.js';
import { TRUST, BAN } from './lib/voice.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const CACHE = path.join(DATA, 'context.json');

const read = (rel, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8')); }
  catch { return fallback; }
};
const series = (id) => (read(`series/${id}.json`, {}).data || [])
  .filter((row) => row && Number.isFinite(Number(row.value)));

const ECON = [
  { id: 'banxico-inflacion', name: 'Inflation', unit: '% a year', compare: 'the central bank aims for 3%' },
  { id: 'banxico-tasa-objetivo', name: 'Policy rate', unit: '%', compare: 'current inflation' },
  { id: 'banxico-igae', name: 'Economic activity', unit: '% a year', compare: 'the reading a month earlier' },
  { id: 'banxico-exports-total', name: 'Goods exports', unit: 'US$ millions a month', compare: 'the same month a year earlier' },
  { id: 'banxico-remesas', name: 'Remittances', unit: 'US$ millions a month', compare: 'the same month a year earlier' },
];

const NOTE_SYSTEM = [
  TRUST,
  BAN,
  'You write one sentence, at most two, for a reader who wants to know where an economic indicator stands.',
  'Hard rules:',
  '- Name both comparisons in words. Never write "pp". Never leave a percentage without saying what it is compared with.',
  '- Use only the figures given. Never introduce a number that is not in the input.',
  '- Say what the reading means for the reader, not that it is important.',
  '- Plain newspaper English, no headline capitalisation, no question marks.',
  'Good: "Prices are 3.37% higher than a year ago, still above the 3% the central bank aims for but cooler than May\'s 3.94%."',
  'Bad: "Inflation rose 0.37 pp above target."',
].join('\n\n');

const EVENT_SYSTEM = [
  TRUST,
  BAN,
  'You write three short pieces for a scheduled economic release or decision:',
  '- title: the human name for it, a few words. "Monetary-policy decision", not "Mexico\'s central bank monetary-policy decision (monthly)".',
  '- what: one line saying what it updates.',
  '- why: one line saying why a reader should care. This is the only line that is allowed to be a judgment, and it must be specific to this release rather than a generic statement that data matters.',
  'Use only what the input gives you. Never invent a figure, a forecast or a date.',
].join('\n\n');

const NOTE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'note'],
        properties: { id: { type: 'string' }, note: { type: 'string' } },
      },
    },
  },
};
const EVENT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['key', 'title', 'what', 'why'],
        properties: {
          key: { type: 'string' }, title: { type: 'string' },
          what: { type: 'string' }, why: { type: 'string' },
        },
      },
    },
  },
};

async function main() {
  const cache = read('context.json', { econ: {}, events: {} });
  cache.econ = cache.econ || {};
  cache.events = cache.events || {};

  // --- economy notes, keyed by the release they describe -------------------
  const econPending = [];
  for (const row of ECON) {
    const rows = series(row.id);
    const latest = rows.at(-1);
    if (!latest) continue;
    const key = `${row.id}:${latest.date}`;
    if (cache.econ[key]) continue;
    econPending.push({
      key,
      id: row.id,
      name: row.name,
      unit: row.unit,
      comparedWith: row.compare,
      latest: { date: latest.date, value: Number(latest.value) },
      monthBefore: rows.at(-2) ? { date: rows.at(-2).date, value: Number(rows.at(-2).value) } : null,
      yearEarlier: rows.at(-13) ? { date: rows.at(-13).date, value: Number(rows.at(-13).value) } : null,
      inflationNow: row.id === 'banxico-tasa-objetivo' && series('banxico-inflacion').at(-1)
        ? Number(series('banxico-inflacion').at(-1).value) : undefined,
    });
  }

  // --- calendar events ------------------------------------------------------
  const events = read('events.json', {});
  const upcoming = (Array.isArray(events) ? events : events.events || [])
    .filter((event) => event && event.date && (event.title || event.label))
    .filter((event) => event.date >= new Date().toISOString().slice(0, 10))
    .slice(0, 12);
  const eventPending = upcoming
    .map((event) => ({ key: `${event.date}:${String(event.label || event.title).slice(0, 60)}`, ...event }))
    .filter((event) => !cache.events[event.key]);

  if (!econPending.length && !eventPending.length) {
    console.log('write-context: nothing new to write.');
    return;
  }
  if (!hasLLM()) {
    console.log(`write-context: ${econPending.length} notes and ${eventPending.length} events unwritten, but no ANTHROPIC_API_KEY — the feed keeps its factual fallback.`);
    return;
  }

  if (econPending.length) {
    const answer = await askJSON({
      system: NOTE_SYSTEM,
      user: `Write one note per indicator. Return the id you were given.\n\n${JSON.stringify(econPending, null, 1)}`,
      schema: NOTE_SCHEMA,
      maxTokens: 2000,
    });
    for (const row of answer?.items || []) {
      const pending = econPending.find((item) => item.id === row.id);
      if (pending && row.note) cache.econ[pending.key] = { note: row.note.trim(), writtenAt: pending.latest.date };
    }
  }

  if (eventPending.length) {
    const answer = await askJSON({
      system: EVENT_SYSTEM,
      user: `Write a title, a what and a why for each. Return the key you were given.\n\n${JSON.stringify(
        eventPending.map((event) => ({ key: event.key, title: event.label || event.title, detail: event.mechanism || '', source: event.source })), null, 1,
      )}`,
      schema: EVENT_SCHEMA,
      maxTokens: 3000,
    });
    for (const row of answer?.items || []) {
      if (!row.key || !row.why) continue;
      cache.events[row.key] = { title: row.title?.trim(), what: row.what?.trim(), why: row.why.trim() };
    }
  }

  fs.writeFileSync(CACHE, `${JSON.stringify(cache, null, 1)}\n`);
  const { calls, costUSD } = usage();
  console.log(`write-context: ${Object.keys(cache.econ).length} notes · ${Object.keys(cache.events).length} events cached · ${calls} calls · ~$${costUSD.toFixed(4)}`);
}

main().catch((error) => {
  // A missing sentence never blocks a refresh. The feed falls back to the factual line.
  console.warn('write-context: skipped —', error.message);
});
