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
// Fallback is always the English text: a missing translation shows English rather
// than stale or absent content, and translate-es.mjs fills it on the next window.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const feed = require('./feed.js');
const ui = require('./uiStrings.js');

const CACHE = path.join(__dirname, '..', 'data', 'es', 'strings.json');
const cache = (() => {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; }
})();

const hash = (text) => crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 16);
// Translate free text via the cache; English fallback by design.
const t = (text) => {
  const clean = String(text || '').trim();
  if (!clean) return '';
  return cache[hash(clean)] || clean;
};
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
  const f = feed();
  return {
    ...f,
    brief: t(f.brief),
    numbers: f.numbers.map((n) => ({
      ...n,
      label: mapped(ui.maps.tileLabels)(n.label),
      asOf: esDate(n.asOf),
      tag: mapped(ui.maps.tags)(n.tag),
      why: [ui.maps.meaning[n.id], t(n.compare)].filter(Boolean).join(' '),
    })),
    stories: f.stories.map((s) => ({
      ...s,
      date: esDate(s.date),
      cat: cat(s.cat),
      title: t(s.title),
      dek: t(s.dek),
      bg: t(s.bg),
      view: t(s.view),
      watch: t(s.watch),
      why: t(s.why),
    })),
    week: f.week.map((w) => ({
      ...w,
      date: esDate(w.date),
      cat: cat(w.cat),
      // Native Spanish headline when the ledger kept one; the translation debt is zero
      // for these — the original is shown, tagged nothing, because it needs no tag here.
      title: w.lang === 'ES' && w.orig ? w.orig : t(w.title),
      dek: w.lang === 'ES' ? '' : t(w.dek),
      orig: '',
      lang: '',
    })),
    weekLabel: esDate(f.weekLabel),
    upcoming: f.upcoming.map((g) => ({
      ...g,
      when: esDate(g.when).replace(/^Week of /, 'Semana del '),
      rel: esRel(g.rel),
      items: g.items.map((e) => ({ ...e, title: t(e.title), what: t(e.what), why: t(e.why) })),
    })),
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
