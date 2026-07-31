import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(FILE), '..');
const STATUS_PATH = path.join(ROOT, 'data', 'publication-status.json');
const SLOT_RANK = { morning: 1, afternoon: 2 };

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

function requestedSlot({ requested = 'auto', schedule = '', now = new Date() } = {}) {
  if (requested === 'morning' || requested === 'afternoon') return requested;
  if (/13,14/.test(schedule)) return 'morning';
  if (/21,22/.test(schedule)) return 'afternoon';
  const hour = Number(zonedParts(now, 'America/New_York').hour);
  return hour >= 17 ? 'afternoon' : 'morning';
}

export function editorialDecision({ requested = 'auto', schedule = '', now = new Date(), status = null, force = false } = {}) {
  const slot = requestedSlot({ requested, schedule, now });
  const easternHour = Number(zonedParts(now, 'America/New_York').hour);
  const dueHour = slot === 'afternoon' ? 17 : 9;
  const editorialDate = dateKey(now);

  if (easternHour < dueHour) {
    return { run: false, slot, editorialDate, reason: `not due before ${dueHour}:00 Eastern` };
  }

  const publishedRank = status?.editorialDate === editorialDate ? (SLOT_RANK[status.slot] || 0) : 0;
  if (!force && publishedRank >= SLOT_RANK[slot]) {
    return { run: false, slot, editorialDate, reason: `${status.slot} edition already published` };
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
    requested: process.env.REQUESTED_SLOT || 'auto',
    schedule: process.env.SCHEDULE || '',
    now,
    status,
    force: process.env.FORCE_PUBLICATION === 'true',
  });
  writeOutput(result);
}
