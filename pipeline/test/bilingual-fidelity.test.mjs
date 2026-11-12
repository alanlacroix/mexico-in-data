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

// November 4 failed-attempt fields: exact observed lexical equivalences, not
// approval of the candidate or a substitute for its independent evidence audit.
for (const [english, spanish] of [
  ['Experts said a Democratic-controlled US Congress after November 3 midterms could harden border security and crime stances, while Trump keeps wide tariff powers. Integralia said USMCA review risks continue regardless of the election outcome.',
    'Expertos dijeron que un Congreso de EU controlado por demócratas tras las elecciones del 3 de noviembre podría endurecer posturas de seguridad fronteriza y crimen, mientras Trump conserva amplias facultades arancelarias. Integralia dijo que los riesgos de la revisión del T-MEC continúan sin importar el resultado electoral.'],
  ["The law makes internet providers liable for copyright infringement unless they remove flagged content, pushing them to take down material quickly. Opposition senators warned this incentive could let platforms or officials suppress legitimate posts, investigations or criticism, though the reform's real effect on speech remains untested.",
    'La ley hace responsables a los proveedores de internet por infracciones de derechos de autor a menos que retiren el contenido señalado, lo que los empuja a eliminar material rápidamente. Senadores opositores advirtieron que este incentivo podría permitir suprimir publicaciones legítimas, investigaciones o críticas, aunque el efecto real de la reforma sobre la libertad de expresión aún no se ha probado.'],
  ['The review proceeds regardless of the midterm outcome.',
    'La revisión sigue su curso sin importar el resultado de las elecciones intermedias.'],
  ['The effect remains untested.', 'El efecto aún no se ha probado.'],
]) assert.deepEqual(bilingualFidelityFlags({ english, spanish }), [], `${english} preserves the observed lexical equivalence`);

for (const [english, spanish, expected] of [
  ['The review proceeds regardless of the election outcome.',
    'La revisión no continúa sin importar el resultado electoral.', /negation/],
  ['The review proceeds regardless of the election outcome.',
    'La revisión continúa sin evaluar el resultado electoral.', /negation/],
  ['The review proceeds regardless of costs.',
    'La revisión continúa sin importar el resultado electoral.', /negation/],
  ['The review proceeds regardless of the election outcome.',
    'La revisión continúa sin importar los costos.', /negation/],
  ['The review proceeds regardless of the election outcome.',
    'La revisión continúa sin importar el resultado de las elecciones intermedias.', /negation/],
  ['The review proceeds.', 'La revisión continúa sin importar el resultado electoral.', /negation/],
  ['The review does not proceed.', 'La revisión continúa.', /negation was dropped/],
  ['The review proceeds regardless of the election outcome. The fee changes.',
    'La revisión continúa. La comisión cambia sin importar el resultado electoral.', /negation/],
  ['The review proceeds regardless of the election outcome while the fee changes.',
    'La revisión continúa mientras la comisión cambia sin importar el resultado electoral.', /negation/],
  ['The review proceeds regardless of the election outcome and the fee depends on costs.',
    'La revisión continúa dependiendo de los costos y la comisión cambia sin importar el resultado electoral.', /negation/],
  ['The review proceeds regardless of the election outcome.',
    'La revisión continúa sin importar el resultado electoral y sin importar el resultado electoral.', /negation/],
  ['The effect remains untested.', 'El efecto aún no se ha probado eficaz.', /negation/],
  ['The effect remains untested.', 'El efecto nunca se ha probado.', /negation/],
  ['The effect remains untested.', 'El efecto no se probará.', /negation/],
  ['The effect remains untested.', 'El efecto aún no se ha resuelto.', /negation/],
  ['The effect remains untested.', 'El efecto aún no se ha probado y no funciona.', /negation/],
  ['The effect remains untested. The method works.',
    'El efecto aún no se ha probado. El método no funciona.', /negation/],
  ['The effect remains untested. The method is tested.',
    'El efecto está probado. El método aún no se ha probado.', /negation/],
  ['The effect remains untested and the method is tested.',
    'El efecto está probado y el método aún no se ha probado.', /negation/],
  ['The effect remains untested while the method is tested.',
    'El efecto está probado mientras el método aún no se ha probado.', /negation/],
  ['The effect remains untested. Banxico could change the rule.',
    'El efecto aún no se ha probado. Banxico cambió la regla.', /proposal or uncertainty/],
  ['Banxico reports the effect remains untested.',
    'Hacienda informa que el efecto aún no se ha probado.', /banxico was dropped|hacienda was introduced/],
  ['The effect remains untested. The proposal could proceed regardless of the election outcome.',
    'El efecto aún no se ha probado. La reforma fue aprobada sin importar el resultado electoral.', /proposal or uncertainty|completed action/],
]) assert.ok(bilingualFidelityFlags({ english, spanish }).some((flag) => expected.test(flag)),
  `${english} must still reject: ${spanish}`);

for (const [english, spanish] of [
  ['The fee changes because the review proceeds regardless of the election outcome.',
    'La revisión continúa porque la comisión cambia sin importar el resultado electoral.'],
  ['The method works because the effect remains untested.',
    'El efecto funciona porque el método aún no se ha probado.'],
  ['The method works since the effect remains untested.',
    'El efecto funciona ya que el método aún no se ha probado.'],
  ['The fee changes and the review proceeds regardless of the election outcome.',
    'La revisión continúa y la comisión cambia sin importar el resultado electoral.'],
  ['The method works and the effect remains untested.',
    'El efecto funciona y el método aún no se ha probado.'],
  ['The effect remains untested because the method works.',
    'El efecto funciona porque el método aún no se ha probado.'],
  ['The review proceeds regardless of the election outcome because the fee changes.',
    'La revisión continúa porque la comisión cambia sin importar el resultado electoral.'],
  ['The review proceeds regardless of the election outcome and the fee changes.',
    'La revisión continúa y la comisión cambia sin importar el resultado electoral.'],
  ['The review proceeds regardless of the election outcome, the fee changes.',
    'La revisión continúa, la comisión cambia sin importar el resultado electoral.'],
  ['The review proceeds regardless of the election outcome: the fee changes.',
    'La revisión continúa: la comisión cambia sin importar el resultado electoral.'],
  ['The effect remains untested and the method works.',
    'El efecto funciona y el método aún no se ha probado.'],
  ['The effect remains untested, the method works.',
    'El efecto funciona, el método aún no se ha probado.'],
  ['The review proceeds and the fee changes regardless of the election outcome.',
    'La revisión continúa sin importar el resultado electoral y la comisión cambia.'],
]) assert.ok(bilingualFidelityFlags({ english, spanish }).some((flag) => /negation/.test(flag)),
  `${english} must not move the new modifier/state to a coordinated subject`);

console.log('bilingual-fidelity tests: ok');

// November 10 retained repair: nominal investment plan, not "plans to invest".
const allocationEn = 'The fund allocates 30% of its 200 million dollar three-year plan to infrastructure and energy projects, 25% each to venture capital and growth capital for mid-sized companies, and 20% to private credit. Management stated opportunities exceed available resources by 11 times.';
const allocationEs = 'El fondo asigna 30% de su plan de inversión de 200 millones de dólares en tres años a proyectos de infraestructura y energía, 25% cada uno a capital de riesgo y capital de crecimiento para empresas medianas, y 20% a crédito privado. La dirección afirmó que las oportunidades superan en 11 veces los recursos disponibles.';
assert.deepEqual(bilingualFidelityFlags({ english: allocationEn, spanish: allocationEs }), []);
assert.deepEqual(bilingualFidelityFlags({
  english: 'The fund will allocate 25% of its investment plan to innovation and venture capital.',
  spanish: 'El fondo asignará 25% de su plan de inversión a innovación y capital de riesgo.',
}), []);
for (const [english, spanish, expected] of [
  [allocationEn + ' It may expand.', allocationEs + ' Se expande.', /proposal or uncertainty/],
  [allocationEn + ' It plans to invest.', allocationEs + ' Invierte.', /proposal or uncertainty/],
  [allocationEn.replace('allocates', 'could allocate'), allocationEs, /proposal or uncertainty/],
  ['The fund allocates 30% of its plan to invest in infrastructure.', 'El fondo asigna 30% a infraestructura.', /proposal or uncertainty/],
  ['The fund plans to invest in infrastructure.', 'El fondo invierte en infraestructura.', /proposal or uncertainty/],
  [allocationEn, allocationEs.replace('30%', '40%'), /numbers changed/],
  [allocationEn, allocationEs + ' Fue aprobado.', /completed action was introduced/],
  [allocationEn + ' It did not invest.', allocationEs + ' Invirtió.', /negation was dropped/],
  [allocationEn + ' Banxico participates.', allocationEs, /banxico was dropped/],
  [allocationEn + ' Returns rose.', allocationEs + ' Los rendimientos cayeron.', /direction reversed/],
]) assert.ok(bilingualFidelityFlags({ english, spanish }).some(flag => expected.test(flag)), english);

// November 12: association in English must not become a causal Spanish claim.
const causalFlag = 'association became causation in Spanish';
for (const [english, spanish] of [
  ['Sugary drinks linked to 40,000 deaths yearly in Mexico', 'Bebidas azucaradas causan 40,000 muertes al año en México'],
]) assert.ok(bilingualFidelityFlags({english, spanish}).includes(causalFlag));
for (const [english, spanish] of [
  ['Exposure is associated with disease.', 'La exposición provoca enfermedades.'],
  ['Consumption is tied to deaths.', 'El consumo ocasiona muertes.'],
  ['Exposure is linked to disease. Pollution causes harm.', 'La exposición causa enfermedades. La contaminación causa daños.'],
]) assert.ok(bilingualFidelityFlags({english, spanish}).includes(causalFlag), english);
for (const [english, spanish] of [
  ['Sugary drinks linked to 40,000 deaths yearly in Mexico', 'Bebidas azucaradas vinculadas con 40,000 muertes anuales en México'],
  ['Exposure is associated with disease.', 'La exposición está relacionada con enfermedades.'],
  ['Exposure causes disease.', 'La exposición causa enfermedades.'],
  ['Exposure is linked to disease, but it is not a proven cause.', 'La exposición está vinculada a enfermedades, pero no es una causa probada.'],
  ['Exposure is linked to disease. Pollution causes harm.', 'La exposición está vinculada a enfermedades. La contaminación causa daños.'],
]) assert.ok(!bilingualFidelityFlags({english, spanish}).includes(causalFlag), english);
assert.ok(bilingualFidelityFlags({
  english: 'Sugary drinks linked to 40,000 deaths yearly in Mexico',
  spanish: 'Bebidas azucaradas causan 40,000 muertes al año en México',
  evidence: ['Bebidas azucaradas causan 40,000 muertes, según el titular.'],
}).includes(causalFlag), 'a causal source headline cannot authorize a stronger Spanish translation');
