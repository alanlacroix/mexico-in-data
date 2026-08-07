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
  const requiredStories = stories.slice(0, Math.min(3, stories.length));
  const missingRequired = requiredStories
    .map((story, index) => ({ story, index }))
    .filter(({ story }) => !hasApprovedAnalysis(story))
    .map(({ story, index }) => storyId(story, index));
  const readyIds = stories
    .map((story, index) => ({ story, index }))
    .filter(({ story }) => hasApprovedAnalysis(story))
    .map(({ story, index }) => storyId(story, index));
  return {
    policy: 'top-three-explained-v1',
    storyCount: stories.length,
    requiredCount: requiredStories.length,
    readyCount: readyIds.length,
    readyIds,
    missingRequired,
    ok: stories.length === 0 || missingRequired.length === 0,
  };
}

module.exports = { briefReadiness, hasApprovedAnalysis };
