// An explicit editorial withdrawal is a hold, not publication or a budget refund.
import fs from 'node:fs';
import publicEdition from './public-edition.cjs';
export function readWithdrawals(file = new URL('../../ops/withdrawn-editions.json', import.meta.url)) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, withdrawals: [] }; throw error; }
}
export function withdrawalHold({ registry, date, published, edition }) {
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.withdrawals)) throw new Error('Invalid editorial withdrawal registry');
  const matches = registry.withdrawals.filter(row => row.editorialDate === date);
  if (!matches.length) return null;
  if (matches.length !== 1) throw new Error('Ambiguous editorial withdrawal');
  const row = matches[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.editorialDate)
    || !/^[a-f0-9]{64}$/.test(row.withdrawnHash || '')
    || !/^[a-f0-9]{64}$/.test(row.lastGoodHash || '')
    || !/^\d{4}-\d{2}-\d{2}$/.test(row.lastGoodDate || '')
    || row.lastGoodDate >= date || !Number.isFinite(Date.parse(row.withdrawnAt))
    || typeof row.reason !== 'string' || !row.reason.trim()
    || !/^https:\/\/github\.com\/alanlacroix\/mexico-in-data\/pull\/\d+$/.test(row.repairUrl || '')) throw new Error('Invalid editorial withdrawal record');
  // A reconciled newer artifact is not held by a historical withdrawal.
  if (published.artifactHash !== row.withdrawnHash) return null;
  if (edition.editorialDate !== row.lastGoodDate || edition.artifactHash !== row.lastGoodHash
    || !publicEdition.validateEdition(edition).ok) throw new Error('Withdrawn edition does not match the validated last-good artifact');
  return { run: false, slot: published.slot, retry: false, verify: true, held: true, reason: row.reason };
}
