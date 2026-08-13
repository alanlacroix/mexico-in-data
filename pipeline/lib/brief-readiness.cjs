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
  return Number(story && story.analysisV) >= 8
    && ['background', 'view', 'prediction'].every((field) => text(story && story[field]))
    && ['background', 'view', 'prediction'].every((field) => arr(refs && refs[field]).some(text))
    && arr(story && story.analysisSources).some((source) => /^https:\/\//i.test(text(source && source.url)));
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
  const targetMet = stories.length === 0 || readyTargetCount === minimumReadyCount;
  const readyIds = stories
    .map((story, index) => ({ story, index }))
    .filter(({ story }) => hasApprovedAnalysis(story))
    .map(({ story, index }) => storyId(story, index));
  return {
    policy: 'every-selected-story-evidence-linked-v4',
    storyCount: stories.length,
    targetCount: targetStories.length,
    requiredCount: minimumReadyCount,
    readyCount: readyIds.length,
    readyTargetCount,
    readyIds,
    missingTarget,
    targetMet,
    publicationBlocking: stories.length > 0 && !targetMet,
  };
}

module.exports = { briefReadiness, hasApprovedAnalysis };
