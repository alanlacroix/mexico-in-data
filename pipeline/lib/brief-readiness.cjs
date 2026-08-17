'use strict';

const arr = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value || '').trim();

function storyId(story, index) {
  return arr(story && story.refs)[0]
    || text(story && (story.h1 || story.headline))
    || `story-${index + 1}`;
}

function hasApprovedAnalysis(story) {
  const refs = story && story.analysisRefs;
  return Number(story && story.analysisV) >= 9
    && ['background', 'view', 'prediction'].every((field) => text(story && story[field]))
    && ['background', 'view', 'prediction'].every((field) => arr(refs && refs[field]).some(text))
    && arr(story && story.analysisSources).some((source) => source && source.kind !== 'article'
      && /^https:\/\//i.test(text(source.url)));
}

function briefReadiness(brief) {
  const stories = [brief && brief.lead, ...arr(brief && brief.items)].filter(Boolean);
  const targetStories = stories;
  const minimumReadyCount = targetStories.length;
  const missingTarget = targetStories
    .map((story, index) => ({ story, index }))
    .filter(({ story }) => !hasApprovedAnalysis(story))
    .map(({ story, index }) => storyId(story, index));
  const readyTargetCount = targetStories.length - missingTarget.length;
  // Zero stories is not a publishable edition. A quiet or temporarily unworkable
  // news cycle must preserve the last complete Brief instead of certifying an
  // empty homepage as "0 of 0 ready".
  const targetMet = stories.length > 0 && readyTargetCount === minimumReadyCount;
  const readyIds = stories
    .map((story, index) => ({ story, index }))
    .filter(({ story }) => hasApprovedAnalysis(story))
    .map(({ story, index }) => storyId(story, index));
  return {
    policy: 'every-selected-story-context-audited-v5',
    storyCount: stories.length,
    targetCount: targetStories.length,
    requiredCount: minimumReadyCount,
    readyCount: readyIds.length,
    readyTargetCount,
    readyIds,
    missingTarget,
    targetMet,
    publicationBlocking: !targetMet,
  };
}

module.exports = { briefReadiness, hasApprovedAnalysis };
