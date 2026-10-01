import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordReleaseFailure, persistReleaseFailure } from '../record-release-failure.mjs';
import { preserveHeldEdition, restoreHeldEdition, RELEASE_FAILURE_REASON } from '../lib/held-edition-recovery.mjs';
import editionContract from '../lib/public-edition.cjs';
import attemptsContract from '../lib/edition-attempts.cjs';

const date = '2026-09-22';
const slot = 'morning';
const now = new Date(`${date}T14:00:00Z`);
const fixture = JSON.parse(fs.readFileSync(new URL('../../docs/pilot/candidate-2026-09-22.json', import.meta.url)));
delete fixture.publicationStatus;
fixture.generatedAt = `${date}T13:00:00Z`;
const edition = editionContract.withArtifactHash(fixture);
assert.equal(editionContract.validateEdition(edition).ok, true);
const exactBytes = Buffer.from(`${JSON.stringify(edition, null, 4)}\n\n`);
const previousEdition = editionContract.withArtifactHash({ ...edition, generatedAt: `${date}T12:00:00Z` });
const previousBytes = Buffer.from(`${JSON.stringify(previousEdition)}\n`);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'held-edition-recovery-'));
let caseNumber = 0;

function setup() {
  const dataDirectory = path.join(directory, String(++caseNumber));
  fs.mkdirSync(dataDirectory);
  const publicFile = path.join(dataDirectory, 'edition.json');
  const heldFile = path.join(dataDirectory, 'candidates', `${date}-${slot}-release.json`);
  fs.writeFileSync(publicFile, exactBytes);
  const attempts = {
    schemaVersion: 1,
    attempts: [{
      editorialDate: date, slot, state: 'published', candidateSignature: edition.candidateSignature,
      artifactHash: edition.artifactHash, startedAt: `${date}T13:00:00Z`, completedAt: `${date}T13:59:00Z`,
      calls: 3, costUSD: 0.09, reason: 'All editorial audits passed',
      diagnostics: [{ storyId: 'earlier-rejected-story', reasons: ['Unsupported claim removed'] }],
      collection: { ok: true, aliveSources: 68 }, recoveries: [],
      modelAccounting: {
        version: 1, runId: '1234', runAttempt: '1',
        receipts: [{ id: 'settled-call', state: 'settled', reservedUSD: 0.1, accountedUSD: 0.09 }],
      },
      releaseFailures: [{ failedAt: `${date}T12:00:00Z`, reason: 'Earlier recorded failure', artifactHash: 'a'.repeat(64) }],
    }],
  };
  return { dataDirectory, publicFile, heldFile, attempts, date, slot, now };
}

function heldCase() {
  const value = setup();
  value.attempts = recordReleaseFailure(value.attempts, date, slot, {
    dataDirectory: value.dataDirectory, now, runId: '1234', runAttempt: '1',
  });
  fs.writeFileSync(value.publicFile, previousBytes);
  value.attempts = attemptsContract.resumeFailedAttempt(value.attempts, {
    editorialDate: date, slot, startedAt: `${date}T14:01:00Z`,
  });
  return value;
}

try {
  const insufficient = heldCase();
  assert.throws(()=>restoreHeldEdition({...insufficient,minStories:edition.stories.length+1}),/current publication story count/);
  assert.deepEqual(fs.readFileSync(insufficient.publicFile),previousBytes);
  const value = setup();
  const before = structuredClone(value.attempts.attempts[0]);
  const failed = recordReleaseFailure(value.attempts, date, slot, {
    dataDirectory: value.dataDirectory, now, runId: '1234', runAttempt: '2',
  });
  const row = failed.attempts[0];
  assert.equal(row.state, 'failed');
  assert.equal(row.artifactHash, '', 'a release rejection must never claim public publication');
  assert.equal(row.reason, RELEASE_FAILURE_REASON);
  for (const field of ['calls', 'costUSD', 'modelAccounting', 'recoveries', 'diagnostics', 'collection']) {
    assert.deepEqual(row[field], before[field], `holding must preserve ${field}`);
  }
  assert.equal(row.releaseFailures.length, 2, 'earlier failure history remains intact');
  assert.deepEqual(row.releaseFailures[0], before.releaseFailures[0]);
  assert.equal(row.releaseFailures[1].previousReason, before.reason);
  assert.deepEqual(row.releaseFailures[1].diagnostics, before.diagnostics);
  assert.equal(row.heldEdition.artifactHash, edition.artifactHash);
  assert.equal(row.heldEdition.workflowRunId, '1234');
  assert.equal(row.heldEdition.workflowRunAttempt, '2');
  assert.equal(row.heldEdition.generationCompletedAt, before.completedAt);
  assert.deepEqual(fs.readFileSync(value.heldFile), exactBytes, 'holding preserves the original validated bytes');
  assert.deepEqual(fs.readFileSync(value.publicFile), exactBytes, 'holding does not mutate the in-run edition');

  const recovery = heldCase();
  const beforeRestore = structuredClone(recovery.attempts);
  assert.deepEqual(restoreHeldEdition(recovery), edition);
  assert.deepEqual(recovery.attempts, beforeRestore, 'restoration does not spend, call models or alter the attempt history');
  assert.deepEqual(fs.readFileSync(recovery.publicFile), exactBytes, 'restoration retains the exact audited bytes and hash');
  assert.deepEqual(restoreHeldEdition(recovery), edition, 'an exact restore replay is harmless');
  assert.deepEqual(fs.readFileSync(recovery.heldFile), exactBytes);
  assert.equal(recovery.attempts.attempts[0].state, 'started', 'the caller must still run its normal publication and site release gates');
  assert.equal(recovery.attempts.attempts[0].recoveries[0].reason, RELEASE_FAILURE_REASON);

  const noHeld = setup();
  noHeld.attempts.attempts[0].state = 'failed';
  noHeld.attempts.attempts[0].reason = 'Factual audit failed';
  fs.mkdirSync(path.dirname(noHeld.heldFile));
  fs.writeFileSync(noHeld.heldFile, exactBytes);
  noHeld.attempts = attemptsContract.resumeFailedAttempt(noHeld.attempts, { editorialDate: date, slot, startedAt: now.toISOString() });
  assert.equal(restoreHeldEdition(noHeld), null, 'a stray candidate cannot turn factual failure into an audited recovery');

  const invalidHolds = [
    ['failed generation', value => { value.attempts.attempts[0].state = 'failed'; }],
    ['incomplete generation', value => { value.attempts.attempts[0].state = 'started'; }],
    ['missing completion', value => { value.attempts.attempts[0].completedAt = ''; }],
    ['wrong recorded hash', value => { value.attempts.attempts[0].artifactHash = 'b'.repeat(64); }],
    ['wrong signature', value => { value.attempts.attempts[0].candidateSignature = 'b'.repeat(64); }],
    ['review candidate', value => {
      const candidate = editionContract.withArtifactHash({ ...edition, publicationStatus: 'candidate' });
      fs.writeFileSync(value.publicFile, JSON.stringify(candidate));
      value.attempts.attempts[0].artifactHash = candidate.artifactHash;
    }],
    ['changed content with stale hash', value => {
      fs.writeFileSync(value.publicFile, JSON.stringify({ ...edition, generatedAt: `${date}T13:01:00Z` }));
    }],
    ['wrong edition slot', value => {
      const wrongSlot = editionContract.withArtifactHash({ ...edition, slot: 'noon' });
      fs.writeFileSync(value.publicFile, JSON.stringify(wrongSlot));
      value.attempts.attempts[0].artifactHash = wrongSlot.artifactHash;
    }],
  ];
  for (const [label, mutate] of invalidHolds) {
    const value = setup();
    mutate(value);
    const attemptsBefore = structuredClone(value.attempts);
    const bytesBefore = fs.readFileSync(value.publicFile);
    assert.throws(() => recordReleaseFailure(value.attempts, date, slot, { dataDirectory: value.dataDirectory, now }), undefined, label);
    assert.deepEqual(value.attempts, attemptsBefore, `${label}: validation precedes ledger mutation`);
    assert.deepEqual(fs.readFileSync(value.publicFile), bytesBefore);
    assert.equal(fs.existsSync(value.heldFile), false, `${label}: no held provenance or file is created`);
  }

  const invalidRestores = [
    ['corrupt JSON', value => fs.writeFileSync(value.heldFile, '{broken')],
    ['missing held file', value => fs.unlinkSync(value.heldFile)],
    ['stale hash', value => fs.writeFileSync(value.heldFile, JSON.stringify({ ...edition, generatedAt: `${date}T13:01:00Z` }))],
    ['valid but different content', value => fs.writeFileSync(value.heldFile, JSON.stringify(editionContract.withArtifactHash({ ...edition, generatedAt: `${date}T13:01:00Z` })))],
    ['missing provenance', value => { value.attempts.attempts[0].heldEdition = null; }],
    ['wrong held date', value => { value.attempts.attempts[0].heldEdition.editorialDate = '2026-09-21'; }],
    ['wrong held slot', value => { value.attempts.attempts[0].heldEdition.slot = 'noon'; }],
    ['wrong held hash', value => { value.attempts.attempts[0].heldEdition.artifactHash = 'b'.repeat(64); }],
    ['wrong generation signature', value => { value.attempts.attempts[0].candidateSignature = 'b'.repeat(64); }],
    ['extra model calls', value => { value.attempts.attempts[0].calls += 1; }],
    ['changed spend', value => { value.attempts.attempts[0].costUSD += 0.01; }],
    ['missing release receipt', value => { value.attempts.attempts[0].releaseFailures = []; }],
    ['wrong failure completion', value => { value.attempts.attempts[0].recoveries[0].completedAt = `${date}T13:58:00Z`; }],
    ['wrong failure calls', value => { value.attempts.attempts[0].recoveries[0].calls = 2; }],
    ['failed factual generation', value => { value.attempts.attempts[0].recoveries[0].reason = 'Factual audit failed'; }],
    ['conflicting published hash', value => { value.attempts.attempts[0].artifactHash = edition.artifactHash; }],
    ['not resumed', value => { value.attempts.attempts[0].state = 'failed'; }],
    ['unbounded retry', value => { value.attempts.attempts[0].recoveries.push(value.attempts.attempts[0].recoveries[0]); }],
    ['stale editorial day', value => { value.now = new Date('2026-09-23T14:00:00Z'); }],
    ['candidate even with matching forged provenance', value => {
      const candidate = editionContract.withArtifactHash({ ...edition, publicationStatus: 'candidate' });
      fs.writeFileSync(value.heldFile, JSON.stringify(candidate));
      value.attempts.attempts[0].heldEdition.artifactHash = candidate.artifactHash;
      value.attempts.attempts[0].releaseFailures.at(-1).artifactHash = candidate.artifactHash;
    }],
    ['newer public edition', value => fs.writeFileSync(value.publicFile, JSON.stringify(editionContract.withArtifactHash({ ...edition, slot: 'noon', generatedAt: `${date}T15:00:00Z` })))],
    ['conflicting public edition', value => fs.writeFileSync(value.publicFile, JSON.stringify(editionContract.withArtifactHash({ ...edition, slot: 'noon' })))],
  ];
  for (const [label, mutate] of invalidRestores) {
    const value = heldCase();
    mutate(value);
    const attemptsBefore = structuredClone(value.attempts);
    const bytesBefore = fs.readFileSync(value.publicFile);
    assert.throws(() => restoreHeldEdition(value), undefined, label);
    assert.deepEqual(value.attempts, attemptsBefore, `${label}: restore rejection leaves accounting intact`);
    assert.deepEqual(fs.readFileSync(value.publicFile), bytesBefore, `${label}: restore rejection leaves public bytes intact`);
  }

  const conflict = setup();
  fs.mkdirSync(path.dirname(conflict.heldFile));
  fs.writeFileSync(conflict.heldFile, previousBytes);
  assert.throws(() => preserveHeldEdition(conflict), /different held edition/);
  assert.deepEqual(fs.readFileSync(conflict.heldFile), previousBytes, 'holding cannot overwrite another audited artifact');
  assert.throws(() => preserveHeldEdition({ ...setup(), date: '../2026-09-22' }), /Invalid held edition/);
  assert.throws(() => preserveHeldEdition({ ...setup(), date: '2026-02-31' }), /Invalid held edition/);

  const durable = setup();
  fs.writeFileSync(path.join(durable.dataDirectory, 'edition-attempts.json'), JSON.stringify(durable.attempts));
  const persisted = persistReleaseFailure(durable);
  assert.equal(persisted.preservationError, null);
  assert.equal(persisted.attempts.attempts[0].state, 'failed');
  assert.deepEqual(fs.readFileSync(durable.heldFile), exactBytes);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(durable.dataDirectory, 'edition-attempts.json'))), persisted.attempts);

  for (const [label, breakPreservation] of [
    ['invalid audited bytes', value => fs.writeFileSync(value.publicFile, '{broken')],
    ['missing audited artifact', value => fs.unlinkSync(value.publicFile)],
    ['candidate copy cannot be written', value => fs.writeFileSync(path.dirname(value.heldFile), 'blocks directory creation')],
  ]) {
    const value = setup();
    const accountingBefore = structuredClone(value.attempts.attempts[0]);
    const ledgerFile = path.join(value.dataDirectory, 'edition-attempts.json');
    fs.writeFileSync(ledgerFile, JSON.stringify(value.attempts));
    breakPreservation(value);
    const result = persistReleaseFailure(value);
    assert.ok(result.preservationError, `${label}: the CLI receives an explicit error for its nonzero exit`);
    const saved = JSON.parse(fs.readFileSync(ledgerFile));
    const failed = saved.attempts[0];
    assert.equal(failed.state, 'failed', `${label}: the committed ledger cannot claim publication`);
    assert.equal(failed.artifactHash, '');
    assert.equal(failed.reason, RELEASE_FAILURE_REASON);
    assert.equal(failed.heldEdition.reason, 'release-preservation-failed');
    assert.equal(failed.heldEdition.artifactHash, edition.artifactHash);
    assert.equal(failed.heldEdition.preservationError, result.preservationError);
    assert.equal(failed.releaseFailures.at(-1).preservationError, result.preservationError);
    for (const field of ['calls', 'costUSD', 'modelAccounting', 'diagnostics', 'collection', 'recoveries']) {
      assert.deepEqual(failed[field], accountingBefore[field], `${label}: preservation failure retains ${field}`);
    }
    assert.deepEqual(failed.releaseFailures[0], accountingBefore.releaseFailures[0]);
    const resumed = attemptsContract.resumeFailedAttempt(saved, { editorialDate: date, slot, startedAt: `${date}T14:01:00Z` });
    assert.throws(() => restoreHeldEdition({ ...value, attempts: resumed }), /provenance/, `${label}: a later retry cannot enter paid fallback`);
  }
  console.log('held edition recovery: ok');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
