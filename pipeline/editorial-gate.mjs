import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(FILE), '..');
const STATUS_PATH = path.join(ROOT, 'data', 'publication-status.json');
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

export function editorialDecision({ now = new Date(), status = null, force = false } = {}) {
  const slot = 'morning';
  const easternHour = Number(zonedParts(now, 'America/New_York').hour);
  const dueHour = 9;
  const editorialDate = dateKey(now);

  if (easternHour < dueHour) {
    return { run: false, slot, editorialDate, reason: `not due before ${dueHour}:00 Eastern` };
  }

  const sameDay = status?.editorialDate === editorialDate
    && VALID_RECEIPT_SLOTS.has(status?.slot);
  const state = status?.state || 'published';
  if (!force && sameDay && state === 'published') {
    return { run: false, slot, editorialDate, reason: `${status.slot} edition already published` };
  }
  if (!force && sameDay && state === 'blocked') {
    return { run: false, slot, editorialDate, reason: status.reason || 'edition is blocked pending intervention' };
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
  const now = process.env.NOW_ISO ? new Date(process.env.NOW_ISO) : new Date();
  const result = editorialDecision({
    now,
    status,
    force: process.env.FORCE_PUBLICATION === 'true',
  });
  writeOutput(result);
}
