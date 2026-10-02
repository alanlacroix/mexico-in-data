import assert from 'node:assert/strict';
import bilingualFidelity from '../lib/bilingual-fidelity.cjs';

const { bilingualFidelityFlags } = bilingualFidelity;

// The October 2 customs-law source names the Chamber of Deputies' Comisión de
// Hacienda. It must not be mistaken for SHCP at the evidence-free artifact gate.
// These are constructed regressions, not the unavailable failed model output.
for (const [english, spanish] of [
  ["The Chamber of Deputies' Finance Committee sent the bill to the full chamber.",
    'La Comisión de Hacienda de la Cámara de Diputados envió el dictamen al pleno.'],
  ['The Finance and Public Credit Committee discussed the customs bill.',
    'La Comisión de Hacienda y Crédito Público discutió el dictamen aduanero.'],
  ['The finance ministry submitted its report to the Finance Committee.',
    'Hacienda entregó su informe a la Comisión de Hacienda.'],
]) assert.deepEqual(bilingualFidelityFlags({ english, spanish }), [], 'committee/ministry identity survives without evidence text');

// Exact October 2 curated fallback wording, including its committee-name gloss.
assert.deepEqual(bilingualFidelityFlags({
  english: "The lower house's Finance Committee (Hacienda) approved changes targeting undervalued imports and fuel smuggling on Thursday, Bloomberg Línea reports. The bill goes to the Chamber of Deputies for discussion next week.",
  spanish: 'La Comisión de Hacienda aprobó el jueves cambios contra la subvaluación de importaciones y el contrabando de combustibles, informa Bloomberg Línea. El dictamen pasa al pleno de la Cámara de Diputados para su discusión la próxima semana.',
}), []);

for (const [english, spanish, expected] of [
  ['The finance ministry sent the bill.', 'La Comisión de Hacienda envió el dictamen.', /hacienda was dropped/],
  ['The Finance Committee sent the bill.', 'Hacienda envió el dictamen.', /hacienda was introduced/],
  ['The Finance Committee sent the bill.', 'SHCP envió el dictamen.', /hacienda was introduced/],
  ['The Finance Committee (Hacienda) sent the bill.', 'SHCP envió el dictamen.', /hacienda was introduced/],
  ['The committee sent the bill.', 'La Comisión de Hacienda envió el dictamen.', /finance committee was introduced/],
  ['The Finance Committee discussed the bill.', 'La comisión discutió el dictamen.', /finance committee was dropped/],
  ['The finance ministry submitted its report to the Finance Committee.',
    'La Comisión de Hacienda recibió el informe.', /hacienda was dropped/],
]) assert.ok(bilingualFidelityFlags({ english, spanish }).some(flag => expected.test(flag)), `${english} must reject actor substitution or loss`);

const valid = bilingualFidelityFlags({
  english: 'Banxico did not change its 6.50% rate in September.',
  spanish: 'Banxico no cambió su tasa de 6.50% en septiembre.',
  evidence: ['Banco de México left the rate at 6.50%.'],
});
assert.deepEqual(valid, []);

// Reporting phrases from rejected edition attempts must not be mistaken for
// uncertainty, extra negation, or an already completed legislative action.
for (const [english, spanish] of [
  ['Diesel production has remained flat since May 2025.', 'La producción de diésel se ha mantenido estable desde mayo de 2025.'],
  ['Inflation reached 3% in May 2020.', 'La inflación llegó a 3% en mayo de 2020.'],
  ['Exports rose in May.', 'Las exportaciones subieron en mayo.'],
  ['Pemex officials could not be reached for comment.', 'Los funcionarios de Pemex no pudieron ser contactados para comentar.'],
  ['Non-automotive exports rose 45%.', 'Las exportaciones no automotrices subieron 45%.'],
  ['Non-oil exports rose.', 'Las exportaciones no petroleras subieron.'],
  ['If approved as written, the proposal would change the system.', 'Si se aprueba como está redactada, la propuesta cambiaría el sistema.'],
  ['If approved, the rule takes effect in October.', 'Si se aprueba, la regla entra en vigor en octubre.'],
]) {
  assert.deepEqual(bilingualFidelityFlags({ english, spanish }), [], `${english} is translated faithfully`);
}

for (const [english, spanish, expectedFlag] of [
  ['Production may rise.', 'La producción subió.', /proposal or uncertainty/],
  ['Production may rise in May 2025.', 'La producción subió en mayo de 2025.', /proposal or uncertainty/],
  ['Officials could not be reached, but output could rise.', 'Los funcionarios no pudieron ser contactados, pero la producción subió.', /proposal or uncertainty/],
  ['Non-automotive exports rose.', 'Las exportaciones automotrices subieron.', /negation was dropped/],
  ['Automotive exports rose.', 'Las exportaciones no automotrices subieron.', /negation was introduced/],
  ['The rule was approved.', 'La regla se podría aprobar.', /completed action became non-final/],
  ['If approved, the rule takes effect in October.', 'La regla fue aprobada y entra en vigor en octubre.', /completed action was introduced/],
  ['The rule was approved; if approved, the amendment takes effect in October.', 'La regla se podría aprobar; si se aprueba, la enmienda entra en vigor en octubre.', /completed action became non-final/],
  ['Exports rose in May 2025.', 'Las exportaciones subieron en junio de 2025.', /may was changed or dropped/],
]) {
  assert.ok(bilingualFidelityFlags({ english, spanish }).some((flag) => expectedFlag.test(flag)),
    `${english} must still reject ${spanish}`);
}

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

assert.deepEqual(bilingualFidelityFlags({
  english:'A stronger peso lowers import costs. The morning rise offers relief.',
  spanish:'Un peso más fuerte reduce el costo de las importaciones. El avance matutino ofrece alivio.',
}), [], 'mixed-direction context must recognize lowers as well as lower');
assert.ok(bilingualFidelityFlags({english:'The price is rising.',spanish:'El precio baja.'}).some(flag=>flag.includes('direction reversed')));

assert.deepEqual(bilingualFidelityFlags({english:'Trade under USMCA continues.',spanish:'El comercio bajo el T-MEC continúa.'}),[]);
assert.deepEqual(bilingualFidelityFlags({english:'Operators use unregistered servers.',spanish:'Los operadores usan servidores no registrados.'}),[]);
assert.ok(bilingualFidelityFlags({english:'Operators use registered servers.',spanish:'Los operadores usan servidores no registrados.'}).some(flag=>flag.includes('negation')));
assert.ok(bilingualFidelityFlags({english:'Operators use unregistered servers.',spanish:'Los operadores usan servidores registrados.'}).some(flag=>flag.includes('negation')));
