'use strict';

// The model supplies judgments for the five editorial criteria. Code owns the
// arithmetic and records how every value was normalized so a ranking can be
// audited later. Missing or malformed judgments add no importance.
const COMPONENT_KEYS = Object.freeze([
  'nationalConsequence',
  'usMexicoStakes',
  'modelImpact',
  'durability',
  'officialness',
]);

const RUBRIC_VERSION = 'five-component-v1';
const SCHEDULED_OUTCOME_KINDS = new Set(['decision', 'release']);

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function normalizeComponentScore(raw) {
  const supplied = raw !== undefined && raw !== null && raw !== '';
  const numeric = supplied && typeof raw !== 'boolean' ? Number(raw) : NaN;
  if (!Number.isFinite(numeric)) {
    return {
      raw,
      score: 0,
      status: supplied ? 'invalid-defaulted' : 'missing-defaulted',
    };
  }

  const rounded = Math.round(numeric);
  const score = Math.max(0, Math.min(2, rounded));
  let status = 'accepted';
  if (typeof raw === 'string') status = 'coerced';
  if (rounded !== numeric) status = status === 'coerced' ? 'coerced-rounded' : 'rounded';
  if (score !== rounded) status = status.startsWith('coerced') ? 'coerced-clamped' : 'clamped';
  return { raw, score, status };
}

function normalizeImportanceComponents(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const components = {};
  const componentProvenance = {};

  for (const key of COMPONENT_KEYS) {
    const normalized = normalizeComponentScore(own(source, key) ? source[key] : undefined);
    components[key] = normalized.score;
    componentProvenance[key] = normalized;
  }

  return { components, componentProvenance };
}

function sumComponents(components) {
  return COMPONENT_KEYS.reduce((total, key) => total + components[key], 0);
}

function scoreImportance(input = {}, provenance = {}) {
  const normalized = normalizeImportanceComponents(input);
  const rubricTotal = sumComponents(normalized.components);
  return {
    importance: rubricTotal,
    importanceComponents: normalized.components,
    importanceProvenance: {
      rubricVersion: RUBRIC_VERSION,
      calculatedTotal: rubricTotal,
      components: normalized.componentProvenance,
      ...provenance,
    },
  };
}

function validHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function scheduledOutcomeValidation(obligation) {
  if (!obligation || typeof obligation !== 'object' || Array.isArray(obligation)) {
    return { ok: false, reason: 'no-scheduled-obligation' };
  }
  const kind = String(obligation.kind || '').toLowerCase();
  if (!SCHEDULED_OUTCOME_KINDS.has(kind)) {
    return { ok: false, reason: 'unsupported-scheduled-kind' };
  }
  if (obligation.matched !== true || obligation.outcomeObserved !== true) {
    return { ok: false, reason: 'scheduled-outcome-not-matched' };
  }
  if (obligation.scheduleAuthoritative !== true && obligation.authoritative !== true) {
    return { ok: false, reason: 'scheduled-obligation-not-authoritative' };
  }
  const evidence = obligation.evidence;
  if (!evidence || typeof evidence !== 'object'
      || !String(evidence.source || '').trim()
      || !validHttpUrl(evidence.url)) {
    return { ok: false, reason: 'scheduled-outcome-missing-evidence' };
  }
  return {
    ok: true,
    kind,
    authoritativeEvidence: obligation.authoritativeEvidence === true || obligation.authoritative === true,
  };
}

function normalizeImportanceFloor(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(10, Math.round(numeric)));
}

// A primary-source outcome of a scheduled decision or release is a new event,
// even when the reported number or policy setting did not change. The schedule
// match may therefore supply two evidence-backed component floors:
//   durability = 2: this is the first outcome, not commentary or a re-report;
//   officialness = 2: an authoritative primary source is attached.
// A schedule owner may additionally set `importanceFloor` for an obligation it
// has already classified. That floor is applied only after all evidence checks.
function applyScheduledImportanceFloor(scored, obligation) {
  const base = scored && typeof scored === 'object' ? scored : scoreImportance({});
  const components = { ...base.importanceComponents };
  const componentProvenance = { ...(base.importanceProvenance?.components || {}) };
  const validation = scheduledOutcomeValidation(obligation);

  if (!validation.ok) {
    return {
      ...base,
      importanceComponents: components,
      importanceProvenance: {
        ...(base.importanceProvenance || {}),
        components: componentProvenance,
        scheduledOutcome: { applied: false, reason: validation.reason },
      },
    };
  }

  const adjustments = {};
  const componentFloors = validation.authoritativeEvidence ? ['durability', 'officialness'] : ['durability'];
  for (const key of componentFloors) {
    const previous = components[key];
    components[key] = Math.max(previous, 2);
    adjustments[key] = {
      previous,
      score: components[key],
      source: 'scheduled-outcome-evidence',
    };
    componentProvenance[key] = {
      ...(componentProvenance[key] || {}),
      score: components[key],
      scheduledFloor: { previous, score: components[key] },
    };
  }

  const calculatedTotal = sumComponents(components);
  const requestedFloor = normalizeImportanceFloor(obligation.importanceFloor);
  const importance = requestedFloor === null
    ? calculatedTotal
    : Math.max(calculatedTotal, requestedFloor);
  const evidence = {
    source: String(obligation.evidence.source).trim(),
    url: String(obligation.evidence.url).trim(),
  };
  if (obligation.evidence.publishedAt) evidence.publishedAt = obligation.evidence.publishedAt;

  return {
    ...base,
    importance,
    importanceComponents: components,
    importanceProvenance: {
      ...(base.importanceProvenance || {}),
      calculatedTotal,
      components: componentProvenance,
      scheduledOutcome: {
        applied: true,
        id: obligation.id || null,
        kind: validation.kind,
        scheduledFor: obligation.scheduledFor || null,
        outcomeStatus: obligation.outcomeStatus || null,
        isNewOutcome: true,
        changed: obligation.changed === true,
        evidence,
        componentFloors: adjustments,
        importanceFloor: {
          requested: requestedFloor,
          before: calculatedTotal,
          after: importance,
          applied: requestedFloor !== null && requestedFloor > calculatedTotal,
        },
      },
    },
  };
}

function normalizeModelImportanceRow(row = {}, options = {}) {
  const safeRow = row && typeof row === 'object' && !Array.isArray(row) ? row : {};
  const componentInput = safeRow.importanceComponents
    || safeRow.importance_components
    || safeRow;
  const scored = scoreImportance(componentInput, {
    reportedTotal: own(safeRow, 'importance') ? safeRow.importance : null,
    componentSource: 'model',
  });
  const normalized = options.scheduledObligation
    ? applyScheduledImportanceFloor(scored, options.scheduledObligation)
    : scored;
  return { ...safeRow, ...normalized };
}

module.exports = {
  COMPONENT_KEYS,
  RUBRIC_VERSION,
  normalizeComponentScore,
  normalizeImportanceComponents,
  scoreImportance,
  scheduledOutcomeValidation,
  applyScheduledImportanceFloor,
  normalizeModelImportanceRow,
};
