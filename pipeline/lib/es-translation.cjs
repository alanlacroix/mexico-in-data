const crypto = require('node:crypto');

const STORY_FIELDS = ['title', 'dek', 'bg', 'view', 'watch', 'why'];
const hash = (text) => crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 16);
const clean = (value) => String(value || '').trim();
const cached = (cache, value) => {
  const source = clean(value);
  return source ? clean(cache[hash(source)]) : '';
};

function criticalStrings(feed) {
  const strings = [];
  const push = (value) => { const source = clean(value); if (source) strings.push(source); };
  push(feed.brief);
  for (const story of feed.stories || []) for (const field of STORY_FIELDS) push(story[field]);
  return [...new Set(strings)];
}

function missingCritical(feed, cache) {
  return criticalStrings(feed).filter((source) => !cached(cache, source));
}

function translatedBriefSnapshot(feed, cache) {
  const missing = missingCritical(feed, cache);
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    snapshot: {
      version: 1,
      editorialDate: feed.date,
      updated: feed.updated,
      weekend: Boolean(feed.weekend),
      latestStoryDate: feed.latestStoryDate,
      brief: cached(cache, feed.brief),
      briefSources: feed.briefSources || [],
      stories: (feed.stories || []).map((story) => ({
        ...story,
        ...Object.fromEntries(STORY_FIELDS.map((field) => [field, cached(cache, story[field])])),
      })),
    },
  };
}

function resolveSpanishBrief(feed, cache, lastComplete) {
  const current = translatedBriefSnapshot(feed, cache);
  if (current.ok) return { ...current.snapshot, translationCarrying: false, missingCount: 0 };
  if (lastComplete?.brief && Array.isArray(lastComplete?.stories)) {
    return { weekend: false, ...lastComplete, translationCarrying: true, missingCount: current.missing.length };
  }
  // First-run safety: an empty Spanish section is honest; English copy under an
  // ES toggle is not. The next successful translation creates the snapshot.
  return {
    version: 1,
    editorialDate: feed.date,
    updated: feed.updated,
    weekend: false,
    latestStoryDate: '',
    brief: '',
    briefSources: [],
    stories: [],
    translationCarrying: true,
    missingCount: current.missing.length,
  };
}

module.exports = { STORY_FIELDS, hash, cached, criticalStrings, missingCritical, translatedBriefSnapshot, resolveSpanishBrief };
