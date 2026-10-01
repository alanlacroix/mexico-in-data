import assert from 'node:assert/strict';
import priority from '../lib/candidate-priority.cjs';

const { attentionSignal, commentaryOnlyCandidate, decisionCoverage, fallbackImportanceComponents, prioritizeCandidates } = priority;
const total = (components) => Object.values(components).reduce((sum, value) => sum + value, 0);

const recurring = Array.from({ length: 60 }, (_, index) => ({
  id: `replay-${index}`,
  published_at: `2026-08-07T${String(23 - (index % 20)).padStart(2, '0')}:00:00Z`,
  _alreadyPublished: true,
}));
const unseen = { id: 'unseen', published_at: '2026-08-07T12:00:00Z', _alreadyPublished: false };
const scheduled = {
  id: 'scheduled-outcome',
  published_at: '2026-08-06T19:40:00Z',
  _alreadyPublished: true,
  _scheduled: { id: 'stable-obligation' },
};
const ranked = prioritizeCandidates([...recurring, unseen, scheduled]);
assert.equal(ranked[0].id, 'scheduled-outcome', 'a scheduled outcome must survive a curator input cap even when older and already seen');
assert.equal(ranked[1].id, 'unseen', 'new reporting must precede recurring stories already represented in the log');
assert.ok(ranked.slice(0, 24).some((candidate) => candidate.id === 'scheduled-outcome'), 'the scheduled outcome must remain inside the exhaustive 24-item batch');
assert.equal(prioritizeCandidates([unseen, scheduled]).length, 2, 'priority sorting must not mutate or discard candidates');

const olderEqualSignal = Array.from({ length: 30 }, (_, index) => ({
  id: `older-${index}`,
  title: 'Mexico government approves a new national policy',
  published_at: `2026-08-26T${String(index % 20).padStart(2, '0')}:00:00Z`,
  _editorialDate: '2026-08-26',
  _alreadyPublished: false,
}));
const todayEqualSignal = Array.from({ length: 6 }, (_, index) => ({
  id: `today-${index}`,
  title: 'Mexico government approves a new national policy',
  published_at: `2026-08-27T${String(12 + index).padStart(2, '0')}:00:00Z`,
  _editorialDate: '2026-08-27',
  _alreadyPublished: false,
}));
const dailyBatch = prioritizeCandidates([...olderEqualSignal, ...todayEqualSignal], {
  editorialDate: '2026-08-27',
});
assert.ok(todayEqualSignal.every((candidate) => dailyBatch.slice(0, 24).some((row) => row.id === candidate.id)),
  'every same-day equal-signal report must enter the bounded batch before the old backlog');

const routineMorning = Array.from({ length: 60 }, (_, index) => ({
  id: `routine-${index}`,
  title: index % 2 ? 'How to save on school supplies this weekend' : 'Weather in Mexico this Sunday',
  published_at: `2026-08-09T${String(13 - (index % 12)).padStart(2, '0')}:00:00Z`,
  _alreadyPublished: false,
}));
const priorEveningChange = {
  id: 'avocado-inspections-resume',
  title: 'Estados Unidos reanuda inspecciones de aguacate en Michoacán tras acuerdo de seguridad',
  published_at: '2026-08-08T21:36:00Z',
  _alreadyPublished: false,
};
const busyMorning = prioritizeCandidates([...routineMorning, priorEveningChange]);
assert.equal(busyMorning[0].id, 'avocado-inspections-resume',
  'newer routine volume must not crowd an older policy or trade state change out before scoring');
assert.ok(busyMorning.slice(0, 24).some((candidate) => candidate.id === priorEveningChange.id),
  'a likely state change must survive the exhaustive curator batch');
assert.equal(attentionSignal(priorEveningChange), 2, 'the attention rule should recognize both a state change and public consequence');
assert.equal(attentionSignal(routineMorning[0]), -1, 'obviously routine coverage should use the remaining attention slots');

assert.deepEqual(decisionCoverage(3, [{ i: 2 }, { i: 0 }, { i: 1 }]), {
  ok: true, missing: [], duplicates: [], invalid: [],
}, 'curation may return decisions in any order when every candidate is covered exactly once');
assert.deepEqual(decisionCoverage(3, [{ i: 0 }, { i: 0 }, { i: 4 }]), {
  ok: false, missing: [1, 2], duplicates: [0], invalid: [4],
}, 'a missing, duplicate, or out-of-range decision must fail the exhaustive curation contract');

assert.ok(total(fallbackImportanceComponents({
  title: 'United States resumes avocado inspections in Michoacán after a security agreement with Mexico',
  dek: 'Government operations resume in phases.', tier: 1, url: 'https://example.com/avocado',
})) >= 5, 'keyless curation must still recognize a consequential US-Mexico state change');
assert.ok(total(fallbackImportanceComponents({
  title: 'GWM launches a new car model in Mexico', dek: 'The company adds a product to its range.', tier: 2,
})) < 5, 'a routine product launch must not become a top Brief story without model review');
assert.equal(fallbackImportanceComponents({
  title: 'Mexico publishes a new labor report', tier: 2, url: 'https://elceo.com/economia/report',
}).officialness, 1, 'model and deterministic paths must give tier-2 press the same evidence-owned score');
assert.equal(total(fallbackImportanceComponents({
  title: 'Weather in Mexico this Sunday', dek: 'Rain is expected.', tier: 1,
})), 0, 'routine coverage must remain outside deterministic Brief ranking');

assert.equal(commentaryOnlyCandidate({
  title: 'Agustín Carstens aboga por una estrategia coordinada para la revisión del T-MEC',
  dek: 'El exgobernador de Banxico propone que México negocie con Estados Unidos.',
}), true, 'a former official advocating a position is commentary, not a new development');
assert.equal(commentaryOnlyCandidate({
  title: 'Sheinbaum presenta iniciativa para reformar la ley aduanera',
  dek: 'La presidenta propone cambios al Congreso.',
}), false, 'a current decision-maker formally filing a proposal is a development');

const cfeInvestigation = {
  title: 'CFE: Plazas pirata, sueldos inflados y señalamientos de nepotismo',
  dek: 'Trabajadores denuncian usurpación de plazas, nepotismo y sueldos inflados. La publicación CFE: Plazas pirata, sueldos inflados y señalamientos de nepotismo apareció primero en EL CEO .',
  tier: 2, _editorialDate: '2026-10-01', published_at: '2026-10-01T08:00:52Z',
};
assert.equal(attentionSignal(cfeInvestigation), 1,
  'the actual Oct 1 RSS footer must not turn an investigation into a new official action');
assert.equal(fallbackImportanceComponents(cfeInvestigation).usMexicoStakes, 0,
  'usurpación must not match the U.S. abbreviation');
assert.equal(fallbackImportanceComponents(cfeInvestigation).durability, 1);
assert.equal(attentionSignal({title:'La publicación del informe de CFE genera debate.'}), 1,
  'publication nouns are not the verb publica even without an RSS footer');
assert.equal(attentionSignal({title:'CFE publicó un informe operativo.'}), 2,
  'accented past-tense official actions remain recognized');

const movistarApproval = {
  title: 'CNA da luz verde a OXIO para comprar Movistar México por 450 millones de dólares',
  dek: 'La Comisión Nacional Antimonopolio dio su visto bueno a la operación mediante la cual Melisa Acquisition adquirirá Telefónica México.',
  tier: 2, _editorialDate: '2026-10-01', published_at: '2026-10-01T12:12:48Z',
};
const senateReform = {
  title:'Senado aprueba reforma a ley de IED: va a Diputados',
  dek:'La Comisión de Economía presentó los cambios sobre inversión internacional.',
  tier:2, _editorialDate:'2026-10-01', published_at:'2026-10-01T06:59:30Z',
};
assert.equal(attentionSignal(movistarApproval), 2,
  'da luz verde and visto bueno describe the actual Oct 1 regulatory approval');
assert.equal(commentaryOnlyCandidate({...movistarApproval, dek:`${movistarApproval.dek} Un analista advierte riesgos.`}), false,
  'an approval accompanied by a warning remains a formal development');
assert.equal(commentaryOnlyCandidate({title:'Carstens abogó por revisar el T-MEC.'}), true,
  'accent normalization preserves past-tense advocacy detection');
assert.equal(fallbackImportanceComponents(movistarApproval).durability, 2);
assert.equal(fallbackImportanceComponents(movistarApproval).modelImpact, 2);
assert.deepEqual(prioritizeCandidates([cfeInvestigation, senateReform, movistarApproval], {editorialDate:'2026-10-01'}),
  [movistarApproval, senateReform, cfeInvestigation],
  'formal approval and legislative action precede an investigation inflated by feed plumbing');

for (const title of ['Usuarios de CFE presentan una queja.', 'CFE denuncia usurpación de plazas.', 'Operators ask us for important guidance.']) {
  assert.equal(fallbackImportanceComponents({title,tier:2}).usMexicoStakes, 0,
    `neither U.S. prefixes nor import in important create trade stakes: ${title}`);
}
assert.equal(fallbackImportanceComponents({title:'Important guidance for Mexican firms.',tier:2}).modelImpact, 0,
  'important is not an import activity');
for (const actor of ['U.S.', 'US', 'United States', 'EE.UU.', 'EE. UU.', 'Estados Unidos']) {
  assert.equal(fallbackImportanceComponents({title:`${actor} resumes inspections in Mexico.`,tier:2}).usMexicoStakes, 2,
    `retain the actual cross-border actor ${actor}`);
}
for (const title of ['México aumenta importaciones de gas.', 'Exportaciones mexicanas crecen.', 'Se negocian aranceles para México.', 'USMCA review resumes.']) {
  assert.equal(fallbackImportanceComponents({title,tier:2}).usMexicoStakes, 2, title);
}

console.log('candidate-priority tests: ok');
