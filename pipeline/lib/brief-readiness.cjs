'use strict';

const arr = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value || '').trim();

function storyId(story, index) {
  return arr(story && story.refs)[0]
    || text(story && (story.h1 || story.headline))
    || `story-${index + 1}`;
}

function hasApprovedAnalysis(story) {
  return Number(story && story.analysisV) >= 7
    && ['background', 'view', 'prediction'].every((field) => text(story && story[field]));
}

function briefReadiness(brief) {
  const stories = [brief && brief.lead, ...arr(brief && brief.items)].filter(Boolean);
  const targetStories = stories.slice(0, Math.min(3, stories.length));
  const minimumReadyCount = Math.min(2, targetStories.length);
  const missingTarget = targetStories
    .map((story, index) => ({ story, index }))
    .filter(({ story }) => !hasApprovedAnalysis(story))
    .map(({ story, index }) => storyId(story, index));
  const readyTargetCount = targetStories.length - missingTarget.length;
  // Explanation coverage is a quality target, not a publication dependency. The
  // factual Brief is the product's heartbeat; holding verified news hostage when
  // the optional model is unavailable makes a degraded extra take down the core.
  const targetMet = stories.length === 0 || readyTargetCount >= minimumReadyCount;
  const readyIds = stories
    .map((story, index) => ({ story, index }))
    .filter(({ story }) => hasApprovedAnalysis(story))
    .map(({ story, index }) => storyId(story, index));
  return {
    policy: 'two-of-top-three-explained-advisory-v3',
    storyCount: stories.length,
    targetCount: targetStories.length,
    requiredCount: minimumReadyCount,
    readyCount: readyIds.length,
    readyTargetCount,
    readyIds,
    missingTarget,
    targetMet,
    publicationBlocking: false,
  };
}

module.exports = { briefReadiness, hasApprovedAnalysis };
