// Records the newest actually sent Beehiiv edition. This is deliberately separate
// from the Sunday draft pipeline: /latest-edition must never move to a draft.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : '';
};

const week = valueAfter('--week');
const rawUrl = valueAfter('--url');
const publishedAtInput = valueAfter('--published-at');

if (!/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(week)) throw new Error('Use a valid --week YYYY-Www.');

const publishedAt = new Date(publishedAtInput);
if (!publishedAtInput || !Number.isFinite(publishedAt.getTime())) {
  throw new Error('Use --published-at with the actual Beehiiv publication time.');
}

let url;
try { url = new URL(rawUrl); }
catch { throw new Error('Use a complete public HTTPS URL.'); }

if (url.protocol !== 'https:') throw new Error('The published edition URL must use HTTPS.');
if (url.username || url.password || url.search || url.hash) throw new Error('Do not record credentials, query tokens, or fragments.');
if (/\b(?:draft|preview|test)\b/i.test(url.pathname)) throw new Error('The URL looks like a draft, preview, or test.');
const allowedHost = url.hostname === 'mexicobrief.com'
  || url.hostname === 'www.mexicobrief.com'
  || url.hostname.endsWith('.beehiiv.com')
  || (process.env.BEEHIIV_PUBLIC_HOST && url.hostname === process.env.BEEHIIV_PUBLIC_HOST);
if (!allowedHost || !/\/p\//.test(url.pathname)) {
  throw new Error('Use the public /p/ URL from The Mexico Brief publication.');
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 15000);
let response;
try {
  response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'The-Mexico-Brief-published-link-check/1.0' } });
} finally {
  clearTimeout(timer);
}
if (!response.ok) throw new Error(`The public URL returned HTTP ${response.status}.`);

const finalUrl = new URL(response.url);
if (finalUrl.protocol !== 'https:' || finalUrl.username || finalUrl.password || finalUrl.search || finalUrl.hash) {
  throw new Error('The public URL redirected to an unsafe or tokenized address.');
}
if (/\b(?:draft|preview|test)\b/i.test(finalUrl.pathname)) throw new Error('The final URL looks like a draft, preview, or test.');
const finalAllowedHost = finalUrl.hostname === 'mexicobrief.com'
  || finalUrl.hostname === 'www.mexicobrief.com'
  || finalUrl.hostname.endsWith('.beehiiv.com')
  || (process.env.BEEHIIV_PUBLIC_HOST && finalUrl.hostname === process.env.BEEHIIV_PUBLIC_HOST);
if (!finalAllowedHost || !/\/p\//.test(finalUrl.pathname)) {
  throw new Error('The URL redirected outside the publication.');
}

const html = (await response.text()).slice(0, 500000);
if (!/Mexico Brief/i.test(html)) throw new Error('The page does not identify itself as The Mexico Brief.');

const recordPath = path.join(ROOT, '_data', 'latestEdition.json');
let previous = null;
try { previous = JSON.parse(fs.readFileSync(recordPath, 'utf8')); } catch {}
if (previous?.status === 'published' && previous.week && week <= previous.week) {
  throw new Error(`The latest published week is already ${previous.week}; refusing to move backward or overwrite it.`);
}

const record = {
  status: 'published',
  week,
  publishedAt: publishedAt.toISOString(),
  recordedAt: new Date().toISOString(),
  url: finalUrl.toString(),
};
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
console.log(`Recorded ${week}: ${record.url}`);
