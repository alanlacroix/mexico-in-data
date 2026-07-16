// dailyBrief.js — the homepage editorial block, COMPUTED from the automated pipeline.
//
// This replaces the old hand-committed _data/dailyBrief.json (Fable audit 2026-07-16:
// the 07-15 redesign quietly pointed the front page at a hand file that nothing wrote,
// so it silently went stale — "all ceiling, no floor"). The front page now renders from
// the same pipeline output as everything else: the rubric-ranked, gated brief in
// data/brief.json (built by build-brief.js from the curated, slop-filtered event log).
// Nothing here is hand-written; the copy is the pipeline's, and it refreshes whenever
// the pipeline does. The template shape (summaryLead / stories / newsThrough / companies)
// is unchanged, so index.njk barely moved.

const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', rel), 'utf8')); }
  catch { return null; }
};

// section (from the event log / brief) → homepage beat kicker + topic room + link.
const SECTIONS = {
  economy:     { beat: 'Economy',         room: 'Economy & money',     url: '/economy.html' },
  money:       { beat: 'Markets & money', room: 'Economy & money',     url: '/economy.html' },
  politics:    { beat: 'Politics',        room: 'Politics',            url: '/politics.html' },
  security:    { beat: 'Security',        room: 'Society & security',  url: '/society.html' },
  society:     { beat: 'Society',         room: 'Society & security',  url: '/society.html' },
  'us-mexico': { beat: 'U.S.–Mexico',     room: 'U.S.–Mexico',         url: '/us-mexico.html' },
};

// The auto companies tracker (pipeline/build-companies.js → data/companies.json) runs DARK
// per Fable: it is the highest slop-regression risk, so verify a clean week of output, then
// flip this to true to show it on the homepage. While false, the section stays hidden.
const COMPANIES_LIVE = false;

const clean = (s) => String(s || '').trim();
const toStory = (e) => {
  const s = SECTIONS[e && e.section] || SECTIONS.economy;
  return {
    beat: s.beat,
    date: clean(e.date),
    title: clean(e.h1 || e.headline || e.title).replace(/\.\s*$/, ''),
    context: clean(e.context),
    source: clean(e.source),
    url: clean(e.href || e.url),
    topic: s.room,
    topicUrl: s.url,
    isNew: !!(e && e.isNew),   // entered the brief since the last update — the daily delta
  };
};

module.exports = function () {
  const brief = read('brief.json') || {};
  const lead = brief.lead || null;
  const items = Array.isArray(brief.items) ? brief.items : [];
  const stories = [lead, ...items].filter(Boolean).map(toStory).filter((x) => x.title);

  const meta = brief.meta || {};
  const co = COMPANIES_LIVE ? (read('companies.json') || {}) : {};
  const companies = Array.isArray(co.companies) ? co.companies : [];
  return {
    // Editorial clock: when the pipeline last rebuilt the brief (real, not hand-typed).
    // Distinct from the data clock (the "N feeds checked" line, from health.json).
    newsThrough: meta.reviewedAt || meta.generatedAt || (stories[0] && stories[0].date) || '',
    // The daily delta: how many stories are new since the last update, and whether it is
    // an honest quiet stretch (nothing recent leads). Drives the "what changed" signal.
    newCount: Number(meta.newCount) || 0,
    quiet: !!meta.quiet,
    // The one big thing, explained — the pipeline's lead context. The homepage script
    // then appends the live macro readings (peso vs a year ago, inflation) after it.
    summaryLead: clean(lead && lead.context) || (stories[0] && stories[0].context) || '',
    summaryNext: '',
    stories,
    // Companies watchlist: auto-tracked, machine-written from gated facts (see COMPANIES_LIVE).
    companies,
  };
};
