const fs = require('node:fs');
const path = require('node:path');
const { editorialDay } = require('../pipeline/lib/news-day.cjs');
const { coverageForDay, groupEvents, normalize } = require('../pipeline/lib/news-threads.cjs');
const { DEFAULT_WINDOW_HOURS, recentEvents } = require('../pipeline/lib/news-window.cjs');

const SECTION = {
  economy: { key: 'economy', label: 'Economy' },
  money: { key: 'economy', label: 'Economy' },
  politics: { key: 'politics', label: 'Politics' },
  security: { key: 'society', label: 'Society & security' },
  society: { key: 'society', label: 'Society & security' },
  'us-mexico': { key: 'us-mexico', label: 'US–Mexico' },
};

const clean = (value) => String(value || '').trim();
const read = (rel, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', rel), 'utf8')); }
  catch { return fallback; }
};

function interests() {
  return (read('interests.json', {}).interests || []).flatMap((interest) => {
    try { return [{ tag: interest.tag, pattern: new RegExp(interest.pattern, 'i') }]; }
    catch { return []; }
  });
}

module.exports = function (now = new Date()) {
  const happening = read('happening.json', {});
  const brief = read('brief.json', {});
  const clock = now instanceof Date || typeof now === 'string' || typeof now === 'number' ? now : new Date();
  const editorialDate = editorialDay(clock);
  const briefEntries = [brief.lead, ...(Array.isArray(brief.items) ? brief.items : [])]
    .filter((entry) => entry && clean(brief.meta?.editorialDate) === editorialDate);
  const briefUrls = new Set(briefEntries.flatMap((entry) => [clean(entry.href || entry.url), ...(entry.coverage || []).map((source) => clean(source.url))]).filter(Boolean));
  const briefTitles = new Set(briefEntries.map((entry) => normalize(entry.h1 || entry.headline || entry.title)).filter(Boolean));
  const interestRules = interests();

  const windowHours = Math.max(DEFAULT_WINDOW_HOURS, Number(brief.meta?.windowHours) || 0);
  const current = recentEvents(happening.events || [], clock, windowHours)
    .filter((event) => event && event.title);

  return groupEvents(current).slice(0, 60).map((group) => {
    const event = group.event;
    const section = SECTION[event.section] || SECTION.economy;
    const sources = coverageForDay(clean(event.date), event, event.coverage || [], group.coverage || []);
    const latestSourceTime = sources.map((source) => clean(source.publishedAt)).find(Boolean);
    const haystack = `${event.title || ''} ${event.why || ''} ${event.section || ''}`;
    return {
      id: clean(event.id) || clean(event.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      date: clean(event.date),
      topic: section.key,
      topicLabel: section.label,
      title: clean(event.title).replace(/\.\s*$/, ''),
      summary: clean(event.summary || event.dek || event.why),
      bg: clean(event.background),
      implications: clean(event.implications),
      next: clean(event.next),
      source: clean(event.source),
      url: clean(event.url),
      reportTime: latestSourceTime || clean(event.publishedAt),
      sources,
      sourceCount: sources.length || 1,
      interestTags: interestRules.filter((rule) => rule.pattern.test(haystack)).map((rule) => rule.tag),
      inBrief: sources.some((source) => briefUrls.has(source.url))
        || briefUrls.has(clean(event.url))
        || briefTitles.has(normalize(event.title)),
    };
  }).filter((story) => !story.inBrief);
};
