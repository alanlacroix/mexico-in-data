// Diagnostic evidence only. Nothing in this module restores or publishes an
// edition, and its files must stay outside the repository and public build.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import editionContract from './public-edition.cjs';

const copy = value => JSON.parse(JSON.stringify(value));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createEditionQuarantine({ repositoryRoot, directory, metadata, drafts, audit }) {
  const destination = directory || fs.mkdtempSync(path.join(os.tmpdir(), 'mexico-edition-quarantine-'));
  const relative = path.relative(path.resolve(repositoryRoot), path.resolve(destination));
  if (!relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    throw new Error('Edition quarantine must be outside the repository');
  }
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  const actualRelative = path.relative(fs.realpathSync(repositoryRoot), fs.realpathSync(destination));
  if (!actualRelative || (actualRelative !== '..' && !actualRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(actualRelative))) {
    throw new Error('Edition quarantine must be outside the repository');
  }
  const file = path.join(destination, 'candidate.json');
  // Capture what actually reached the audit. Missing/negative verdicts remain
  // visible; merely having a quarantine file never implies audit acceptance.
  const envelope = {
    schemaVersion: 1,
    kind: 'edition-diagnostic-quarantine',
    publicationAllowed: false,
    recordedAt: new Date().toISOString(),
    metadata: copy(metadata),
    drafts: copy(drafts),
    audit: copy(audit),
    auditedPayloadHash: digest({ drafts, audit }),
    candidate: null,
    candidateHash: null,
    validation: null,
    failure: null,
  };
  function save() {
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(envelope, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally {
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  save();
  return {
    file,
    recordCandidate(candidate) {
      envelope.candidate = copy(candidate);
      envelope.candidateHash = editionContract.editionHash(candidate);
      envelope.validation = editionContract.validateEdition(candidate);
      save();
    },
    recordFailure(error, stage) {
      envelope.failure = {
        stage,
        recordedAt: new Date().toISOString(),
        name: String(error?.name || 'Error'),
        message: String(error?.message || error),
        reasons: envelope.validation?.ok === false
          ? [...envelope.validation.errors] : [String(error?.message || error)],
      };
      save();
    },
  };
}
