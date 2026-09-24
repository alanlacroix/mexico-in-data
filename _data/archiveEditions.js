const fs = require('node:fs');
const path = require('node:path');
const { loadHistory, editionPath } = require('../pipeline/lib/edition-history.cjs');

module.exports = function () {
  const current = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/edition.json'), 'utf8'));
  return loadHistory({ current }).flatMap(edition => ['en', 'es'].map(locale => ({
    edition, locale, url: editionPath(edition.editorialDate, locale),
    alternateUrl: editionPath(edition.editorialDate, locale === 'en' ? 'es' : 'en'),
    title: edition.stories[0][locale].headline,
    stories: edition.stories.map(story => ({
      id: story.id,
      sources: story.evidence,
      editorial: story.editorial ? { timeline: story.editorial.timeline.map(step => ({ ...step[locale], sources: step.refs.map(id => story.evidence.find(item => item.id === id)) })), margin: story.editorial.margin[locale], marginSources: story.editorial.margin.refs.map(id => story.evidence.find(item => item.id === id)) } : null,
      cat: locale === 'es' ? 'Archivo' : 'Archive', date: story.date,
      title: story[locale].headline, dek: story[locale].dek,
      view: story[locale].view, bg: story[locale].background, watch: story[locale].watch,
      url: story.url, source: story.source, analysisSources: story.evidence,
    })),
    minutes: Math.max(1, Math.ceil(edition.stories.reduce((total, story) =>
      total + [...Object.values(story[locale]), ...(story.editorial?.timeline || []).flatMap(step => Object.values(step[locale])), story.editorial?.margin?.[locale] || ''].join(' ').split(/\s+/).length, 0) / 200)),
  })));
};
