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

function analysisTargetSurvivesSelfHeal(before = [], after = [], target = {}, policy = '', repairPredecessor = '') {
  const acceptedPolicy = text(target.policy) === text(policy)
    || (text(target.policy) === text(repairPredecessor) && text(repairPredecessor)
      && (Number(target.attempt) || 1) >= 2);
  if (!acceptedPolicy || !Array.isArray(target.ids) || !target.ids.length) return false;
  const oldById = new Map(before.map((event) => [text(event?.id), event]));
  const newById = new Map(after.map((event) => [text(event?.id), event]));
  return target.ids.every((rawId) => {
    const id = text(rawId);
    return id && oldById.has(id) && newById.has(id)
      && analysisInputFingerprint(oldById.get(id)) === analysisInputFingerprint(newById.get(id));
  });
}

function dropUnsupportedNumberSentences(value = '', flags = []) {
  const reasons = Array.isArray(flags) ? flags : [];
  if (!reasons.length || reasons.some((flag) => !/^unsupported numbers?:/i.test(String(flag || '')))) return '';
  const rejected = new Set(reasons.flatMap((flag) => {
    const match = String(flag || '').match(/^unsupported numbers?:\s*(.+)$/i);
    return match ? match[1].split(',').map((token) => token.trim().replace(',', '.')).filter(Boolean) : [];
  }));
  if (!rejected.size) return '';
  const original = text(value);
  // Decimal points are not sentence boundaries. Protect them during the small,
  // deterministic split and restore them before re-validating the surviving prose.
  const protectedValue = original.replace(/(\d)\.(\d)/g, '$1\uE000$2');
  const sentences = (protectedValue.match(/[^.!?]+(?:[.!?]+|$)/g) || [])
    .map((sentence) => sentence.replace(/\uE000/g, '.'));
  const kept = sentences.filter((sentence) => {
    const numbers = (sentence.match(/\d+(?:[.,]\d+)*/g) || []).map((token) => token.replace(',', '.'));
    return !numbers.some((number) => rejected.has(number));
  }).map(text).filter(Boolean).join(' ');
  return kept && kept !== original ? kept : '';
}

function nextAnalysisAttempt(priorTarget = {}, selectedIds = [], policy = '', repairPredecessor = '') {
  const sameIds = JSON.stringify(Array.isArray(priorTarget.ids) ? priorTarget.ids : [])
    === JSON.stringify(Array.isArray(selectedIds) ? selectedIds : []);
  const samePolicy = sameIds && text(priorTarget.policy) === text(policy);
  const oneShotRepairMigration = Boolean(sameIds
    && text(priorTarget.policy) === text(repairPredecessor)
    && text(repairPredecessor)
    && (Number(priorTarget.attempt) || 1) >= 2);
  return {
    attempt: oneShotRepairMigration ? 2
      : samePolicy ? Math.max(1, Number(priorTarget.attempt) || 1) + 1 : 1,
    reuseOutcomes: samePolicy || oneShotRepairMigration,
  };
}

module.exports = {
  analysisInputFingerprint,
  analysisTargetSurvivesSelfHeal,
  dropUnsupportedNumberSentences,
  mergeApprovedAttempt,
  nextAnalysisAttempt,
};
