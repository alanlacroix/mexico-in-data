// Reuse only an exact, already-audited edition rejected by the site release gate.
// This module neither collects sources nor imports or invokes a model.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import editionContract from './public-edition.cjs';
import attemptsContract from './edition-attempts.cjs';
import newsDay from './news-day.cjs';

export const RELEASE_FAILURE_REASON = 'Exact site release validation failed; the last good public edition was retained';
const HASH = /^[a-f0-9]{64}$/;
const validTimestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

function candidateFile(dataDirectory, date, slot) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')
    || !Number.isFinite(Date.parse(`${date}T12:00:00Z`))
    || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
    || !['morning', 'noon'].includes(slot)) throw new Error('Invalid held edition date or slot');
  return path.join(dataDirectory, 'candidates', `${date}-${slot}-release.json`);
}

function getAttempt(attempts, date, slot) {
  const row = attemptsContract.slotAttempt(attemptsContract.readAccountingAttempts(attempts), date, slot);
  if (!row) throw new Error(`No attempt for held edition: ${date}/${slot}`);
  return row;
}

function readPublicEdition(file) {
  const bytes = fs.readFileSync(file);
  const edition = JSON.parse(bytes.toString('utf8'));
  // Validate the supplied hash before any writer can recompute or repair it.
  const validation = editionContract.validateEdition(edition);
  if (!validation.ok) throw new Error(`Invalid held edition: ${validation.errors.join('; ')}`);
  if (edition.publicationStatus !== undefined && edition.publicationStatus !== 'approved') {
    throw new Error('Only an audited public edition can be held or restored; review candidates are ineligible');
  }
  return { bytes, edition };
}

function atomicWriteExact(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

// Return provenance only after the original, validated bytes are safely saved.
// A failed generation cannot acquire this provenance merely by having a file.
export function preserveHeldEdition({ attempts, dataDirectory, date, slot, now = new Date(), runId = '', runAttempt = '' }) {
  const file = candidateFile(dataDirectory, date, slot);
  const row = getAttempt(attempts, date, slot);
  if (row.state !== 'published' || !HASH.test(row.artifactHash || '') || !validTimestamp(row.completedAt)) {
    throw new Error('Only a completed audited generation can be held after release failure');
  }
  const { edition, bytes } = readPublicEdition(path.join(dataDirectory, 'edition.json'));
  if (edition.editorialDate !== date || edition.slot !== slot
    || edition.artifactHash !== row.artifactHash || edition.candidateSignature !== row.candidateSignature) {
    throw new Error('Held edition does not match the completed generation');
  }
  const held = {
    schemaVersion: 1,
    reason: 'release-gate-failure',
    editorialDate: date,
    slot,
    artifactHash: edition.artifactHash,
    candidateSignature: edition.candidateSignature,
    generatedAt: edition.generatedAt,
    generationCompletedAt: row.completedAt,
    generationCalls: row.calls,
    generationCostUSD: row.costUSD,
    heldAt: new Date(now).toISOString(),
    ...(runId ? { workflowRunId: String(runId), workflowRunAttempt: String(runAttempt || '1') } : {}),
  };
  if (row.heldEdition && row.heldEdition.artifactHash !== held.artifactHash) {
    throw new Error('A different held edition already belongs to this attempt');
  }
  if (fs.existsSync(file)) {
    const existing = readPublicEdition(file).edition;
    if (existing.artifactHash !== held.artifactHash) throw new Error('Refusing to replace a different held edition');
  }
  atomicWriteExact(file, bytes);
  return held;
}

// Call only after resumeFailedAttempt, before collection, budget checks or models.
// null means no held artifact was recorded. Any recorded-but-invalid artifact
// throws, so the caller cannot silently substitute a paid regeneration.
export function restoreHeldEdition({ attempts, dataDirectory, date, slot, now = new Date(), minStories = 1, maxStories = 5 }) {
  const file = candidateFile(dataDirectory, date, slot);
  const row = getAttempt(attempts, date, slot);
  if (row.heldEdition === undefined) return null;
  const held = row.heldEdition;
  const recoveries = row.recoveries;
  if (row.state !== 'started' || row.artifactHash !== '' || !Array.isArray(recoveries) || recoveries.length < 1
    || recoveries.length > attemptsContract.MAX_RECOVERY_RUNS
    || recoveries.at(-1)?.reason !== RELEASE_FAILURE_REASON) {
    throw new Error('Held edition restoration requires a bounded resumed release failure');
  }
  if (!held || held.schemaVersion !== 1 || held.reason !== 'release-gate-failure'
    || held.editorialDate !== date || held.slot !== slot || !HASH.test(held.artifactHash || '')
    || !HASH.test(held.candidateSignature || '') || held.candidateSignature !== row.candidateSignature
    || !validTimestamp(held.generatedAt) || !validTimestamp(held.generationCompletedAt)
    || !validTimestamp(held.heldAt) || held.generationCalls !== row.calls || held.generationCostUSD !== row.costUSD
    || recoveries.at(-1).completedAt !== held.generationCompletedAt
    || recoveries.at(-1).calls !== held.generationCalls || recoveries.at(-1).costUSD !== held.generationCostUSD
    || !Array.isArray(row.releaseFailures) || !row.releaseFailures.some(failure => failure
      && failure.artifactHash === held.artifactHash && failure.failedAt === held.heldAt
      && failure.reason === RELEASE_FAILURE_REASON)) {
    throw new Error('Held edition provenance does not match the failed audited generation');
  }
  if (newsDay.editorialDay(new Date(now)) !== date) throw new Error('Only today’s held edition can be restored');
  const { edition, bytes } = readPublicEdition(file);
  if (edition.editorialDate !== date || edition.slot !== slot || edition.artifactHash !== held.artifactHash
    || edition.candidateSignature !== held.candidateSignature || edition.generatedAt !== held.generatedAt) {
    throw new Error('Held edition does not match its recorded provenance');
  }
  if (edition.stories.length < minStories || edition.stories.length > maxStories) {
    throw new Error('Held edition does not meet the current publication story count');
  }
  const target = path.join(dataDirectory, 'edition.json');
  if (fs.existsSync(target)) {
    const current = readPublicEdition(target).edition;
    if (current.artifactHash !== edition.artifactHash
      && (current.editorialDate > date || Date.parse(current.generatedAt) >= Date.parse(edition.generatedAt))) {
      throw new Error('Held edition would replace a newer or conflicting public edition');
    }
  }
  atomicWriteExact(target, bytes);
  return edition;
}
