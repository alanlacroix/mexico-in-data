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
  economy:     { beat: 'Economy',         room: 'Economy & money',     url: '/?topic=economy#all-news' },
  money:       { beat: 'Markets & money', room: 'Economy & money',     url: '/?topic=economy#all-news' },
  politics:    { beat: 'Politics',        room: 'Politics',            url: '/?topic=politics#all-news' },
  security:    { beat: 'Security',        room: 'Society & security',  url: '/?topic=society#all-news' },
  society:     { beat: 'Society',         room: 'Society & security',  url: '/?topic=society#all-news' },
  'us-mexico': { beat: 'US–Mexico',       room: 'US–Mexico',           url: '/?topic=us-mexico#all-news' },
};

// The auto companies tracker (pipeline/build-companies.js → data/companies.json) runs DARK
// per Fable: it is the highest slop-regression risk, so verify a clean week of output, then
// flip this to true to show it on the homepage. While false, the section stays hidden.
const COMPANIES_LIVE = false;

const clean = (s) => String(s || '').trim();
const clusterKey = (e) => {
  const title = clean(e && (e.h1 || e.headline || e.title)).toLowerCase();
  if ((e && e.section) === 'us-mexico' && /(usmca|ustr)/.test(title) && /(tariff|quota|rules? of origin|trade deficit|review|negotiat)/.test(title)) return `${e.date}:usmca-review`;
  return clean(e && (e.href || e.url)) || `${e && e.date}:${title.replace(/[^a-z0-9]+/g, ' ').split(' ').slice(0, 8).join('-')}`;
};
const quality = (e) => (clean(e && e.background) ? 3 : 0) + (!/google news/i.test(clean(e && e.source)) ? 2 : 0) + (/^https?:/.test(clean(e && (e.href || e.url))) ? 1 : 0);
const dedupe = (events) => {
  const groups = new Map();
  events.filter(Boolean).forEach((e, index) => {
    const key = clusterKey(e);
    const current = groups.get(key);
    if (!current || quality(e) > quality(current.event)) groups.set(key, { event: e, index: current ? current.index : index });
  });
  return [...groups.values()].sort((a, b) => a.index - b.index).map((x) => x.event);
};
const toStory = (e) => {
  const s = SECTIONS[e && e.section] || SECTIONS.economy;
  return {
    beat: s.beat,
    date: clean(e.date),
    title: clean(e.h1 || e.headline || e.title).replace(/\.\s*$/, ''),
    // Keep the card readable without asking for a click. The first sentence says what
    // happened; the optional drawer carries the extra background.
    summary: clean(e.summary || e.dek || e.context),
    // The Briefly Explained contract (Alan 2026-07-20: "has to be consistent"): the CORE
    // three — Background · Drivers · Implications — ship together or not at all; "What's
    // next" is an explicit bonus when the article states a real next step. No more falling
    // back to a bare background/context paragraph: a partially-analysed story shows NO BE
    // until the pipeline's retry completes it, so every visible panel has the same shape.
    explanation: clean(e.explanation),
    bg: clean(e.background), drivers: clean(e.drivers), implications: clean(e.implications), next: clean(e.next),
    // The article's own link-preview image (og:image, https-only) — unfurl-style thumbnail.
    image: /^https:\/\//i.test(clean(e.image)) ? clean(e.image) : '',
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
  const stories = dedupe([lead, ...items]).map(toStory).filter((x) => x.title).slice(0, 6);
  const briefSources = [];
  for (const story of stories) {
    if (!story.source || !story.url || briefSources.some((x) => x.source === story.source)) continue;
    briefSources.push({ source: story.source, url: story.url });
    if (briefSources.length === 4) break;
  }

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
    // THE BRIEF: the pipeline's gated synthesis of the day's key stories (build-brief
    // writeSummary). Fallback = the lead HEADLINE as a sentence — never the lead's
    // why-context, which dangles without its headline and duplicates the box below.
    // The client script appends the live macro readings (peso, inflation) after it.
    summaryLead: clean(brief.summary) || (() => { const h = clean(lead && lead.h1); return h ? h.replace(/\.?\s*$/, '.') : clean(stories[0] && stories[0].title) + '.'; })(),
    summaryNext: '',
    stories,
    briefSources,
    view: clean(brief.view || brief.analysis),
    // Companies watchlist: auto-tracked, machine-written from gated facts (see COMPANIES_LIVE).
    companies,
  };
};
