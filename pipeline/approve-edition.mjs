// Promote only the exact candidate a human reviewed. No generation occurs here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import editionLib from './lib/public-edition.cjs';
import history from './lib/edition-history.cjs';

export function approveEdition({ dataDirectory, date, slot, expectedHash, reviewer, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !['morning', 'noon'].includes(slot)) throw new Error('Invalid candidate date or slot');
  if (!/^[a-f0-9]{64}$/.test(expectedHash || '') || !String(reviewer || '').trim()) throw new Error('Exact reviewed hash and reviewer are required');
  const candidate = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'candidates', `${date}-${slot}.json`), 'utf8'));
  const validation = editionLib.validateEdition(candidate);
  if (!validation.ok) throw new Error(`Invalid candidate: ${validation.errors.join('; ')}`);
  if (candidate.publicationStatus !== 'candidate' || candidate.editorialDate !== date || candidate.slot !== slot || candidate.artifactHash !== expectedHash) throw new Error('Candidate does not match the reviewed artifact');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  if (date !== today) throw new Error('Only today’s Mexico City candidate can be promoted');
  const publicFile = path.join(dataDirectory, 'edition.json');
  const current = fs.existsSync(publicFile) ? JSON.parse(fs.readFileSync(publicFile, 'utf8')) : null;
  if (current?.approval?.candidateHash === expectedHash) return current;
  if (current && (current.editorialDate > date || Date.parse(current.generatedAt) >= Date.parse(candidate.generatedAt))) throw new Error('Candidate would replace a newer or conflicting edition');
  const approved = editionLib.withArtifactHash({ ...candidate, publicationStatus: 'approved', approval: { candidateHash: expectedHash, reviewer: reviewer.trim(), approvedAt: now.toISOString() } });
  if (current) history.archivePublishedEdition(current, { directory: path.join(dataDirectory, 'editions') });
  history.archivePublishedEdition(approved, { directory: path.join(dataDirectory, 'editions') });
  return editionLib.atomicWriteEdition(publicFile, approved);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const approved = approveEdition({ dataDirectory: fileURLToPath(new URL('../data/', import.meta.url)), date: process.env.EDITORIAL_DATE, slot: process.env.PUBLICATION_SLOT, expectedHash: process.env.REVIEWED_HASH, reviewer: process.env.REVIEWER });
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `artifact_hash=${approved.artifactHash}\n`);
  console.log(`Approved ${approved.editorialDate}: ${approved.artifactHash}`);
}
