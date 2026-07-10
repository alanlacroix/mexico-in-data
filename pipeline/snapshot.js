// snapshot.js — the append-only RELEASE EVENT LOG: the memory the whole product
// stands on. Each run diffs every tracked series against the last-seen baseline and
// records an IMMUTABLE event for every real change — a new release (the reference
// period advanced) or a revision (the same period's value changed). The public
// "what changed" board and the private "since your last visit" radar both render
// from this one log. It CANNOT be backfilled — history starts the moment this ships.
// Deterministic, no LLM. Run by the refresh cron after the connectors write series.
//
//   node snapshot.js
//
// Writes:
//   data/releases.json        append-only { meta, events:[...] } — past events are never rewritten
//   data/releases-state.json  the current known value+period per series (the diff baseline)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const D = path.join(__dirname, '..', 'data');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const nowISO = new Date().toISOString();

// --- 1. the current state of every tracked series ---
const current = {};
const add = (id, o) => { if (id && o && o.value != null && Number.isFinite(+o.value)) current[id] = { ...o, value: +o.value }; };

const seriesDir = path.join(D, 'series');
if (fs.existsSync(seriesDir)) {
  for (const f of fs.readdirSync(seriesDir).filter((x) => x.endsWith('.json'))) {
    const j = readJson(path.join(seriesDir, f), null);
    const rows = j?.data;
    if (!Array.isArray(rows) || !rows.length) continue;
    const last = rows[rows.length - 1];
    if (last?.value == null) continue;
    const m = j.meta || {};
    add(m.id || f.replace(/\.json$/, ''), {
      value: last.value,
      period: last.date || m.vintage || null,
      metric: m.metric || null,
      title: m.title || null,
      units: m.units || null,
      cadence: m.cadence || null,
      source: m.source || null,
      sourceUrl: m.sourceUrl || null,
      published_at: m.publishedAt || null,   // the source's real publish date, once the connectors capture it (step 2)
      fetched_at: m.fetchedAt || null,        // when we fetched it (a floor on publish time until then)
    });
  }
}
// composite: US–Mexico two-way trade
const tj = readJson(path.join(D, 'trade-us.json'), null);
if (tj?.latest?.twoway_bn != null) add('us_mx_trade_twoway', {
  value: tj.latest.twoway_bn, period: tj.latest.month || null, metric: 'trade_twoway',
  title: 'US–Mexico two-way trade', units: 'US$ bn', cadence: 'monthly',
  source: tj.meta?.source || 'US Census Bureau', sourceUrl: tj.meta?.sourceUrl || null,
  published_at: null, fetched_at: tj.meta?.fetchedAt || null,
});

// --- 2. diff against the last-seen baseline → new immutable events ---
const prev = readJson(path.join(D, 'releases-state.json'), {});
const seeded = Object.keys(prev).length > 0;   // false on the very first run
const log = readJson(path.join(D, 'releases.json'), {
  meta: { note: 'Append-only log of every detected change in an official series — a new release (period advanced) or a revision (same period, value changed). Immutable; the memory the "what changed" board and the private radar render from. Cannot be backfilled.' },
  events: [],
});

const events = [];
for (const [id, c] of Object.entries(current)) {
  const p = prev[id];
  if (!p) continue;                                   // first sighting of this series → seed silently, no event
  const periodAdvanced = c.period && p.period && String(c.period) > String(p.period);
  const valueRevised = String(c.period) === String(p.period) && +c.value !== +p.value;
  if (!periodAdvanced && !valueRevised) continue;
  events.push({
    series: id, metric: c.metric, title: c.title,
    kind: periodAdvanced ? 'release' : 'revision',
    prev_value: p.value, prev_period: p.period,
    value: c.value, period: c.period,
    change: Number.isFinite(+c.value) && Number.isFinite(+p.value) ? +(c.value - p.value).toFixed(4) : null,
    units: c.units, cadence: c.cadence,
    published_at: c.published_at, fetched_at: c.fetched_at,
    detected_at: nowISO,
    source: c.source, sourceUrl: c.sourceUrl,
  });
}

if (events.length) log.events.push(...events);

// --- 3. write the log (always, so it exists after the seed run) + the baseline ---
fs.mkdirSync(D, { recursive: true });
fs.writeFileSync(path.join(D, 'releases.json'), JSON.stringify(log));
fs.writeFileSync(path.join(D, 'releases-state.json'), JSON.stringify(current));

console.log(`releases: ${events.length} new event(s)${seeded ? '' : ' (first run — baseline seeded, no events)'} · ${Object.keys(current).length} series tracked · log total ${log.events.length}`);
