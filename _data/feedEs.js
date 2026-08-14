// feedEs.js — the Spanish homepage feed, derived from the English one.
//
// Three sources of Spanish, in strict priority order (the anti-slop architecture):
//   1. Hand-written: every fixed label, tile meaning, month, topic and verdict comes
//      from uiStrings.js — written once by a person, never by a model.
//   2. Native: most of the wire IS Spanish. Where the ledger kept the original
//      Spanish headline, the /es/ page shows it verbatim — provenance, not
//      translation.
//   3. Cached model translation, for free editorial text only (the brief, the
//      Briefly-explained fields, deks, calendar lines), keyed by a hash of the
//      English so each sentence is translated exactly once, ever, under the es-MX
//      contract in pipeline/translate-es.mjs.
// The current Brief is all-or-nothing by language. If any required translation is
// missing, this module carries the last complete Spanish Brief. Optional sections
// omit missing free text instead of leaking English into the Spanish edition.
const fs = require('node:fs');
const path = require('node:path');
const feed = require('./feed.js');
const ui = require('./uiStrings.js');
const { hash, cached, resolveSpanishBrief } = require('../pipeline/lib/es-translation.cjs');

const CACHE = path.join(__dirname, '..', 'data', 'es', 'strings.json');
const BRIEF_SNAPSHOT = path.join(__dirname, '..', 'data', 'es', 'brief.json');
const cache = (() => {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; }
})();
const snapshot = (() => {
  try { return JSON.parse(fs.readFileSync(BRIEF_SNAPSHOT, 'utf8')); } catch { return null; }
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
  const briefFeed = resolveSpanishBrief(f, cache, snapshot);
  const currentVisibleIds = new Set(f.stories.map((story) => story.id));
  const translatedStories = briefFeed.stories
    .filter((story) => briefFeed.editorialDate !== f.date || currentVisibleIds.has(story.id))
    .map((s) => ({ ...s, date: esDate(s.date), cat: cat(s.cat) }));
  const carrying = Boolean(f.carrying || briefFeed.translationCarrying);
  const todayStories = carrying ? [] : translatedStories.filter((story) => story.lane === 'today');
  const keyDevelopments = translatedStories.filter((story) => !todayStories.includes(story));
  const translatedWeek = f.week.map((w) => ({
    ...w,
    date: esDate(w.date),
    cat: cat(w.cat),
    title: w.lang === 'ES' && w.orig ? w.orig : t(w.title),
    dek: w.lang === 'ES' ? '' : t(w.dek),
    orig: '',
    lang: '',
  })).filter((w) => w.title);
  return {
    ...f,
    date: briefFeed.editorialDate,
    updated: briefFeed.updated,
    carrying,
    translationCarrying: briefFeed.translationCarrying,
    brief: briefFeed.brief,
    briefSources: briefFeed.briefSources || [],
    latestStoryDate: esDate(briefFeed.latestStoryDate),
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
    storySections: [
      { id: 'today-stories', kind: 'today', latest: todayStories[0]?.date || '', stories: todayStories },
      { id: 'key-developments', kind: 'key', latest: keyDevelopments[0]?.date || '', stories: keyDevelopments },
    ].filter((section) => section.stories.length),
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
