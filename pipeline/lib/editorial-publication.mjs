// Editorial publication is a separate event, never a rewrite of a model attempt.
import fs from 'node:fs';
import crypto from 'node:crypto';
import editionLib from './public-edition.cjs';
import attemptsLib from './edition-attempts.cjs';
export const digest = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export function settledAccounting(attempts, date) {
  const rows = attemptsLib.readAccountingAttempts(attempts).attempts;
  if (rows.some(row => row.state === 'started' || row.modelAccounting?.receipts.some(r => r.state !== 'settled'))) throw new Error('Unsettled accounting blocks editorial publication');
  return digest(rows.filter(row => row.editorialDate === date));
}
export function editorialPublicationPlan({ receipt, edition, attempts, date, withdrawals }) {
  if (!receipt) return null;
  if (receipt.schemaVersion !== 1 || receipt.kind !== 'independent-editorial-publication' || receipt.editorialDate !== date
    || !/^[a-f0-9]{64}$/.test(receipt.attemptsSha256 || '') || !/^[a-f0-9]{64}$/.test(receipt.spendSha256 || '')
    || receipt.additionalProviderCalls !== 0 || !/^[a-f0-9]{64}$/.test(receipt.packetHash || '')
    || receipt.artifactHash !== edition?.artifactHash || receipt.candidateHash !== edition?.approval?.candidateHash
    || receipt.reviewer !== edition?.approval?.reviewer || receipt.approvedAt !== edition?.approval?.approvedAt
    || edition.editorialDate !== date || edition.publicationStatus !== 'approved' || !editionLib.validateEdition(edition).ok
    || receipt.accountingDateHash !== settledAccounting(attempts, date)) throw new Error('Editorial publication receipt does not match artifact/accounting');
  if (!withdrawals || withdrawals.schemaVersion !== 1 || !Array.isArray(withdrawals.withdrawals)) throw new Error('Invalid withdrawal registry');
  if (withdrawals.withdrawals.some(row => row.withdrawnHash === receipt.artifactHash)) throw new Error('Editorial publication was withdrawn');
  return { run: false, slot: edition.slot, retry: false, verify: true };
}
