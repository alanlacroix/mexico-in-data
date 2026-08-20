const fs = require('node:fs');
const path = require('node:path');
const { editorialDay } = require('../pipeline/lib/news-day.cjs');
const { groupEvents, mergeCoverage, sameThread } = require('../pipeline/lib/news-threads.cjs');
const { plainExplanation, plainHeadline, plainSourceName } = require('../pipeline/lib/plain-language.cjs');

const read = (rel) => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', rel), 'utf8')); }
  catch { return null; }
};

const SECTIONS = {
  economy:     { beat: 'Economy',         room: 'Economy & money',     key: 'economy' },
  money:       { beat: 'Markets & money', room: 'Economy & money',     key: 'economy' },
  politics:    { beat: 'Politics',        room: 'Politics',            key: 'politics' },
  security:    { beat: 'Security',        room: 'Security & society',  key: 'society' },
  society:     { beat: 'Society',         room: 'Security & society',  key: 'society' },
  'us-mexico': { beat: 'US & Mexico',     room: 'US & Mexico',         key: 'usmexico' },
};

const clean = (value) => String(value || '').trim();
const shortDate = (value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }) : value;
};
const sentence = (value) => {
  const text = clean(value).replace(/\.\s*$/, '');
  return text ? `${text}.` : '';
};

function toStory(group) {
  const event = group.event;
  const section = SECTIONS[event && event.section] || SECTIONS.economy;
  const sources = mergeCoverage(event, event.coverage || [], group.coverage || [])
    .map((source) => ({ ...source, source: plainSourceName(source.source) }));
  const latestSourceTime = sources.map((source) => clean(source.publishedAt)).find(Boolean);
  return {
    id: clean(event.id) || clean(event.h1 || event.headline || event.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    beat: section.beat,
    date: clean(event.date),
    lane: clean(event.lane),
    title: plainHeadline(event.h1 || event.headline || event.title).replace(/\.\s*$/, ''),
    summary: plainExplanation(event.summary || event.dek || event.context || event.why),
    bg: plainExplanation(event.background),
    view: plainExplanation(event.view),
    prediction: plainExplanation(event.prediction),
    analysisV: Number(event.analysisV) || 0,
    analysisRefs: event.analysisRefs && typeof event.analysisRefs === 'object' ? event.analysisRefs : {},
    analysisSources: Array.isArray(event.analysisSources) ? event.analysisSources : [],
    implications: plainExplanation(event.implications),
    next: plainExplanation(event.next),
    image: /^https:\/\//i.test(clean(event.image)) ? clean(event.image) : '',
    source: plainSourceName(event.source),
    url: clean(event.href || event.url),
    reportTime: latestSourceTime || clean(event.publishedAt),
    sources,
    sourceCount: sources.length || 1,
    topic: section.room,
    topicKey: section.key,
  };
}

module.exports = function (now = new Date()) {
  const brief = read('brief.json') || {};
  const happening = read('happening.json') || {};
  const meta = brief.meta || {};
  const clock = now instanceof Date || typeof now === 'string' || typeof now === 'number' ? now : new Date();
  const editorialDate = editorialDay(clock);
  const claims = [brief.lead, ...(Array.isArray(brief.items) ? brief.items : [])].filter(Boolean);
  const briefEditorialDate = clean(meta.editorialDate);
  const generatedForToday = briefEditorialDate === editorialDate;
  // A daily product must never lead with a prior edition. If today's publication has
  // not completed, the page shows today's honest empty state while the current wire,
  // numbers and calendar continue below. Carrying an old edition was the mechanism
  // that left August 17 at the top of the site for three days.
  const carryingLastBrief = false;
  const visibleClaims = generatedForToday ? claims : [];
  const visibleEditionDate = editorialDate;
  const briefGroups = groupEvents(visibleClaims).map((group) => {
    const related = (happening.events || []).filter((event) => sameThread(group.event, event));
    return { ...group, coverage: mergeCoverage(group.coverage, related, related.flatMap((event) => event.coverage || [])) };
  });
  const selectedStories = briefGroups.map(toStory).filter((story) => story.title).slice(0, 3);
  const weekendEdition = meta.selection?.policy === 'weekend-recap-v1';
  // The date is authoritative. A prior-day development may extend a real current
  // edition, but prior reporting can never create an edition on its own.
  const prior = new Date(`${editorialDate}T12:00:00Z`);
  prior.setUTCDate(prior.getUTCDate() - 1);
  const priorDate = prior.toISOString().slice(0, 10);
  const todayStories = weekendEdition
    ? [] : selectedStories.filter((story) => story.date === editorialDate);
  const keyDevelopments = weekendEdition
    ? []
    : selectedStories.filter((story) => story.date === priorDate);
  const weekendStories = weekendEdition
    ? selectedStories.filter((story) => story.lane === 'weekend') : [];
  const weekRecapStories = weekendEdition
    ? selectedStories.filter((story) => story.lane === 'week-recap') : [];
  const stories = weekendEdition
    ? [...weekendStories, ...weekRecapStories]
    : [...todayStories, ...keyDevelopments];
  const droppedMisdatedStories = stories.length !== selectedStories.length;
  const latestItemDate = stories.map((story) => story.date).filter(Boolean).sort().at(-1) || '';
  const fallback = stories.slice(0, 3).map((story) => sentence(story.title)).join(' ');
  const quietCopy = 'No major developments yet today.';

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
    editorialDate: visibleEditionDate,
    currentEditorialDate: editorialDate,
    briefEditorialDate,
    carryingLastBrief,
    weekendEdition,
    editionType: weekendEdition ? 'weekend-recap' : 'daily',
    briefTitle: weekendEdition ? 'Weekend recap' : 'The brief',
    newsThrough: clean(meta.reviewedAt || meta.generatedAt || happening.meta?.generatedAt),
    quiet: !stories.length || !!meta.quiet,
    summaryLead: plainExplanation(!droppedMisdatedStories && generatedForToday && clean(brief.summary)
      ? clean(brief.summary) : (fallback || quietCopy)),
    stories,
    todayStories,
    keyDevelopments,
    weekendStories,
    weekRecapStories,
    briefSources,
    latestItemDate,
    windowHours: Number(meta.windowHours) || 36,
    windowLabel: weekendEdition ? `Since ${shortDate(meta.selection?.weekStartDate)}` : `Past ${Number(meta.windowHours) || 36} hours`,
  };
};
