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
    .map((e) => {
      const rawTitle = String(e.label || '').split(/\s+[—–]\s+/)[0].trim();
      const title = /USMCA talks/i.test(rawTitle) ? 'Mexico–U.S. trade talks'
        : /INEGI CPI/i.test(rawTitle) ? 'First-half July inflation'
        : /INEGI IGAE/i.test(rawTitle) ? 'May economic activity'
        : /INEGI unemployment/i.test(rawTitle) ? 'June employment'
        : rawTitle;
      const why = /USMCA talks/i.test(rawTitle)
        ? 'USMCA stays in force. Mexico and the United States return to the table after the U.S. declined a 16-year extension.'
        : String(e.mechanism || '').trim();
      return {
        date: e.date,
        approx: !!e.approx,
        title,
        why,
        source: String(e.source || '').trim(),
        sourceUrl: String(e.sourceUrl || '').trim(),
      };
    });
};
