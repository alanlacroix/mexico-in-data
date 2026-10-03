// No provider requests or production data writes: exercise diagnostic snapshots
// before the deterministic/audit gates and preserve the historical audit API.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEditionQuarantine } from '../lib/edition-quarantine.mjs';

const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-quarantine-repo-'));
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-quarantine-stages-'));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read = capture => JSON.parse(fs.readFileSync(capture.file, 'utf8'));
try {
  const capture = createEditionQuarantine({ repositoryRoot, directory: path.join(artifacts, 'before-audit'), metadata: {} });
  assert.equal(read(capture).audit, null);
  assert.equal(read(capture).auditedPayloadHash, null, 'no hash may imply that an audit ran');
  assert.deepEqual(read(capture).generationStages, []);

  const evidence = [{ id: 'article', url: 'https://example.com/report', text: 'Exact source evidence.' }];
  const initial = [{ index: 0, storyId: 'source-story', draft: { background: 'Initial rejected text.' }, evidence }];
  const initialSnapshot = structuredClone(initial);
  const initialDetails = { flags: ['unsupported actor'], response: { stories: { s0: initial[0].draft } } };
  capture.recordGeneration('initial-generation', initial, initialDetails);
  initial[0].draft.background = 'Mutated after capture.';
  initial[0].evidence[0].text = 'Mutated evidence.';
  initialDetails.flags.push('later mutation');
  let saved = read(capture);
  assert.deepEqual(saved.drafts, initialSnapshot);
  assert.deepEqual(saved.generationStages[0].drafts, initialSnapshot, 'snapshots retain exact raw drafts and their source evidence');
  assert.deepEqual(saved.generationStages[0].details.flags, ['unsupported actor']);
  assert.equal(saved.generationStages[0].details.response.stories.s0.background, 'Initial rejected text.');

  const repaired = [{ ...initialSnapshot[0], draft: { background: 'Repair still rejected.' } }];
  capture.recordGeneration('repair-generation', repaired, { flags: ['unsupported number'] });
  capture.recordFailure(new Error('Drafts failed deterministic evidence gate.'), 'deterministic-evidence-gate');
  saved = read(capture);
  assert.deepEqual(saved.generationStages.map(item => item.stage), ['initial-generation', 'repair-generation']);
  assert.deepEqual(saved.generationStages[0].drafts, initialSnapshot);
  assert.deepEqual(saved.drafts, repaired);
  assert.equal(saved.audit, null);
  assert.equal(saved.auditedPayloadHash, null);
  assert.equal(saved.candidate, null);
  assert.equal(saved.publicationAllowed, false);
  assert.equal(saved.failure.stage, 'deterministic-evidence-gate');
  assert.deepEqual(saved.failure.reasons, ['Drafts failed deterministic evidence gate.']);

  const auditedDrafts = [{ ...initialSnapshot[0], draft: { background: 'Exact audit input.' } }];
  const audit = { inputs: [{ i: 0 }], response: { reviews: { s0: { ok: false, problems: ['unsupported assertion'] } } } };
  const auditedSnapshot = structuredClone(auditedDrafts);
  const auditSnapshot = structuredClone(audit);
  capture.recordAudit(audit, auditedDrafts);
  audit.response.reviews.s0.ok = true;
  auditedDrafts[0].draft.background = 'Changed after audit capture.';
  saved = read(capture);
  assert.deepEqual(saved.drafts, auditedSnapshot);
  assert.deepEqual(saved.audit, auditSnapshot);
  assert.equal(saved.auditedPayloadHash, hash({ drafts: auditedSnapshot, audit: auditSnapshot }));
  assert.equal(saved.publicationAllowed, false, 'a recorded audit never grants publication permission');
  capture.recordGeneration('later-diagnostic', initialSnapshot);
  saved = read(capture);
  assert.deepEqual(saved.drafts, auditedSnapshot, 'later diagnostics cannot alter the recorded audited payload');
  assert.equal(saved.auditedPayloadHash, hash({ drafts: saved.drafts, audit: saved.audit }));
  assert.equal(saved.generationStages.length, 3);

  const implicit = createEditionQuarantine({ repositoryRoot, directory: path.join(artifacts, 'implicit-drafts'), metadata: {} });
  implicit.recordGeneration('initial-generation', initialSnapshot);
  implicit.recordAudit(auditSnapshot);
  assert.deepEqual(read(implicit).drafts, initialSnapshot, 'audit can use the most recently recorded draft snapshot');
  assert.equal(read(implicit).auditedPayloadHash, hash({ drafts: initialSnapshot, audit: auditSnapshot }));

  const legacy = createEditionQuarantine({ repositoryRoot, directory: path.join(artifacts, 'legacy'), metadata: {}, drafts: initialSnapshot, audit: auditSnapshot });
  assert.deepEqual(read(legacy).drafts, initialSnapshot);
  assert.deepEqual(read(legacy).audit, auditSnapshot);
  assert.equal(read(legacy).auditedPayloadHash, hash({ drafts: initialSnapshot, audit: auditSnapshot }));
  assert.equal(fs.statSync(legacy.file).mode & 0o777, 0o600);
  assert.throws(() => createEditionQuarantine({ repositoryRoot, directory: path.join(repositoryRoot, 'data/diagnostics'), metadata: {} }), /outside the repository/);

  console.log('edition quarantine: exact generation stages and optional audit pass');
} finally {
  fs.rmSync(repositoryRoot, { recursive: true, force: true });
  fs.rmSync(artifacts, { recursive: true, force: true });
}
