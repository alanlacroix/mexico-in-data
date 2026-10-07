import { unsupportedNumericTokens } from './lint.js';

export const STORY_FIELDS = Object.freeze(['headline', 'dek', 'background', 'view', 'watch']);

// Draft below the release ceilings so counting and translation have room. These
// are writing targets, never substitutes for the deterministic publication gate.
export const FIELD_REPAIR_CONTRACTS = Object.freeze({
  headline: 'Shortest accurate account. Aim for 8–14 English words and one sentence. Hard limits: 20 English words, 24 Spanish words, one sentence in each language.',
  dek: 'Add one sourced fact beyond the preserved headline. Aim for 25–35 English words and one sentence. Hard limits: 45 English words and two sentences; 65 Spanish words and three sentences.',
  background: 'Answer this story’s key explanatory question with sourced context, citing an independent record when supplied. Aim for 20–35 English words in one or two sentences. Hard limits: 55 English words, 65 Spanish words, three sentences in each language.',
  view: 'Explain the supported mechanism and consequence for people or the economy, including the evidence’s limits. Avoid generic advice. Aim for 20–35 English words in one or two sentences. Hard limits: 55 English words, 65 Spanish words, three sentences in each language.',
  watch: 'Name a sourced next decision, release or result and the observable test it resolves. Do not invent a milestone. Aim for 20–35 English words in one sentence. Hard limits: 55 English words, 65 Spanish words, three sentences in each language.',
});

// A missing story still gets exactly the former 1,300-token unit allowance.
// Partial repairs reserve only their output, without adding a model call.
const FIELD_TOKEN_ALLOWANCE = Object.freeze({ headline: 140, dek: 260, background: 300, view: 300, watch: 300 });
const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const fieldCopy = (draft, field) => ({
  en: typeof draft?.[field] === 'string' ? draft[field] : '',
  es: typeof draft?.es?.[field] === 'string' ? draft.es[field] : '',
  refs: Array.isArray(draft?.[`${field}Refs`]) ? structuredClone(draft[`${field}Refs`]) : [],
});

/**
 * entries: [{ index, evidence, draft, rejection }]
 * draft is the complete, mechanically repaired draft, including rejected fields.
 * rejection is its existing deterministic receipt. An omitted story has no draft.
 */
export function createFieldRepairPlan(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('Field repair requires rejected entries');
  const targets = {};
  const definitions = {};
  const definitionsByEvidence = new Map();
  const properties = {};
  const inputs = [];
  let maxTokens = 100;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry?.index) || entry.index < 0) throw new Error('Invalid field-repair story index');
    const key = `s${entry.index}`;
    if (owns(targets, key)) throw new Error(`Duplicate field-repair story index ${entry.index}`);
    const evidence = structuredClone(Array.isArray(entry.evidence) ? entry.evidence : []);
    const evidenceIds = [...new Set(evidence.map(record => record?.id).filter(id => typeof id === 'string' && id))];
    if (!evidenceIds.length) throw new Error(`Field repair ${key} has no evidence IDs`);
    const draft = object(entry.draft) ? structuredClone(entry.draft) : null;
    const rejected = object(entry.rejection?.fields) ? entry.rejection.fields : {};
    const hasGlobalRejection = Array.isArray(entry.rejection?.reasons) && entry.rejection.reasons.length > 0;
    let fields = STORY_FIELDS.filter(field => owns(rejected, field)
      || typeof draft?.[field] !== 'string' || typeof draft?.es?.[field] !== 'string'
      || !Array.isArray(draft?.[`${field}Refs`]));
    // Global/unknown failures cannot safely identify preserved fields.
    if (!draft || hasGlobalRejection || !fields.length) fields = [...STORY_FIELDS];
    targets[key] = { index: entry.index, fields, evidenceIds, draft };
    const evidenceKey = JSON.stringify([...evidenceIds].sort());
    const definition = definitionsByEvidence.get(evidenceKey) || `field${entry.index}`;
    definitionsByEvidence.set(evidenceKey, definition);
    definitions[definition] ||= {
      type: 'object', additionalProperties: false, required: ['en', 'es', 'refs'],
      properties: {
        en: { type: 'string', description: 'English replacement. Keep within 600 JSON UTF-8 bytes. Preserve cited quantities exactly.' },
        es: { type: 'string', description: 'Faithful Mexican-Spanish replacement. Keep within 600 JSON UTF-8 bytes. Preserve every actor, quantity, action, caveat and procedural stage.' },
        refs: { type: 'array', description: 'One to three exact evidence IDs supporting both languages.', items: { type: 'string', enum: evidenceIds } },
      },
    };
    properties[key] = {
      type: 'object', additionalProperties: false, required: fields,
      properties: Object.fromEntries(fields.map(field => [field, {
        $ref: `#/definitions/${definition}`, description: FIELD_REPAIR_CONTRACTS[field],
      }])),
    };
    inputs.push({
      i: entry.index,
      allowedNumericValues: unsupportedNumericTokens(evidence.map(record => record.text || '').join(' ')),
      evidence,
      repairFields: Object.fromEntries(fields.map(field => [field, {
        current: fieldCopy(draft, field),
        reasons: Array.isArray(rejected[field]?.reasons) ? rejected[field].reasons : entry.rejection?.reasons || ['Missing or rejected story unit'],
      }])),
      preservedFields: Object.fromEntries(STORY_FIELDS.filter(field => !fields.includes(field))
        .map(field => [field, fieldCopy(draft, field)])),
    });
    maxTokens += fields.reduce((sum, field) => sum + FIELD_TOKEN_ALLOWANCE[field], 0);
  }
  return {
    inputs, targets, maxTokens,
    schema: {
      type: 'object', additionalProperties: false, required: ['repairs'], definitions,
      properties: { repairs: { type: 'object', additionalProperties: false, required: Object.keys(targets), properties } },
    },
  };
}

/**
 * Returns complete story objects plus per-index patch errors. The caller MUST
 * include errorsByIndex[index] in deterministic rejection flags before audit.
 * Invalid units remain unchanged; unknown response indices reject every unit.
 */
export function mergeFieldRepairs(plan, response) {
  const stories = {};
  const errorsByIndex = {};
  const responseValid = object(response) && Object.keys(response).length === 1
    && owns(response, 'repairs') && object(response.repairs);
  const extraKeys = responseValid ? Object.keys(response.repairs).filter(key => !owns(plan.targets, key)) : [];
  for (const [key, target] of Object.entries(plan.targets)) {
    const errors = [];
    const original = target.draft ? structuredClone(target.draft) : { es: {} };
    if (target.draft) stories[key] = original;
    if (!responseValid) errors.push('repair: invalid or missing repairs response');
    if (extraKeys.length) errors.push(`repair: unexpected story keys ${extraKeys.join(', ')}`);
    const patch = responseValid && owns(response.repairs, key) ? response.repairs[key] : null;
    if (!object(patch)) errors.push('repair: missing story patch');
    else {
      for (const field of Object.keys(patch)) {
        if (!target.fields.includes(field)) errors.push(`repair: unexpected field ${field}`);
      }
      for (const field of target.fields) {
        const value = owns(patch, field) ? patch[field] : null;
        if (!object(value) || Object.keys(value).length !== 3
          || !['en', 'es', 'refs'].every(name => owns(value, name))
          || typeof value.en !== 'string' || typeof value.es !== 'string') {
          errors.push(`${field}: missing or invalid bilingual repair`);
          continue;
        }
        if (!Array.isArray(value.refs) || value.refs.length < 1 || value.refs.length > 3
          || value.refs.some(ref => !target.evidenceIds.includes(ref))) {
          errors.push(`${field}: invalid repair evidence references`);
        }
      }
    }
    if (errors.length) {
      errorsByIndex[target.index] = [...new Set(errors)];
      continue;
    }
    // A unit is merged only after every requested field passes the patch-shape
    // checks. Existing prose, refs and metadata outside this whitelist are exact.
    if (!object(original.es)) original.es = {};
    for (const field of target.fields) {
      original[field] = patch[field].en;
      original.es[field] = patch[field].es;
      original[`${field}Refs`] = structuredClone(patch[field].refs);
    }
    stories[key] = original;
  }
  return { stories, errorsByIndex };
}
