const fs = require('node:fs');
const path = require('node:path');

const SECTION = {
  economy: { key: 'economy', label: 'Economy & business' },
  money: { key: 'economy', label: 'Economy & business' },
  politics: { key: 'politics', label: 'Politics' },
  security: { key: 'society', label: 'Society & security' },
  society: { key: 'society', label: 'Society & security' },
  'us-mexico': { key: 'us-mexico', label: 'U.S.–Mexico' },
};

const clean = (value) => String(value || '').trim();
const normalize = (value) => clean(value).toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, ' ').trim();
const keyFor = (event) => {
  const title = normalize(event.title);
  if (event.section === 'us-mexico' && /(usmca|ustr)/.test(title) && /(tariff|quota|rules? of origin|trade deficit|review|negotiat)/.test(title)) return `${event.date}:usmca-review`;
  return clean(event.url) || `${event.date}:${event.section}:${title}`;
};
const quality = (event) => (clean(event.background) ? 3 : 0) + (!/google news/i.test(clean(event.source)) ? 2 : 0);

module.exports = function () {
  let events = [];
  try { events = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'happening.json'), 'utf8')).events || []; }
  catch { return []; }

  let brief = {};
  try { brief = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'brief.json'), 'utf8')); }
  catch { brief = {}; }
  const briefEntries = [brief.lead, ...(Array.isArray(brief.items) ? brief.items : [])].filter(Boolean);
  const briefUrls = new Set(briefEntries.map((item) => clean(item.href || item.url)).filter(Boolean));
  const briefTitles = new Set(briefEntries.map((item) => normalize(item.h1 || item.headline || item.title)).filter(Boolean));

  const groups = new Map();
  events.forEach((event, index) => {
    if (!event || !event.title || !event.date) return;
    const key = keyFor(event);
    const current = groups.get(key);
    if (!current || quality(event) > quality(current.event)) groups.set(key, { event, index: current ? current.index : index });
  });

  return [...groups.values()]
    .sort((a, b) => String(b.event.date).localeCompare(String(a.event.date)) || b.event.importance - a.event.importance || a.index - b.index)
    .slice(0, 60)
    .map(({ event }) => {
      const section = SECTION[event.section] || SECTION.economy;
      return {
        date: clean(event.date),
        topic: section.key,
        topicLabel: section.label,
        title: clean(event.title).replace(/\.\s*$/, ''),
        summary: clean(event.summary || event.dek || event.why),
        // The four-part Briefly Explained, so "More headlines" shows the SAME structured
        // Context as the top stories (Alan 2026-07-17: apply it throughout). May be empty
        // until the pipeline's analysis pass reaches this story; `explanation` is the
        // one-line fallback (legacy entries only have `why`).
        bg: clean(event.background), drivers: clean(event.drivers), implications: clean(event.implications), next: clean(event.next),
        explanation: clean(event.explanation || event.background || event.why),
        source: clean(event.source),
        url: clean(event.url),
        inBrief: briefUrls.has(clean(event.url)) || briefTitles.has(normalize(event.title)),
      };
    });
};
