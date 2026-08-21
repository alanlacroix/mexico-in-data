// Reconcile the official calendar with the curated event log.
//
// Calendar rows are only editorial obligations when they opt in with a stable `id`
// and `outcomeRequired: true`. The linker in build-happening stamps the matching
// curated outcome with `scheduledEventId`; this step never infers that an unchanged
// daily series proves a meeting happened. On the event day an unresolved outcome is
// pending. On the following editorial day it is missing and blocks certification until
// the event is linked, postponed, cancelled, or explicitly changed in the calendar.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import expectedOutcomes from './lib/expected-outcomes.cjs';
import newsDay from './lib/news-day.cjs';

const { reconcileExpectedOutcomes } = expectedOutcomes;
const { editorialDay } = newsDay;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const OUT = process.env.EVENT_STATUS_OUT || path.join(DATA, 'event-status.json');
const read = (name, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); }
  catch { return fallback; }
};

const now = process.env.EDITORIAL_NOW ? new Date(process.env.EDITORIAL_NOW) : new Date();
if (!Number.isFinite(now.getTime())) throw new Error('EDITORIAL_NOW is not a valid date');
const editorialDate = process.env.EDITORIAL_DATE || editorialDay(now);
const schedule = read('events.json', { events: [] });
const priorStatus = read('event-status.json', { outcomes: [] });
const result = reconcileExpectedOutcomes({
  schedule,
  events: read('happening.json', { events: [] }),
  priorOutcomes: priorStatus.outcomes,
  editorialDate,
});

const outcomes = result.items.map((item) => ({
  id: item.id,
  date: item.date,
  label: item.label,
  status: item.status,
  outcomeRequired: item.outcomeRequired,
  required: item.required,
  requiredForBrief: item.matchedEvent
    ? item.matchedEvent.requiredForBrief === true
    : schedule.events?.find((event) => event.id === item.id)?.requiredForBrief === true,
  importanceFloor: Number(item.matchedEvent?.scheduledImportanceFloor
    || schedule.events?.find((event) => event.id === item.id)?.importanceFloor) || 0,
  hardBlock: item.hardBlock,
  matchedEventId: item.matchedEvent?.id || item.priorOutcome?.matchedEventId || null,
  evidence: item.matchedEvent ? [{
    kind: 'curated-report',
    source: item.matchedEvent.source || '',
    url: item.matchedEvent.url || '',
    publishedAt: item.matchedEvent.publishedAt || '',
  }] : item.resolution ? [{ kind: 'schedule-resolution', ...item.resolution }]
    : Array.isArray(item.priorOutcome?.evidence) ? item.priorOutcome.evidence : [],
}));

const out = {
  meta: {
    editorialDate,
    checkedAt: now.toISOString(),
    count: outcomes.length,
    blockers: result.blockers.length,
    ok: result.ok,
  },
  outcomes,
};

fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
for (const item of outcomes.filter((entry) => entry.hardBlock)) {
  console.warn(`::warning::Scheduled outcome missing: ${item.date} ${item.label} (${item.id})`);
}
console.log(`scheduled outcomes: ${outcomes.length} tracked · ${result.satisfied.length} satisfied · ${result.pending.length} pending · ${result.blockers.length} blocking`);
