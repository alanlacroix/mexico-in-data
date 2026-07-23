const fs = require('node:fs');
const path = require('node:path');
const { editorialDay } = require('../pipeline/lib/news-day.cjs');
const { coverageForDay, groupEvents, mergeCoverage, sameThread } = require('../pipeline/lib/news-threads.cjs');
const { plainExplanation, plainHeadline, plainSourceName } = require('../pipeline/lib/plain-language.cjs');

const read = (rel) => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', rel), 'utf8')); }
  catch { return null; }
};

const SECTIONS = {
  economy:     { beat: 'Economy',         room: 'Economy & money',     url: '/economy.html' },
  money:       { beat: 'Markets & money', room: 'Economy & money',     url: '/economy.html' },
  politics:    { beat: 'Politics',        room: 'Politics',            url: '/politics.html' },
  security:    { beat: 'Security',        room: 'Society & security',  url: '/society.html' },
  society:     { beat: 'Society',         room: 'Society & security',  url: '/society.html' },
  'us-mexico': { beat: 'US–Mexico',       room: 'US–Mexico',           url: '/us-mexico.html' },
};

const clean = (value) => String(value || '').trim();
const sentence = (value) => {
  const text = clean(value).replace(/\.\s*$/, '');
  return text ? `${text}.` : '';
};

function toStory(group) {
  const event = group.event;
  const section = SECTIONS[event && event.section] || SECTIONS.economy;
  const sources = coverageForDay(clean(event.date), event, event.coverage || [], group.coverage || [])
    .map((source) => ({ ...source, source: plainSourceName(source.source) }));
  const latestSourceTime = sources.map((source) => clean(source.publishedAt)).find(Boolean);
  return {
    id: clean(event.id) || clean(event.h1 || event.headline || event.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    beat: section.beat,
    date: clean(event.date),
    title: plainHeadline(event.h1 || event.headline || event.title).replace(/\.\s*$/, ''),
    summary: plainExplanation(event.summary || event.dek || event.context || event.why),
    bg: plainExplanation(event.background),
    implications: plainExplanation(event.implications),
    next: plainExplanation(event.next),
    image: /^https:\/\//i.test(clean(event.image)) ? clean(event.image) : '',
    source: plainSourceName(event.source),
    url: clean(event.href || event.url),
    reportTime: latestSourceTime || clean(event.publishedAt),
    sources,
    sourceCount: sources.length || 1,
    topic: section.room,
    topicUrl: section.url,
  };
}

module.exports = function (now = new Date()) {
  const brief = read('brief.json') || {};
  const happening = read('happening.json') || {};
  const meta = brief.meta || {};
  const clock = now instanceof Date || typeof now === 'string' || typeof now === 'number' ? now : new Date();
  const editorialDate = editorialDay(clock);
  const claims = [brief.lead, ...(Array.isArray(brief.items) ? brief.items : [])].filter(Boolean);
  const generatedForToday = clean(meta.editorialDate) === editorialDate;
  const visibleClaims = generatedForToday ? claims : [];
  const briefGroups = groupEvents(visibleClaims).map((group) => {
    const related = (happening.events || []).filter((event) => sameThread(group.event, event));
    return { ...group, coverage: mergeCoverage(group.coverage, related, related.flatMap((event) => event.coverage || [])) };
  });
  const stories = briefGroups.map(toStory).filter((story) => story.title).slice(0, 5);
  const fallback = stories.slice(0, 3).map((story) => sentence(story.title)).join(' ');
  const quietCopy = 'No major developments have cleared the brief yet.';

  const briefSources = [];
  for (const story of stories) {
    for (const source of story.sources) {
      if (!source.source || !source.url || briefSources.some((item) => item.source === source.source)) continue;
      briefSources.push(source);
      if (briefSources.length === 5) break;
    }
    if (briefSources.length === 5) break;
  }

  return {
    editorialDate,
    newsThrough: clean(meta.reviewedAt || meta.generatedAt || happening.meta?.generatedAt),
    quiet: !stories.length || !!meta.quiet,
    summaryLead: plainExplanation(generatedForToday && clean(brief.summary) ? clean(brief.summary) : (fallback || quietCopy)),
    stories,
    briefSources,
    windowHours: Number(meta.windowHours) || 36,
    windowLabel: `Past ${Number(meta.windowHours) || 36} hours`,
  };
};
