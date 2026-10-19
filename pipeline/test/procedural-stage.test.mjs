import assert from 'node:assert/strict';
import { lintAnalysisText } from '../lib/lint.js';

const stageFlags = (text, inputs) => lintAnalysisText({
  text, inputs, role: 'background', maxWords: 100, maxSentences: 4, checkNumbers: false,
}).flags.filter(flag => flag === 'proposal or draft described as a completed action');
const rejects = (text, inputs, reason) => assert.equal(stageFlags(text, inputs).length, 1, reason);
const accepts = (text, inputs, reason) => assert.deepEqual(stageFlags(text, inputs), [], reason);

const pending = 'Pemex proposed eliminating supplier screening.';
const completed = 'Pemex eliminates supplier screening.';
for (const unrelated of [
  'Congress approved an unrelated education law.',
  'Pemex approved an unrelated investment plan.',
  'Pemex approved a proposal to change office hours.',
]) {
  rejects(completed, [`${pending} ${unrelated}`], 'an unrelated completed measure cannot finalize this claim');
  rejects(completed, [pending, unrelated], 'separate evidence records cannot share enactment status');
}

accepts('Congress approved the education proposal.', [
  pending, 'Congress approved the education proposal.',
], 'a complete identical affirmative sentence supports its own enactment');
accepts('Congress approved the education proposal.', [
  'CONGRESS   approved the education proposal.',
], 'case and whitespace normalization do not change meaning');
rejects('Congress approved the tax proposal.', [
  'Congress proposed the tax proposal. Congress approved the education proposal.',
], 'same actor and action do not establish a different instrument');
rejects('Congress approved the new tax proposal.', [
  'Congress proposed the new tax proposal. Congress approved the old tax proposal.',
], 'historical approval cannot finalize a new instrument');
rejects('Congress approved the education proposal. Pemex eliminates supplier screening.', [
  pending, 'Congress approved the education proposal.',
], 'support for one generated sentence cannot license another');

for (const source of [
  'Congress has not approved the proposal.',
  'Congress never approved the proposal.',
  'Congress denied that it approved the proposal.',
  'If Congress approved the proposal, the fee would change.',
  'Congress will approve the proposal.',
  'Congress could have approved the proposal.',
  'Has Congress approved the proposal?',
  'Congress approved the proposal?',
  'Congress published a draft proposal for consultation.',
  'The agreement, published in the official gazette, includes a proposal to remove supplier screening.',
]) rejects('Congress approved the proposal.', [source], `nonfinal evidence cannot prove enactment: ${source}`);
rejects('Congress approved the proposal.', ['Congress approved the proposal?'],
  'question punctuation must not disappear into an affirmative match');
rejects('Congress approved the proposal and enacted a separate tax law.', [
  'Congress approved the proposal.',
], 'a supported action cannot license an added completed action');
for (const source of [
  'Congress approved the proposal on Monday.',
  'Congress approved the proposal with 100 votes.',
  'Congress approved the proposal, according to preliminary reports.',
  'Congress approved the proposal, but approval remains disputed.',
  'Officials said "Congress approved the proposal".',
  '"Congress approved the proposal".',
]) rejects('Congress approved the proposal.', [source],
  'sentence identity must preserve dates, quantities, attribution and qualifications');
for (const qualified of [
  'Congress approved the proposal, if the preliminary report is correct.',
  'Congress approved the proposal, but officials denied that account.',
  '"Congress approved the proposal"',
  "'Congress approved the proposal'",
  '‘Congress approved the proposal’',
  "Congress hasn't approved the proposal.",
  'Congress hasn’t approved the proposal.',
  'Suppose Congress approved the proposal.',
  'Assuming Congress approved the proposal.',
]) rejects(qualified, [qualified], 'literal copying alone cannot make uncertain or quoted enactment affirmative');
rejects('Congress approved the proposal on Tuesday.', [
  'Congress approved the proposal on Monday.',
], 'a changed date is not the same claim');

for (const text of [
  'Pemex proposes eliminating supplier screening.',
  'Pemex would eliminate supplier screening if the proposal passes.',
  'The proposal would eliminate supplier screening.',
]) accepts(text, [pending], 'existing conditional/proposal language remains allowed');

// Retained October 19 false positive, deliberately NOT papered over with a
// company-specific or passive-publication exception. Original evidence excerpts:
// https://elceo.com/negocios/pemex-retira-filtros-sobre-conflictos-interes-registro-proveedores/
const pemexEvidence = [
  'Pemex eliminó preguntas sobre vínculos entre proveedores y funcionarios públicos.',
  'El acuerdo, publicado en el Diario Oficial de la Federación (DOF) el pasado 14 de octubre, contempla retirar preguntas que permitían identificar posibles relaciones entre las compañías y servidores públicos.',
  'No obstante, sí plantea la necesidad de identificar en qué etapas se verificará la información cuando resulte relevante para evaluar a una empresa o adjudicarle un contrato.',
].join(' ');
const retainedBackground = 'Pemex published an October 14 agreement eliminating 197 supplier registration questions, including inquiries about whether company owners, executives, or key employees have ties to government officials or politically exposed persons. The change removes a preventive screening mechanism that specialists say helped identify potential conflicts of interest.';
rejects(retainedBackground, [pemexEvidence], 'known bilingual false positive remains held for editorial review, not a special exemption');
accepts(retainedBackground, [pemexEvidence.replace('plantea', 'señala')],
  'fixture isolates the existing advisory-verb trigger without changing production evidence');

const emptyWatch = lintAnalysisText({ text: '', inputs: ['Water infrastructure requires repair.'], role: 'prediction' });
assert.ok(emptyWatch.flags.includes('empty report text'));
assert.ok(emptyWatch.flags.includes('watch item has no observable next test'));
console.log('procedural-stage: claim-bound enactment, mixed instruments, nonfinal evidence and retained false-positive limits pass');
