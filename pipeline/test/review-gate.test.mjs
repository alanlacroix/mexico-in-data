import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import gate from '../lib/review-gate.cjs';
import publicEdition from '../lib/public-edition.cjs';
import history from '../lib/edition-history.cjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-review-gate-'));
try {
  const publicFile = path.join(directory, 'edition.json');
  fs.writeFileSync(publicFile, 'last-good');
  const target = gate.publicationTarget({ dataDirectory: directory, editorialDate: '2026-09-22', slot: 'morning', requireReview: true });
  assert.deepEqual(target, { file: path.join(directory, 'candidates', '2026-09-22-morning.json'), state: 'review-required', publicationStatus: 'candidate' });
  fs.mkdirSync(path.dirname(target.file), { recursive: true });
  const candidate = JSON.parse(fs.readFileSync(new URL('../../data/edition.json', import.meta.url), 'utf8'));
  candidate.publicationStatus = target.publicationStatus;
  publicEdition.atomicWriteEdition(target.file, candidate);
  assert.equal(publicEdition.validateEdition(JSON.parse(fs.readFileSync(target.file, 'utf8'))).ok, true,
    'candidate is hashed and validated before it is persisted');
  assert.equal(fs.readFileSync(publicFile, 'utf8'), 'last-good', 'candidate output cannot replace the public artifact');
  assert.throws(() => history.archivePublishedEdition(JSON.parse(fs.readFileSync(target.file, 'utf8')), { directory: path.join(directory, 'editions') }),
    /editorially approved/, 'a review candidate cannot enter the published archive');
  assert.equal(gate.publicationTarget({ dataDirectory: directory, editorialDate: '2026-09-22', slot: 'morning' }).file, publicFile);
  assert.throws(() => gate.publicationTarget({ dataDirectory: directory, editorialDate: '../bad', slot: 'morning', requireReview: true }), /Invalid/);
  console.log('review gate: ok');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
