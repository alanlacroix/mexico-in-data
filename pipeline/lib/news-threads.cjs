const { editorialDay } = require('./news-day.cjs');

const clean = (value) => String(value || '').trim();
const normalize = (value) => clean(value)
  .toLowerCase()
  .replace(/[^a-z0-9áéíóúñü]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const words = (value) => new Set(normalize(value).split(' ').filter((word) => word.length > 3));
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
};

const titleOf = (event) => clean(event && (event.h1 || event.headline || event.title));
const publishedAt = (event) => Date.parse(event && (event.publishedAt || event.date)) || 0;
const hasImage = (event) => /^https:\/\//i.test(clean(event && event.image));
const isFirstParty = (event) => /(?:\.gob\.mx|inegi\.org\.mx|banxico\.org\.mx|ustr\.gov|whitehouse\.gov|dof\.gob\.mx)/i.test(clean(event && event.url));

function sameThread(a, b) {
  if (!a || !b || clean(a.date) !== clean(b.date)) return false;
  if (clean(a.url) && clean(a.url) === clean(b.url)) return true;
  if (jaccard(words(titleOf(a)), words(titleOf(b))) >= 0.5) return true;
  const companyA = normalize(a.company), companyB = normalize(b.company);
  return !!companyA && companyA === companyB
    && jaccard(words([titleOf(a), a.why, a.context].filter(Boolean).join(' ')), words([titleOf(b), b.why, b.context].filter(Boolean).join(' '))) >= 0.25;
}

function coverageRecord(event) {
  if (!event || !clean(event.url)) return null;
  return {
    source: clean(event.source),
    url: clean(event.url),
    publishedAt: clean(event.publishedAt),
    date: clean(event.date) || editorialDay(event.publishedAt),
    title: titleOf(event),
    summary: clean(event.summary || event.dek || event.why || event.context),
  };
}

function mergeCoverage(...groups) {
  const byUrl = new Map();
  for (const group of groups.flat()) {
    const record = coverageRecord(group);
    if (!record) continue;
    const prior = byUrl.get(record.url);
    if (!prior || Date.parse(record.publishedAt) > Date.parse(prior.publishedAt)) byUrl.set(record.url, record);
  }
  return [...byUrl.values()].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
}

function coverageForDay(day, ...groups) {
  return mergeCoverage(...groups).filter((source) => {
    const sourceDay = clean(source.date) || editorialDay(source.publishedAt);
    return sourceDay === day;
  });
}

function preferred(a, b) {
  const timeA = publishedAt(a), timeB = publishedAt(b);
  if (timeA !== timeB) return timeA > timeB ? a : b;
  if (isFirstParty(a) !== isFirstParty(b)) return isFirstParty(a) ? a : b;
  const completeA = ['background', 'implications', 'next'].filter((field) => clean(a && a[field])).length;
  const completeB = ['background', 'implications', 'next'].filter((field) => clean(b && b[field])).length;
  if (completeA !== completeB) return completeA > completeB ? a : b;
  if ((a.importance || 0) !== (b.importance || 0)) return (a.importance || 0) > (b.importance || 0) ? a : b;
  if (hasImage(a) !== hasImage(b)) return hasImage(a) ? a : b;
  return a;
}

function groupEvents(events) {
  const groups = [];
  for (const event of events.filter(Boolean)) {
    const group = groups.find((candidate) => sameThread(candidate.event, event));
    const eventCoverage = coverageForDay(clean(event.date), event, event.coverage || []);
    if (!group) {
      groups.push({ event, coverage: eventCoverage, importance: event.importance || 0 });
      continue;
    }
    group.event = preferred(group.event, event);
    group.coverage = mergeCoverage(group.coverage, eventCoverage);
    group.importance = Math.max(group.importance || 0, event.importance || 0);
  }
  return groups.map((group) => ({ ...group, sourceCount: group.coverage.length || 1 }));
}

module.exports = {
  coverageForDay,
  coverageRecord,
  groupEvents,
  jaccard,
  mergeCoverage,
  normalize,
  sameThread,
};
