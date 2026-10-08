'use strict';

// Split only generated context whose exact source fields are still available.
// Older, independently authored weekly explanations retain their original text.
function weeklyReading(item, stories, locale) {
  if (!['en', 'es'].includes(locale) || !Array.isArray(stories)) return null;
  const matches = stories.filter(story => story.id === item?.id);
  if (matches.length !== 1) return null;
  const copy = matches[0][locale];
  if (!copy?.background || !copy?.view ||
      item?.[locale]?.context !== `${copy.background} ${copy.view}`.trim() ||
      item[locale].reason !== copy.view) return null;
  return { background: copy.background, view: copy.view };
}

function uniqueSourceLinks(sources) {
  const seen = new Set();
  return (Array.isArray(sources) ? sources : []).filter(source => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

module.exports = { weeklyReading, uniqueSourceLinks };
