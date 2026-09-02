import assert from 'node:assert/strict';
import bilingualFidelity from '../lib/bilingual-fidelity.cjs';

const { bilingualFidelityFlags } = bilingualFidelity;

const valid = bilingualFidelityFlags({
  english: 'Banxico did not change its 6.50% rate in September.',
  spanish: 'Banxico no cambió su tasa de 6.50% en septiembre.',
  evidence: ['Banco de México left the rate at 6.50%.'],
});
assert.deepEqual(valid, []);

assert.ok(bilingualFidelityFlags({
  english: "Mexico's electricity utility plans new investment.",
  spanish: 'Banxico aprobó una reforma definitiva.',
  evidence: ['The electricity utility plans new investment.'],
}).some((flag) => /Banxico|completed action/i.test(flag)));

assert.ok(bilingualFidelityFlags({
  english: 'The proposal would reduce the fee.',
  spanish: 'La autoridad redujo la comisión.',
  evidence: ['A draft proposes a lower fee.'],
}).some((flag) => /proposal/i.test(flag)));

assert.ok(bilingualFidelityFlags({
  english: 'The rate did not change.', spanish: 'La tasa cambió.', evidence: ['The rate did not change.'],
}).some((flag) => /negation/i.test(flag)));

for (const [english, spanish] of [
  ['Exports rose 12.3%.', 'Las exportaciones cayeron 12.3%.'],
  ['CFE plans to increase private investment.', 'CFE planea reducir la inversión privada.'],
  ['The court upheld the rule.', 'El tribunal anuló la regla.'],
  ['Banxico raised its policy rate to 7%.', 'Banxico recortó su tasa de política a 7%.'],
]) {
  assert.ok(bilingualFidelityFlags({ english, spanish, evidence: [english] })
    .some((flag) => /direction reversed/i.test(flag)), `${english} must not reverse to ${spanish}`);
}

assert.deepEqual(bilingualFidelityFlags({
  english: 'Exports rose while imports fell.',
  spanish: 'Las exportaciones subieron mientras las importaciones cayeron.',
  evidence: ['Exports rose while imports fell.'],
}), []);
assert.deepEqual(bilingualFidelityFlags({
  english: 'While imports fell, exports rose.',
  spanish: 'Las exportaciones subieron, mientras las importaciones cayeron.',
  evidence: ['While imports fell, exports rose.'],
}), [], 'faithful clause reordering must not be rejected');

for (const [english, spanish] of [
  ['The peso strengthened.', 'El peso se debilitó.'],
  ['The government expanded the program.', 'El gobierno eliminó el programa.'],
]) {
  assert.ok(bilingualFidelityFlags({ english, spanish, evidence: [english] }).length,
    `${english} must not reverse to ${spanish}`);
}

console.log('bilingual-fidelity tests: ok');
