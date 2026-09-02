// The topic-filtered reading shelf comes from the same atomic bilingual artifact
// as the lead edition. It cannot freeze, mix languages, or disagree with the Brief.

const fs = require('node:fs');
const path = require('node:path');
const { validateEdition } = require('../pipeline/lib/public-edition.cjs');

const FILE = path.join(__dirname, '..', 'data', 'edition.json');
const SECTIONS = [
  { key: 'economy', label: 'Economy & money', values: ['economy', 'money'] },
  { key: 'usmexico', label: 'US & Mexico', values: ['us-mexico'] },
  { key: 'politics', label: 'Politics', values: ['politics'] },
  { key: 'society', label: 'Security & society', values: ['security', 'society'] },
  { key: 'energy', label: 'Energy & infrastructure', values: ['energy'] },
  { key: 'deals', label: 'Deals & investment', values: ['deals'] },
  { key: 'payments', label: 'Payments & fintech', values: ['payments'] },
];

const dateLabel = (iso, withWeekday = false) => new Date(`${String(iso).slice(0, 10)}T12:00:00Z`)
  .toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', ...(withWeekday ? { weekday: 'short' } : {}),
  });

function loadEdition() {
  const edition = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const validation = validateEdition(edition);
  if (!validation.ok) throw new Error(`data/edition.json is invalid: ${validation.errors.join('; ')}`);
  return edition;
}

module.exports = function weeklyTop(locale = 'en') {
  const edition = loadEdition();
  const selected = new Set(edition.stories.map((story) => story.id));
  const rows = edition.weekStories.map((story) => {
    const section = SECTIONS.find((entry) => entry.values.includes(story.section)) || SECTIONS[0];
    const copy = story[locale] || story.en;
    return {
      id: story.id,
      title: copy.headline,
      dek: copy.dek,
      url: story.url,
      sourceName: story.source,
      source: story.source,
      domain: story.source,
      date: story.date,
      publishedAt: story.publishedAt,
      dateLabel: dateLabel(story.date),
      dayLabel: dateLabel(story.date, true),
      sourceLang: locale,
      originalTitle: '',
      shownToday: selected.has(story.id),
      interestTags: [],
      topic: section.key,
      topicLabel: section.label,
    };
  });
  const groups = SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    items: rows.filter((story) => story.topic === section.key).slice(0, 4),
  })).filter((group) => group.items.length);
  const start = edition.weekStories.map((story) => story.date).sort()[0] || edition.editorialDate;
  return {
    groups,
    weekLabel: `${dateLabel(start)} – ${dateLabel(edition.editorialDate)}`,
    totalWeek: rows.length,
  };
};
