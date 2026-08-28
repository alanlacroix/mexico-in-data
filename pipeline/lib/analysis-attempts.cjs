'use strict';

const text = (value) => String(value || '').trim();

function mergeApprovedAttempt(previous = {}, proposed = {}, fields = []) {
  const merged = {};
  for (const field of fields) {
    const value = text(proposed[field]) || text(previous[field]);
    if (value) merged[field] = value;
  }
  return merged;
}

function analysisInputFingerprint(event = {}) {
  const primaryUrls = Array.isArray(event.analysisSources)
    ? event.analysisSources.filter((source) => source?.kind === 'primary')
      .map((source) => text(source.url)).filter(Boolean).sort()
    : [];
  return JSON.stringify({
    id: text(event.id), title: text(event.title), context: text(event.context), why: text(event.why),
    source: text(event.source), url: text(event.url), date: text(event.date),
    reportEvidence: event.reportEvidence || null,
    coverage: Array.isArray(event.coverage) ? event.coverage : [],
    primaryUrls,
  });
}

function analysisTargetSurvivesSelfHeal(before = [], after = [], target = {}, policy = '') {
  if (text(target.policy) !== text(policy) || !Array.isArray(target.ids) || !target.ids.length) return false;
  const oldById = new Map(before.map((event) => [text(event?.id), event]));
  const newById = new Map(after.map((event) => [text(event?.id), event]));
  return target.ids.every((rawId) => {
    const id = text(rawId);
    return id && oldById.has(id) && newById.has(id)
      && analysisInputFingerprint(oldById.get(id)) === analysisInputFingerprint(newById.get(id));
  });
}

module.exports = { analysisInputFingerprint, analysisTargetSurvivesSelfHeal, mergeApprovedAttempt };
