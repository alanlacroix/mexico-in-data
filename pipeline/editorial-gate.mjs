import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(FILE), '..');
const STATUS_PATH = path.join(ROOT, 'data', 'publication-status.json');
const HAPPENING_PATH = path.join(ROOT, 'data', 'happening.json');
const BLOCK_PATH = path.join(ROOT, 'ops', 'publication-block.json');
const VALID_RECEIPT_SLOTS = new Set(['morning', 'afternoon']); // read legacy receipts; only morning is written now

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function dateKey(date, timeZone = 'America/Mexico_City') {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function editorialDecision({ now = new Date(), status = null, force = false, terminalBlock = null } = {}) {
  const slot = 'morning';
  const easternHour = Number(zonedParts(now, 'America/New_York').hour);
  const dueHour = 9;
  const editorialDate = dateKey(now);

  if (easternHour < dueHour) {
    return { run: false, slot, editorialDate, reason: `not due before ${dueHour}:00 Eastern` };
  }

  const alreadyPublished = status?.editorialDate === editorialDate && VALID_RECEIPT_SLOTS.has(status?.slot);
  if (!force && alreadyPublished) {
    return { run: false, slot, editorialDate, reason: `${status.slot} edition already published` };
  }

  if (!force && terminalBlock?.editorialDate === editorialDate) {
    return { run: false, slot, editorialDate, reason: terminalBlock.reason || 'edition is blocked pending intervention' };
  }

  return { run: true, slot, editorialDate, reason: 'edition is due' };
}

function writeOutput(result) {
  const lines = [
    `run=${result.run}`,
    `slot=${result.slot}`,
    `editorial_date=${result.editorialDate}`,
    `reason=${result.reason}`,
  ].join('\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`);
  console.log(lines);
}

if (process.argv[1] && path.resolve(process.argv[1]) === FILE) {
  let status = null;
  try { status = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8')); } catch { /* first publication */ }
  let happening = null;
  try { happening = JSON.parse(fs.readFileSync(HAPPENING_PATH, 'utf8')); } catch { /* first publication */ }
  let recordedBlock = null;
  try { recordedBlock = JSON.parse(fs.readFileSync(BLOCK_PATH, 'utf8')); } catch { /* no blocked run */ }
  const now = process.env.NOW_ISO ? new Date(process.env.NOW_ISO) : new Date();
  const target = happening?.meta?.analysisTarget;
  const budgetBlocked = happening?.meta?.updated === dateKey(now)
    && Array.isArray(target?.outcomes)
    && target.outcomes.some((outcome) => outcome?.ready !== true && outcome?.reason === 'budget-unavailable');
  const terminalBlock = recordedBlock?.editorialDate === dateKey(now)
    ? recordedBlock
    : budgetBlocked ? {
      editorialDate: dateKey(now),
      reason: 'selected-story analysis exhausted the monthly model allowance; waiting for a forced recovery or the next budget period',
    } : null;
  const result = editorialDecision({
    now,
    status,
    force: process.env.FORCE_PUBLICATION === 'true',
    terminalBlock,
  });
  writeOutput(result);
}
