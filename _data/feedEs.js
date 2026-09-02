// feedEs.js — the Spanish homepage feed, derived from the English one.
//
// Three sources of Spanish, in strict priority order (the anti-slop architecture):
//   1. Hand-written: every fixed label, tile meaning, month, topic and verdict comes
//      from uiStrings.js — written once by a person, never by a model.
//   2. Native: most of the wire IS Spanish. Where the ledger kept the original
//      Spanish headline, the /es/ page shows it verbatim — provenance, not
//      translation.
//   3. The current edition's Spanish is published atomically beside its English.
//      Cached translation remains only for optional calendar/economy/week copy.
const fs = require('node:fs');
const path = require('node:path');
const feed = require('./feed.js');
const ui = require('./uiStrings.js');
const { hash, cached } = require('../pipeline/lib/es-translation.cjs');

const CACHE = path.join(__dirname, '..', 'data', 'es', 'strings.json');
const cache = (() => {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; }
})();

// Free text appears only when a reviewed cache entry exists.
const t = (text) => cached(cache, text);
const mapped = (table) => (value) => table[value] || value;
const cat = mapped(ui.maps.cats);
const esDate = (label) => String(label || '')
  .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, (d) => ui.maps.days[d])
  .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m) => ui.maps.months[m]);
const esRel = (rel) => {
  for (const [re, out] of ui.maps.rel) if (re.test(rel)) return rel.replace(re, out);
  return rel;
};

module.exports = function () {
  const f = feed.forLocale('es');
  const translatedStories = f.stories.map((s) => ({ ...s, date: esDate(s.date), cat: cat(s.cat) }));
  const carrying = Boolean(f.carrying);
  const visibleWeekend = Boolean(f.weekend);
  const weekendStories = visibleWeekend
    ? translatedStories.filter((story) => story.lane === 'weekend') : [];
  const weekRecapStories = visibleWeekend
    ? translatedStories.filter((story) => story.lane === 'week-recap') : [];
  const todayStories = visibleWeekend ? [] : translatedStories.filter((story) => story.lane === 'today');
  const keyDevelopments = visibleWeekend
    ? [] : translatedStories.filter((story) => story.lane === 'key-development');
  const translatedWeek = f.week.map((w) => ({
    ...w,
    date: esDate(w.date),
    cat: cat(w.cat),
    title: w.title,
    dek: w.dek,
    orig: '',
    lang: '',
  }));
  return {
    ...f,
    date: f.date,
    updated: f.updated,
    carrying,
    weekend: visibleWeekend,
    translationCarrying: false,
    brief: f.brief,
    briefSources: f.briefSources || [],
    latestStoryDate: esDate(f.latestStoryDate),
    numbers: f.numbers.map((n) => ({
      ...n,
      label: mapped(ui.maps.tileLabels)(n.label),
      asOf: esDate(n.asOf),
      tag: mapped(ui.maps.tags)(n.tag),
      why: [ui.maps.meaning[n.id], t(n.compare)].filter(Boolean).join(' '),
    })),
    stories: translatedStories,
    todayStories,
    keyDevelopments,
    weekendStories,
    weekRecapStories,
    storySections: (visibleWeekend ? [
      { id: 'new-this-weekend', kind: 'weekend', latest: weekendStories[0]?.date || '', stories: weekendStories },
      { id: 'week-recap', kind: 'week-recap', latest: weekRecapStories[0]?.date || '', stories: weekRecapStories },
    ] : [
      { id: 'latest-edition', kind: 'latest', latest: esDate(f.date), stories: translatedStories },
    ]).filter((section) => section.stories.length),
    week: translatedWeek,
    weekLabel: esDate(f.weekLabel),
    upcoming: f.upcoming.map((g) => ({
      ...g,
      when: esDate(g.when).replace(/^Week of /, 'Semana del '),
      rel: esRel(g.rel),
      items: g.items.map((e) => ({ ...e, title: t(e.title), what: t(e.what), why: t(e.why) })).filter((e) => e.title),
    })).filter((g) => g.items.length),
    econ: f.econ.map((r) => ({
      ...r,
      name: mapped(ui.maps.econNames)(r.name),
      period: esDate(r.period),
      refLabel: mapped(ui.maps.refLabels)(r.refLabel),
      note: t(r.note),
    })),
  };
};
module.exports.hash = hash;
