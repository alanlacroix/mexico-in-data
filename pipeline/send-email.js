// send-email.js — the approve-and-send step. Separate from build on purpose:
// build-email.js only ever writes a draft, this is the single explicit act that
// puts an issue in front of readers. Default-hold: with no --confirm it prints
// what it would send and stops; with no BUTTONDOWN_API_KEY it dry-runs even with
// --confirm. Nothing leaves without both.
//
//   node send-email.js                          # dry run of the latest draft
//   node send-email.js --week 2026-W28 --confirm   # send that issue
//   node send-email.js --confirm --draft        # push to Buttondown as a draft, don't send
//
// Buttondown does the delivery + unsubscribe handling. One key (BUTTONDOWN_API_KEY),
// free up to a few hundred subscribers. Base URL is overridable if their host moves.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasStore, upsertIssue } from './lib/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const D = (...p) => path.join(ROOT, 'data', ...p);

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const KEY = process.env.BUTTONDOWN_API_KEY || '';
const BASE = (process.env.BUTTONDOWN_API_BASE || 'https://api.buttondown.email/v1').replace(/\/$/, '');

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

async function main() {
  const latest = readJson(D('email', 'latest.json'), null);
  const week = val('--week') || latest?.week;
  if (!week) { console.error('no issue to send. run build-email.js first.'); process.exit(1); }

  const draft = readJson(D('email', week + '.json'), null);
  const htmlPath = D('email', week + '.html');
  if (!draft || !fs.existsSync(htmlPath)) { console.error(`no built issue for ${week} (missing ${week}.json/.html). run build-email.js.`); process.exit(1); }
  const html = fs.readFileSync(htmlPath, 'utf8');
  const subject = draft.subject || `The Mexico Brief — ${week}`;
  const asDraft = has('--draft');

  console.log(`\nsend-email · issue ${draft.issue} · ${week}`);
  console.log(`  subject: ${subject}`);
  console.log(`  ${(draft.topOfWeek || []).length} leads · ${(draft.rooms || []).reduce((s, r) => s + r.items.length, 0)} room items · ${draft.readMin}-min · ${html.length} bytes`);

  if (!has('--confirm')) {
    console.log('\n  DRY RUN (no --confirm). Nothing sent. Add --confirm to send, --draft to stage in Buttondown.\n');
    return;
  }
  if (!KEY) {
    console.log('\n  DRY RUN (no BUTTONDOWN_API_KEY). Would POST to Buttondown now. Set the key to send for real.\n');
    return;
  }

  const body = { subject, body: html, status: asDraft ? 'draft' : 'about_to_send' };
  let r;
  try {
    r = await fetch(`${BASE}/emails`, {
      method: 'POST',
      headers: { 'Authorization': `Token ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) { console.error('  send failed (network):', e.message); process.exit(1); }

  const txt = await r.text();
  if (!r.ok) { console.error(`  Buttondown ${r.status}:`, txt.slice(0, 400)); process.exit(1); }
  let out = {}; try { out = JSON.parse(txt); } catch { /* ignore */ }
  console.log(`\n  ${asDraft ? 'staged as draft' : 'SENT'} · Buttondown id ${out.id || '?'}${out.absolute_url ? ' · ' + out.absolute_url : ''}`);

  // record that this issue went out
  if (!asDraft) {
    const sentAt = new Date().toISOString();
    fs.writeFileSync(D('email', 'latest.json'), JSON.stringify({ ...latest, week, status: 'sent', sentAt, buttondownId: out.id || null }, null, 2));
    const dj = readJson(D('email', week + '.json'), null); if (dj) { dj.status = 'sent'; fs.writeFileSync(D('email', week + '.json'), JSON.stringify(dj, null, 2)); }
    if (hasStore()) { try { await upsertIssue({ week, issue_no: draft.issue, subject, status: 'sent', draft, built_at: draft.builtAt || null, sent_at: sentAt }); } catch (e) { console.warn('  store: sent-update failed —', e.message); } }
  }
  console.log('');
}

main().catch((e) => { console.error('send-email failed:', e.stack || e.message); process.exit(1); });
