// calendar.js — the "Coming up" FLOOR, computed at build time (Fable audit #4).
//
// Same reason as nowBoard.js: the timeline hydrates client-side and used to show
// "Loading the calendar…" with no JS. This bakes the next few dated releases into the
// static HTML from data/events.json. The client renderTimeline() replaces it when the
// event data loads, and leaves it in place otherwise.

const fs = require('node:fs');
const path = require('node:path');

module.exports = function () {
  let events = [];
  try { events = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'events.json'), 'utf8')).events || []; }
  catch { return []; }
  const cutoff = Date.now() - 864e5;
  return events
    .filter((e) => e && e.date && Date.parse(e.date) >= cutoff)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 4)
    .map((e) => ({
      date: e.date,
      approx: !!e.approx,
      title: String(e.label || '').split(/\s+[—–]\s+/)[0].trim(),   // short label before the em-dash gloss
      why: String(e.mechanism || '').trim(),
      source: String(e.source || '').trim(),
    }));
};
