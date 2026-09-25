import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { approveEdition } from '../approve-edition.mjs';
import lib from '../lib/public-edition.cjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'approve-edition-'));
try {
  const candidate = JSON.parse(fs.readFileSync(new URL('../../docs/pilot/candidate-2026-09-22.json', import.meta.url)));
  fs.mkdirSync(path.join(dir, 'candidates'));
  lib.atomicWriteEdition(path.join(dir, 'candidates', '2026-09-22-morning.json'), candidate);
  const args = { dataDirectory: dir, date: '2026-09-22', slot: 'morning', expectedHash: candidate.artifactHash, reviewer: 'test-editor', now: new Date('2026-09-22T20:00:00Z') };
  assert.throws(() => approveEdition({ ...args, expectedHash: '0'.repeat(64) }), /reviewed artifact/);
  assert.throws(() => approveEdition({ ...args, now: new Date('2026-09-24T20:00:00Z') }), /Only today/);
  assert.equal(fs.existsSync(path.join(dir, 'edition.json')), false);
  const approved = approveEdition(args);
  assert.equal(approved.approval.candidateHash, candidate.artifactHash);
  assert.equal(approved.publicationStatus, 'approved');
  assert.notEqual(approved.artifactHash, candidate.artifactHash);
  assert.equal(lib.validateEdition(approved).ok, true);
  assert.deepEqual(approveEdition(args), approved, 'approval replay is idempotent');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'editions', '2026-09-22.json'))).artifactHash, approved.artifactHash);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'candidates', '2026-09-22-morning.json'))).artifactHash, candidate.artifactHash);
  console.log('approve edition: ok');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
