// prepare-beehiiv.js — build a review package for Beehiiv's Post Builder.
//
// This script never calls a provider API and cannot send an email. It turns one
// built issue into a small, portable folder Alan can review and enter into
// Beehiiv: subject + preview text, an editor-friendly Markdown body, the exact
// generated draft, and the rendered HTML as a visual reference.
//
//   node pipeline/prepare-beehiiv.js --week 2026-W28
//   node pipeline/prepare-beehiiv.js                 # latest built issue

// Output: tmp/beehiiv-review/<week>/


import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = (...parts) => path.join(ROOT, 'data', 'email', ...parts);

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const shorten = (text, max) => {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

function decodeEntities(value) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘',
    rdquo: '”', ldquo: '“', bull: '•', middot: '·',
  };
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function text(value) {
  return decodeEntities(String(value || ''))
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/<[\/?a-z][^>]*$/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const mdLabel = (value) => text(value).replace(/([\[\]\\])/g, '\\$1');
const sourceLink = (label, url) => {
  const cleanLabel = mdLabel(label || 'Original source');
  return url ? `[${cleanLabel}](<${url}>)` : cleanLabel;
};
const metaLine = (...parts) => parts.map(text).filter(Boolean).join(' · ');

function makePreview(draft) {
  const explicit = text(draft.previewText || draft.preheader || '');
  if (explicit) return shorten(explicit, 150);
  const lead = (draft.topOfWeek || [])[0];
  const fromLead = text(lead?.summary || lead?.headline || '');
  return fromLead
    ? shorten(fromLead, 150)
    : 'Mexico this week: the numbers, the news, and what comes next.';
}

function makeBody(draft) {
  const lines = [];
  const add = (...values) => lines.push(...values, '');

  add('# THE MEXICO BRIEF', metaLine(draft.dateLabel, draft.issue ? `Issue ${draft.issue}` : ''));
  if (draft.intro) add(text(draft.intro));

  const leads = draft.topOfWeek || [];
  if (leads.length) {
    add('## Top of the week');
    leads.forEach((item) => {
      const heading = item.url
        ? `### [${mdLabel(item.headline)}](<${item.url}>)`
        : `### ${text(item.headline)}`;
      add(
        heading,
        metaLine(item.room, item.sourceName, item.date),
        text(item.summary),
        item.why ? `**Why it matters:** ${text(item.why)}` : '',
        item.url ? sourceLink('Original source ↗', item.url) : '',
      );
    });
  }

  const board = draft.board || [];
  if (board.length) {
    add('## The numbers');
    board.forEach((row) => {
      const change = [text(row.pillTxt), text(row.note)].filter(Boolean).join(', ');
      add(
        `**${text(row.name)} — ${text(row.val)}**${change ? ` (${change})` : ''}`,
        text(row.sub),
      );
    });
  }

  const changed = draft.changed || [];
  if (changed.length) {
    add('## What changed this week');
    changed.forEach((item) => {
      const heading = `**${text(item.label)}${item.move ? ` — ${text(item.move)}` : ''}**`;
      add(heading, metaLine(item.period, item.source), item.sourceUrl ? sourceLink('Original source ↗', item.sourceUrl) : '');
    });
  }

  (draft.rooms || []).forEach((room) => {
    if (!room.items?.length) return;
    add(`## ${text(room.eyebrow)}`);
    room.items.forEach((item) => {
      const heading = item.url
        ? `### [${mdLabel(item.t)}](<${item.url}>)`
        : `### ${text(item.t)}`;
      add(
        heading,
        text(item.d),
        metaLine(item.source, item.date),
        item.url ? sourceLink('Original source ↗', item.url) : '',
      );
    });
  });

  const watch = draft.watch || [];
  if (watch.length) {
    add('## What to watch');
    watch.forEach((item) => lines.push(`- **${text(item.dt)}** — ${text(item.w)}`));
    lines.push('');
  }

  add('---', 'Built for Alan, open to anyone. Every number and story should link back to its source.');
  return `${lines.filter((line, index) => line !== '' || lines[index - 1] !== '').join('\n').trim()}\n`;
}

function main() {
  const latestPath = DATA('latest.json');
  const latest = fs.existsSync(latestPath) ? readJson(latestPath) : null;
  const week = valueAfter('--week') || latest?.week;
  if (!/^\d{4}-W\d{2}$/.test(String(week || ''))) {
    throw new Error('Choose one issue with --week YYYY-Www.');
  }

  const draftPath = DATA(`${week}.json`);
  const htmlPath = DATA(`${week}.html`);
  if (!fs.existsSync(draftPath) || !fs.existsSync(htmlPath)) {
    throw new Error(`Missing ${week}.json or ${week}.html. Run build-email.js first.`);
  }

  const draft = readJson(draftPath);
  if (draft.week !== week) throw new Error(`Draft week is ${draft.week || 'missing'}, expected ${week}.`);

  const reviewRoot = path.join(ROOT, 'tmp', 'beehiiv-review');
  const outRoot = valueAfter('--out')
    ? path.resolve(valueAfter('--out'))
    : path.join(reviewRoot, week);
  if (outRoot === reviewRoot || !outRoot.startsWith(`${reviewRoot}${path.sep}`)) {
    throw new Error('--out must stay inside tmp/beehiiv-review/.');
  }
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });

  const previewText = makePreview(draft);
  const body = makeBody(draft);
  const fields = [
    'BEEHIIV POST FIELDS',
    '',
    `Subject: ${text(draft.subject || `The Mexico Brief — ${week}`)}`,
    `Preview text: ${previewText}`,
    '',
    'Both lines require Alan’s review before they are entered in Beehiiv.',
    '',
  ].join('\n');
  const instructions = [
    `THE MEXICO BRIEF · BEEHIIV REVIEW PACKAGE · ${week}`,
    '',
    'This folder cannot send an email. It contains the handoff for Beehiiv’s Post Builder.',
    '',
    '1. Read fields.txt and body.md beside rendered-reference.html.',
    '2. Fix the draft first; do not repair unsupported claims while pasting.',
    '3. Create a new Beehiiv post and enter the subject and preview text.',
    '4. Copy body.md into the Post Builder section by section. Recheck every link.',
    '5. Use Beehiiv’s own footer/unsubscribe block. Do not paste a static unsubscribe link.',
    '6. Send a Beehiiv test. Check desktop, mobile, links, numbers, sender, and reply-to.',
    '7. Schedule or send in Beehiiv only after Alan approves the delivered test.',
    '',
    'The GitHub workflow stops after producing this folder.',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(outRoot, 'fields.txt'), fields);
  fs.writeFileSync(path.join(outRoot, 'body.md'), body);
  fs.writeFileSync(path.join(outRoot, 'README.txt'), instructions);
  fs.copyFileSync(draftPath, path.join(outRoot, 'draft.json'));
  fs.copyFileSync(htmlPath, path.join(outRoot, 'rendered-reference.html'));

  const files = ['README.txt', 'fields.txt', 'body.md', 'draft.json', 'rendered-reference.html'];
  const manifest = {
    provider: 'beehiiv',
    action: 'manual-post-builder-handoff',
    canSend: false,
    week,
    issue: draft.issue || null,
    subject: text(draft.subject || `The Mexico Brief — ${week}`),
    previewText,
    builtAt: draft.builtAt || null,
    preparedAt: new Date().toISOString(),
    source: {
      draft: path.relative(ROOT, draftPath),
      html: path.relative(ROOT, htmlPath),
      draftSha256: sha256(draftPath),
      htmlSha256: sha256(htmlPath),
    },
    files: Object.fromEntries(files.map((name) => [name, sha256(path.join(outRoot, name))])),
  };
  fs.writeFileSync(path.join(outRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\nBeehiiv review package · ${week}`);
  console.log(`  ${path.relative(ROOT, outRoot)}/`);
  console.log(`  subject: ${manifest.subject}`);
  console.log(`  preview: ${previewText}`);
  console.log('  no provider API was called; nothing was sent\n');
}

try {
  main();
} catch (error) {
  console.error(`prepare-beehiiv failed: ${error.message}`);
  process.exitCode = 1;
}
