import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFieldRepairPlan, mergeFieldRepairs, STORY_FIELDS } from '../lib/edition-field-repair.mjs';
import { deterministicDraftCheck } from '../build-edition.mjs';

// Exact rejected copy from the October 3 attempt. Keep the fixture here because
// the operational attempt ledger intentionally expires older records.
const rejected = {
  stage: 'deterministic', storyId: 'n-44bf7aedc147', reasons: [],
  fields: { dek: {
    en: 'Mexico reduced its regular gasoline subsidy from 72% to 63%, equivalent to 4.2 pesos per liter, for the week of October 3-9, 2026. The country has failed to collect the full diesel tax for four consecutive weeks while maintaining an additional subsidy of 0.6 pesos per liter.',
    es: 'México redujo su subsidio a la gasolina regular de 72% a 63%, equivalente a 4.2 pesos por litro, para la semana del 3 al 9 de octubre de 2026. El país ha dejado de recaudar el impuesto al diésel completo durante cuatro semanas consecutivas mientras mantiene un subsidio complementario de 0.6 pesos por litro.',
    refs: ['article'], reasons: ['47 words (cap 45)'],
  } },
};
assert.deepEqual(rejected.fields.dek.reasons, ['47 words (cap 45)']);
const fixture = JSON.parse(fs.readFileSync(new URL('../../data/editions/2026-10-01.json', import.meta.url))).stories[0];
const original = {
  ...fixture.en, es: structuredClone(fixture.es),
  ...Object.fromEntries(STORY_FIELDS.map(field => [`${field}Refs`, ['article']])),
};
original.dek = rejected.fields.dek.en;
original.es.dek = rejected.fields.dek.es;
const evidence = [{ id: 'article', text: [...Object.values(original.es), ...STORY_FIELDS.map(field => original[field])].join(' ') }];
const plan = createFieldRepairPlan([{ index: 2, evidence, draft: original, rejection: rejected }]);
assert.deepEqual(plan.targets.s2.fields, ['dek']);
assert.equal(plan.maxTokens, 360, 'reserve one bilingual field rather than five');
assert.deepEqual(plan.schema.properties.repairs.required, ['s2']);
assert.deepEqual(plan.schema.properties.repairs.properties.s2.required, ['dek']);
assert.deepEqual(plan.schema.definitions.field2.properties.refs.items.enum, ['article']);
assert.match(plan.schema.properties.repairs.properties.s2.properties.dek.description, /25–35 English words/);
assert.equal(plan.inputs[0].preservedFields.headline.en, original.headline);
assert.deepEqual(plan.inputs[0].repairFields.dek.current, {
  en: rejected.fields.dek.en, es: rejected.fields.dek.es, refs: rejected.fields.dek.refs,
});
const patch = {
  en: 'Mexico reduced its regular gasoline subsidy from 72% to 63%, equivalent to 4.2 pesos per liter, for October 3-9, 2026.',
  es: 'México redujo su subsidio a la gasolina regular de 72% a 63%, equivalente a 4.2 pesos por litro, para el 3-9 de octubre de 2026.',
  refs: ['article'],
};
const snapshot = structuredClone(original);
const merged = mergeFieldRepairs(plan, { repairs: { s2: { dek: patch } } });
assert.deepEqual(merged.errorsByIndex, {});
assert.ok(deterministicDraftCheck({ evidence }, original).includes('dek: 47 words (cap 45)'));
assert.ok(!deterministicDraftCheck({ evidence }, merged.stories.s2).some(flag => flag.startsWith('dek:')),
  'the actual October 3 overlong dek is repaired under the unchanged evidence gate');
for (const field of STORY_FIELDS.filter(field => field !== 'dek')) {
  assert.equal(merged.stories.s2[field], original[field]);
  assert.equal(merged.stories.s2.es[field], original.es[field]);
  assert.deepEqual(merged.stories.s2[`${field}Refs`], original[`${field}Refs`]);
}
assert.deepEqual(original, snapshot, 'planning and merging do not mutate the evaluated draft');
merged.stories.s2.backgroundRefs.push('tampered');
assert.deepEqual(original.backgroundRefs, ['article'], 'merged reference arrays do not alias the original');

for (const [name, response, pattern] of [
  ['passing field overwrite', { repairs: { s2: { dek: patch, headline: patch } } }, /unexpected field headline/],
  ['unknown index', { repairs: { s2: { dek: patch }, s99: { dek: patch } } }, /unexpected story keys s99/],
  ['invalid refs', { repairs: { s2: { dek: { ...patch, refs: ['invented'] } } } }, /invalid repair evidence references/],
  ['empty refs', { repairs: { s2: { dek: { ...patch, refs: [] } } } }, /invalid repair evidence references/],
  ['excess refs', { repairs: { s2: { dek: { ...patch, refs: ['article', 'article', 'article', 'article'] } } } }, /invalid repair evidence references/],
  ['missing field', { repairs: { s2: {} } }, /missing or invalid bilingual repair/],
  ['missing story', { repairs: {} }, /missing story patch/],
  ['missing response', null, /invalid or missing repairs response/],
  ['array patch', { repairs: { s2: [] } }, /missing story patch/],
  ['extra patch key', { repairs: { s2: { dek: { ...patch, enRefs: ['article'] } } } }, /missing or invalid bilingual repair/],
  ['extra root key', { repairs: { s2: { dek: patch } }, stories: {} }, /invalid or missing repairs response/],
]) {
  const result = mergeFieldRepairs(plan, response);
  assert.ok(result.errorsByIndex[2]?.some(error => pattern.test(error)), name);
  assert.deepEqual(result.stories.s2, original, `${name}: invalid patch never changes any original field`);
}

const missing = createFieldRepairPlan([{ index: 4, evidence,
  rejection: { reasons: ['model omitted the required story unit'], fields: {} } }]);
assert.deepEqual(missing.targets.s4.fields, STORY_FIELDS);
assert.equal(missing.maxTokens, 1400, 'missing units retain the previous per-story allowance');
const completePatch = Object.fromEntries(STORY_FIELDS.map(field => [field, {
  en: fixture.en[field], es: fixture.es[field], refs: ['article'],
}]));
const restored = mergeFieldRepairs(missing, { repairs: { s4: completePatch } });
assert.deepEqual(restored.errorsByIndex, {});
assert.deepEqual(restored.stories.s4.es, fixture.es);
assert.equal(mergeFieldRepairs(missing, { repairs: {} }).stories.s4, undefined,
  'missing patches cannot turn omitted units into empty complete stories');
const combined = createFieldRepairPlan([
  { index: 2, evidence, draft: original, rejection: rejected },
  { index: 4, evidence, rejection: { reasons: ['missing'], fields: {} } },
]);
assert.equal(combined.maxTokens, 1660, 'one batch pays field allowances plus framing only once');
assert.equal(combined.inputs.length, 2);
assert.equal(Object.keys(combined.schema.definitions).length, 1,
  'identical evidence ID sets share a schema definition instead of duplicating the bilingual object');
const independentResult = mergeFieldRepairs(combined, { repairs: { s2: { dek: patch }, s4: {} } });
assert.equal(independentResult.errorsByIndex[2], undefined, 'an invalid unit does not discard another valid repair');
assert.ok(independentResult.errorsByIndex[4]?.length, 'the invalid unit retains explicit errors');
assert.equal(independentResult.stories.s2.dek, patch.en);
assert.equal(independentResult.stories.s4, undefined);
assert.throws(() => createFieldRepairPlan([{ index: 0, evidence: [] }]), /no evidence IDs/);
assert.throws(() => createFieldRepairPlan([{ index: 0, evidence }, { index: 0, evidence }]), /Duplicate/);
assert.throws(() => createFieldRepairPlan([{ index: -1, evidence }]), /Invalid/);
assert.throws(() => createFieldRepairPlan([]), /requires rejected/);
console.log('edition field repair: ok');
