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
  // A dated quiet edition is a valid, honest state. It contains no explanation
  // controls, so "0 of 0" is complete only when the Brief explicitly says it is quiet.
  const targetMet = stories.length
    ? readyTargetCount === minimumReadyCount
    : brief?.meta?.quiet === true;
  const readyIds = stories
    .map((story, index) => ({ story, index }))
    .filter(({ story }) => hasApprovedAnalysis(story))
    .map(({ story, index }) => storyId(story, index));
  return {
    policy: 'all-selected-analysis-target-v6',
    storyCount: stories.length,
    targetCount: targetStories.length,
    requiredCount: minimumReadyCount,
    readyCount: readyIds.length,
    readyTargetCount,
    readyIds,
    missingTarget,
    targetMet,
    // Briefly Explained is the product contract, not optional decoration. A factual
    // card without its complete evidence-linked unit may remain in the reading feed,
    // but it cannot be certified as part of the Brief.
    publicationBlocking: !targetMet,
  };
}

module.exports = { briefReadiness, hasApprovedAnalysis };
