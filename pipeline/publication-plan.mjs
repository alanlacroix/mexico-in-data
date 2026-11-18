// Decide whether an automatic trigger may spend one bounded edition attempt.
import fs from 'node:fs';
import { editorialPublicationPlan } from './lib/editorial-publication.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import newsDay from './lib/news-day.cjs';
import publicEdition from './lib/public-edition.cjs';
import attemptsContract from './lib/edition-attempts.cjs';
import { readWithdrawals, withdrawalHold } from './lib/withdrawn-editions.mjs';
import { readPublicationRequest, validatePublicationRequest } from './lib/publication-request.mjs';

// Shared workflow concurrency guarantees the previous production runner has exited.
// Only the new durable protocol proves its unknown bill is already accounted for;
// legacy incomplete attempts still require diagnosis rather than a guessed refund.
export function recoverInterruptedAttempts(attempts, date, runId, runAttempt = '1') {
  if (!runId) throw new Error('Interrupted-attempt recovery requires the current workflow run');
  for (const row of attemptsContract.readAttempts(attempts).attempts) {
    if (row.editorialDate !== date || row.state !== 'started') continue;
    const accounting = row.modelAccounting;
    if (accounting?.version !== 1 || !/^\d+$/.test(accounting.runId || '')
      || (accounting.runId === String(runId) && String(accounting.runAttempt || '1') === String(runAttempt)) || !accounting.receipts?.length
      || accounting.receipts.some(receipt => !Number.isFinite(receipt.accountedUSD) || receipt.accountedUSD < 0)
      || Number(row.costUSD) + 0.000001 < accounting.receipts.reduce((sum, receipt) => sum + receipt.accountedUSD, 0)) continue;
    row.state = 'failed';
    row.reason = 'Previous runner interrupted; maximum charges retained for unsettled model calls';
    row.completedAt = new Date().toISOString();
  }
  return attempts;
}

export function morningCollectionWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const minutes = Number(parts.find(part => part.type === 'hour').value) * 60
    + Number(parts.find(part => part.type === 'minute').value);
  return minutes >= 6 * 60 + 5 && minutes <= 6 * 60 + 45;
}

// A repeat trigger may acknowledge a known failure, never hide unknown charges.
function failedAttemptHold(attempts, row, reason) {
  const rows = attemptsContract.readAccountingAttempts(attempts).attempts.filter(item => item.editorialDate === row.editorialDate);
  if (rows.some(item => item.state === 'started'
    || (item.state === 'failed' && (!item.completedAt || !Number.isFinite(Date.parse(item.completedAt))))
    || item.modelAccounting?.receipts.some(receipt => receipt.state !== 'settled'))) {
    throw new Error(`Unsettled edition accounting requires diagnosis: ${row.editorialDate}`);
  }
  if (!row.completedAt || !Number.isFinite(Date.parse(row.completedAt))
    || row.modelAccounting?.receipts.some(receipt => receipt.state !== 'settled')) {
    throw new Error(`Unsettled edition attempt requires diagnosis: ${row.editorialDate}/${row.slot}`);
  }
  return { run: false, slot: row.slot, retry: false, held: true,
    reason: `${reason}: ${row.editorialDate}/${row.slot}. Recorded failure remains unresolved: ${row.reason || 'see original run'}` };
}

function zeroCallBudgetRejection(row) {
  return row.calls === 0 && row.costUSD === 0
    && /^(?:daily model budget would be exceeded \(|model budget preflight blocked: )/.test(row.reason || '');
}

export function validateRetainedEdition(edition, withdrawals) {
  if (withdrawals?.schemaVersion !== 1 || !Array.isArray(withdrawals.withdrawals)) throw new Error('Invalid editorial withdrawal registry');
  if (!publicEdition.validateEdition(edition).ok
    || withdrawals.withdrawals.some(row => row.withdrawnHash === edition.artifactHash)) {
    throw new Error('Retained edition is invalid or withdrawn');
  }
}

export function publicationPlan({ event, workflow = '', date, attempts, slot = 'morning', retry = false, edition, publicationRequest, editorialReceipt, withdrawals = { schemaVersion: 1, withdrawals: [] }, now = new Date() }) {
  const collectionTrigger = event === 'workflow_run' && workflow === 'collect-news';
  if (collectionTrigger && (!morningCollectionWindow(now) || newsDay.editorialDay(now) !== date)) {
    return { run: false, slot: 'morning', retry: false };
  }
  if (event === 'push') {
    const requested = validatePublicationRequest(publicationRequest, now);
    if (!requested || requested.editorialDate !== date) return { run: false, slot: 'morning', retry: false };
    slot = requested.slot;
  }
  if (!['morning', 'noon'].includes(slot)) throw new Error('Invalid publication slot');
  const rows = attemptsContract.readAttempts(attempts).attempts.filter(row => row.editorialDate === date);
  const editorial = editorialPublicationPlan({ receipt: editorialReceipt, edition, attempts, date, withdrawals });
  if (editorial) return editorial;
  // A successful artifact or pending review is never regenerated by a code check.
  const publishedRows = rows.filter(row => row.state === 'published');
  const published = publishedRows.find(row => row.artifactHash === edition?.artifactHash) || publishedRows[0];
  if (published) {
    if (withdrawals.withdrawals?.some(row => row.editorialDate === date) && publishedRows.length !== 1) throw new Error('Ambiguous published withdrawal');
    const hold = withdrawalHold({ registry: withdrawals, date, published, edition });
    if (hold) return hold;
    if (edition?.editorialDate !== date || edition?.artifactHash !== published.artifactHash) {
      throw new Error(`Published ledger does not match the committed public artifact: ${date}`);
    }
    return { run: false, slot: published.slot, retry: false, verify: true };
  }
  if (rows.some(row => row.state === 'review-required')) return { run: false, slot, retry: false };
  // A still-running/unknown bill must not be silenced by another slot's hold.
  if (rows.some(row => row.state === 'started')) throw new Error(`Incomplete edition attempt requires diagnosis: ${date}`);
  if (event === 'workflow_dispatch') {
    const requested = rows.find(row => row.slot === slot);
    if (requested?.state === 'failed') {
      if (!retry) return failedAttemptHold(attempts, requested, 'Explicit failed-attempt recovery required');
      if ((requested.recoveries || []).length >= attemptsContract.MAX_RECOVERY_RUNS) {
        return failedAttemptHold(attempts, requested, 'Bounded recovery exhausted');
      }
    }
    return { run: true, slot, retry };
  }
  const failed = rows.filter(row => row.state === 'failed')
    .sort((a, b) => Number(b.slot === 'noon') - Number(a.slot === 'noon'))[0];
  if (failed) {
    if (zeroCallBudgetRejection(failed)) return failedAttemptHold(attempts, failed, 'Automatic retry held after zero-call budget rejection; explicit bounded recovery requires diagnosis');
    if ((failed.recoveries || []).length >= attemptsContract.MAX_RECOVERY_RUNS) {
      // The separate noon attempt is already part of the daily budget contract.
      // Once morning recovery is exhausted, it is the only remaining bounded path.
      if (failed.slot === 'morning' && !rows.some(row => row.slot === 'noon')) {
        return { run: true, slot: 'noon', retry: false };
      }
      return failedAttemptHold(attempts, failed, 'Bounded recovery exhausted');
    }
    return { run: true, slot: failed.slot, retry: true };
  }
  // A successful code check can recover a failure, never start unsolicited generation.
  return { run: event === 'schedule' || event === 'push' || collectionTrigger, slot, retry: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = new URL('../data/edition-attempts.json', import.meta.url);
  const now = new Date();
  const date = newsDay.editorialDay(now);
  const event = process.env.TRIGGER_EVENT;
  const publicationRequest = event === 'push' ? readPublicationRequest(undefined, now) : undefined;
  const ignoredRequest = event === 'push' && !publicationRequest;
  // A malformed or expired signal must not even mutate attempt recovery state.
  const edition = ignoredRequest ? { editorialDate: date, artifactHash: '' }
    : JSON.parse(fs.readFileSync(new URL('../data/edition.json', import.meta.url), 'utf8'));
  let attempts = ignoredRequest ? { attempts: [] }
    : attemptsContract.readAccountingAttempts(JSON.parse(fs.readFileSync(data, 'utf8')));
  const receiptFile = new URL(`../ops/editorial-publications/${date}.json`, import.meta.url);
  const editorialReceipt = !ignoredRequest && fs.existsSync(receiptFile) ? JSON.parse(fs.readFileSync(receiptFile, 'utf8')) : undefined;
  if (!ignoredRequest && !editorialReceipt && process.env.GITHUB_ACTIONS === 'true') {
    attempts = recoverInterruptedAttempts(attempts, date, process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT);
    fs.writeFileSync(data, `${JSON.stringify(attempts, null, 2)}\n`);
  }
  const withdrawals = ignoredRequest ? undefined : readWithdrawals();
  const plan = publicationPlan({
    edition, withdrawals, editorialReceipt,
    event, workflow: process.env.TRIGGER_WORKFLOW, date, attempts, publicationRequest, now,
    slot: process.env.REQUESTED_SLOT || 'morning', retry: process.env.REQUESTED_RECOVERY === 'true',
  });
  const output = `run=${plan.run}\nslot=${plan.slot}\nretry=${plan.retry ? '1' : '0'}\nverify=${Boolean(plan.verify)}\nheld=${Boolean(plan.held)}\neditorial_date=${edition.editorialDate}\nartifact_hash=${edition.artifactHash}\nrequested_date=${date}\n`;
  if (plan.held) {
    validateRetainedEdition(edition, withdrawals);
    const message = `Publication held for ${date}: ${plan.reason}. Last-good edition ${edition.editorialDate} retained; no new publication or model spend.`;
    console.log(message);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Publication held (not publication)\n${message}\n`);
  }
  process.stdout.write(output);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, output);
}
