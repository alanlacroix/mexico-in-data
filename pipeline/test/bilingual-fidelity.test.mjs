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

// Exact rejected October 3 fields from edition-attempts.json. Lexical English
// negatives and their explicit Spanish equivalents preserve the same state.
for (const [english, spanish] of [
  [
    'Mexican officials are negotiating with the US to lower tariffs on light vehicles from 25% to 15%, with an effective rate of 10% to 12% after regional content discounts. Mexico is also pushing to reduce the 50% US tariffs on steel and aluminum, though the extent of potential cuts remains undetermined.',
    'Funcionarios mexicanos negocian con EU bajar aranceles a vehículos ligeros de 25% a 15%, con una tasa efectiva de 10% a 12% tras descuentos por contenido regional. México también busca reducir los aranceles de 50% de EU al acero y aluminio, aunque el alcance de posibles recortes sigue sin determinarse.',
  ],
  [
    'Watch whether Washington and Mexico finalize the interim agreement establishing the 15% nominal auto tariff, which would confirm the 10% to 12% effective rate or leave that and the metals tariff reductions unresolved.',
    'Habrá que observar si Washington y México concretan el acuerdo interino que establece el arancel nominal de 15% a autos, lo que confirmaría la tasa efectiva de 10% a 12% o dejaría sin resolver ese y los recortes de aranceles a metales.',
  ],
  [
    "The government's strategy targets a documented consumption loop where social platforms amplify attack planning and glorification. Disrupting content spread requires platform cooperation and enforcement capacity that remains untested in Mexico's regulatory environment.",
    'La estrategia del gobierno se enfoca en un ciclo de consumo documentado donde las plataformas amplifican la planificación y glorificación de ataques. Interrumpir la difusión de contenido requiere cooperación de plataformas y capacidad de cumplimiento que permanece sin probar en el ambiente regulatorio de México.',
  ],
  ['The capacity remains untested. The authority did not change the rules.',
    'La capacidad permanece sin probar. La autoridad no cambió las reglas.'],
  ['The outcome is unresolved while the size remains undetermined.',
    'El resultado sigue sin resolver mientras el tamaño sigue sin determinarse.'],
  ['The capacity remains untested and the issue is not resolved.',
    'La capacidad permanece sin probar y el asunto sigue sin resolver.'],
  ['The outcome remains unresolved.', 'El resultado sigue pendiente.'],
  ['The size remains undetermined.', 'El tamaño sigue indeterminado.'],
  ['The plan is unresolved and no deadline exists.',
    'El plan está sin resolver y no existe ninguna fecha límite.'],
]) assert.deepEqual(bilingualFidelityFlags({ english, spanish }), [], `${english} preserves its negative state`);

for (const [english, spanish] of [
  ['The capacity remains untested.', 'La capacidad permanece sin resolver.'],
  ['The capacity remains untested.', 'La capacidad permanece sin probar y no funciona.'],
  ['The capacity remains untested. The authority changed the rules.',
    'La capacidad permanece sin probar. La autoridad no cambió las reglas.'],
  ['The first system remains untested. The second system is tested.',
    'El primer sistema está probado. El segundo sistema permanece sin probar.'],
  ['The first system remains untested while the second system is tested.',
    'El primer sistema está probado mientras el segundo sistema permanece sin probar.'],
  ['The first system remains untested and the second system is tested.',
    'El primer sistema está probado y el segundo sistema permanece sin probar.'],
  ['The first system remains untested or the second system is tested.',
    'El primer sistema está probado o el segundo sistema permanece sin probar.'],
  ['The first issue is unresolved and the second issue is resolved.',
    'El primer asunto está resuelto y el segundo asunto sigue sin resolver.'],
  ['The first amount is undetermined and the second amount is determined.',
    'El primer monto está determinado y el segundo monto sigue sin determinarse.'],
  ['The capacity remains untested and the outcome is unresolved.',
    'La capacidad está probada y el resultado sigue sin resolver.'],
  ['The outcome remains unresolved while the size is undetermined.',
    'El resultado sigue sin determinarse mientras el tamaño sigue sin resolver.'],
  ['The outcome is unresolved and the size is undetermined.',
    'El resultado sigue sin determinarse y el tamaño sigue sin resolver.'],
  ['The capacity remains untested.',
    'La capacidad permanece sin probar y el sistema también está sin probar.'],
]) assert.ok(bilingualFidelityFlags({ english, spanish }).some((flag) => /negation|negated state/.test(flag)),
  `${english} must not exempt an unpaired, extra, changed, or ambiguously attached Spanish negative: ${spanish}`);
