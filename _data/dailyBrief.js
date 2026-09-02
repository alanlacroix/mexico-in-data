const fs = require('node:fs');
const path = require('node:path');
const { editorialDay } = require('../pipeline/lib/news-day.cjs');
const { validateEdition } = require('../pipeline/lib/public-edition.cjs');
const { plainExplanation, plainHeadline, plainSourceName } = require('../pipeline/lib/plain-language.cjs');

const FILE = path.join(__dirname, '..', 'data', 'edition.json');
const SECTIONS = {
  economy: { beat: 'Economy', room: 'Economy & money', key: 'economy' },
  money: { beat: 'Markets & money', room: 'Economy & money', key: 'economy' },
  politics: { beat: 'Politics', room: 'Politics', key: 'politics' },
  security: { beat: 'Security', room: 'Security & society', key: 'society' },
  society: { beat: 'Society', room: 'Security & society', key: 'society' },
  'us-mexico': { beat: 'US & Mexico', room: 'US & Mexico', key: 'usmexico' },
  energy: { beat: 'Energy & infrastructure', room: 'Energy & infrastructure', key: 'energy' },
  payments: { beat: 'Payments & fintech', room: 'Payments & fintech', key: 'payments' },
  deals: { beat: 'Deals & investment', room: 'Deals & investment', key: 'deals' },
};
const shortDate = (value, locale = 'en') => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric',
  }) : value;
};

function loadEdition(sources) {
  if (sources?.edition) return sources.edition;
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; }
}

function toStory(story, locale) {
  const copy = story[locale] || story.en || {};
  const section = SECTIONS[story.section] || SECTIONS.economy;
  const analysisSources = (story.evidence || []).filter((item) => item.kind !== 'article');
  const sources = (story.evidence || []).map((item) => ({
    source: plainSourceName(item.source), url: item.url, publishedAt: story.publishedAt, date: story.date,
  }));
  return {
    id: story.id,
    beat: section.beat,
    date: story.date,
    lane: story.lane,
    title: plainHeadline(copy.headline).replace(/\.\s*$/, ''),
    summary: plainExplanation(copy.dek),
    bg: plainExplanation(copy.background),
    view: plainExplanation(copy.view),
    prediction: plainExplanation(copy.watch),
    analysisV: 1,
    analysisRefs: story.evidenceRefs || {},
    analysisSources,
    source: plainSourceName(story.source),
    url: story.url,
    reportTime: story.publishedAt,
    sources,
    sourceCount: sources.length,
    topic: section.room,
    topicKey: section.key,
  };
}

function mondayOfEdition(day) {
  const date = new Date(`${day}T12:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

module.exports = function (now = new Date(), sources = {}, locale = 'en') {
  if (!(now instanceof Date) && typeof now !== 'string' && typeof now !== 'number') {
    sources = now || {};
    now = new Date();
  }
  const edition = loadEdition(sources);
  const validation = validateEdition(edition);
  if (!validation.ok) throw new Error(`data/edition.json is invalid: ${validation.errors.join('; ')}`);
  const currentEditorialDate = editorialDay(now);
  const carryingLastBrief = edition.editorialDate !== currentEditorialDate;
  const weekendEdition = edition.editionType === 'weekend-recap';
  const stories = edition.stories.map((story) => toStory(story, locale));
  const todayStories = weekendEdition ? [] : stories.filter((story) => story.lane === 'today');
  const keyDevelopments = weekendEdition ? [] : stories.filter((story) => story.lane === 'key-development');
  const weekendStories = weekendEdition ? stories.filter((story) => story.lane === 'weekend') : [];
  const weekRecapStories = weekendEdition ? stories.filter((story) => story.lane === 'week-recap') : [];
  const briefSources = [];
  for (const story of stories) {
    const source = story.sources.find((item) => item.url === story.url) || story.sources[0];
    if (!source || briefSources.some((item) => item.url === source.url)) continue;
    briefSources.push(source);
  }
  const latestItemDate = stories.map((story) => story.date).sort().at(-1) || '';
  const delayed = locale === 'es'
    ? 'La actualización de hoy está retrasada. Esta es la última edición completa.'
    : "Today's update is delayed. This is the last complete edition.";
  return {
    editorialDate: edition.editorialDate,
    currentEditorialDate,
    briefEditorialDate: edition.editorialDate,
    artifactHash: edition.artifactHash,
    carryingLastBrief,
    publicationInterrupted: carryingLastBrief,
    weekendEdition,
    editionType: edition.editionType,
    briefTitle: weekendEdition ? (locale === 'es' ? 'Resumen del fin de semana' : 'Weekend recap') : (locale === 'es' ? 'El resumen' : 'The brief'),
    newsThrough: edition.generatedAt,
    quiet: false,
    summaryLead: carryingLastBrief ? delayed : edition.summary[locale],
    stories,
    todayStories,
    keyDevelopments,
    weekendStories,
    weekRecapStories,
    briefSources,
    latestItemDate,
    windowHours: 36,
    windowLabel: weekendEdition ? `${locale === 'es' ? 'Desde' : 'Since'} ${shortDate(mondayOfEdition(edition.editorialDate), locale)}` : '',
  };
};
