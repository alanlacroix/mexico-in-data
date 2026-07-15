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
  if (!url) return cleanLabel;
  return /^#|^\//.test(url) ? `[${cleanLabel}](${url})` : `[${cleanLabel}](<${url}>)`;
};
const metaLine = (...parts) => parts.map(text).filter(Boolean).join(' · ');

function makePreview(draft) {
  const explicit = text(draft.previewText || draft.preheader || '');
  if (explicit) return shorten(explicit, 150);
  const lead = draft.lead || (draft.topOfWeek || [])[0];
  const fromLead = text(lead?.summary || lead?.headline || '');
  return fromLead
    ? shorten(fromLead, 150)
    : '[PREVIEW TEXT NEEDED]';
}

function makeBody(draft) {
  const lines = [];
  const add = (...values) => lines.push(...values, '');

  add('# THE MEXICO BRIEF', metaLine(draft.dateLabel, draft.readMin ? `${draft.readMin} min` : ''));

  const glance = draft.atAGlance || [];
  if (glance.length) {
    add('## In this brief');
    glance.forEach((item) => {
      const label = text(item.headline || item.label || item.text || item);
      const url = item.url || item.href || '';
      lines.push(`- ${url ? sourceLink(label, url) : label}`);
    });
    lines.push('');
  }

  if (draft.intro) add('## A note from me', text(draft.intro));

  const lead = draft.lead || (draft.topOfWeek || [])[0] || null;
  if (lead) {
    const heading = lead.url
      ? `## [${mdLabel(lead.headline)}](<${lead.url}>)`
      : `## ${text(lead.headline)}`;
    add(
      heading,
      text(lead.summary),
      lead.editorNote ? `**My read:** ${text(lead.editorNote)}` : '',
      metaLine(lead.sourceName, lead.date),
      lead.url ? sourceLink('Source ↗', lead.url) : '',
    );
  }

  const supporting = draft.supporting || [];
  if (supporting.length) {
    add('## Also this week');
    supporting.forEach((item) => {
      const heading = item.url
        ? `### [${mdLabel(item.headline)}](<${item.url}>)`
        : `### ${text(item.headline)}`;
      add(
        heading,
        text(item.summary),
        item.editorNote ? `**My read:** ${text(item.editorNote)}` : '',
        metaLine(item.sourceName, item.date),
        item.url ? sourceLink('Source ↗', item.url) : '',
      );
    });
  }

  const numbers = draft.numbers || draft.changed || [];
  if (numbers.length) {
    add('## Numbers that changed');
    numbers.forEach((item) => {
      const name = text(item.name || item.label);
      const current = text(item.current || item.move || item.val);
      const change = text(item.change || item.pillTxt);
      const source = item.sourceUrl ? sourceLink(item.source || 'Original source ↗', item.sourceUrl) : text(item.source || '');
      add(`**${[name, current].filter(Boolean).join(' — ')}**`, metaLine(change, item.period, item.status), source);
    });
  }

  const quick = draft.quickUpdates || [];
  if (quick.length) {
    add('## Other updates');
    quick.forEach((item) => {
      const label = text(item.headline || item.label || item.text || item);
      const linked = item.url ? sourceLink(label, item.url) : label;
      lines.push(`- ${linked}${item.date ? ` · ${text(item.date)}` : ''}`);
    });
    lines.push('');
  }

  const watch = draft.watch || [];
  if (watch.length) {
    add('## Next week');
    watch.forEach((item) => {
      const source = item.sourceUrl ? ` ${sourceLink(item.source || 'source ↗', item.sourceUrl)}` : '';
      const why = item.why ? ` ${text(item.why)}` : '';
      lines.push(`- **${text(item.dt)}** — ${text(item.w)}${why}${source}`);
    });
    lines.push('');
  }

  add('Alan', '---', 'Every number is dated and linked to its source. When I give you my own read, I label it. If something looks wrong, reply and tell me.');
  return `${lines.filter((line, index) => line !== '' || lines[index - 1] !== '').join('\n').trim()}\n`;
}

function makeQuestions(draft) {
  if (draft.editorApproved === true && draft.status === 'approved') {
    return 'Approved by Alan. No open editorial questions.\n';
  }
  const questions = (draft.reviewQuestions || []).map((item) => text(item.question || item)).filter(Boolean);
  const fallback = [
    'Is this the right lead? If not, which candidate should replace it?',
    'Do you have a read on the lead? One or two rough sentences are enough. "None this week" is fine.',
    'What is missing, or what should be cut?',
  ];
  return `${(questions.length ? questions : fallback).map((question, index) => `${index + 1}. ${question}`).join('\n\n')}\n`;
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

  const selectedStories = [draft.lead, ...(draft.supporting || [])].filter(Boolean);
  const blockers = [];
  const editorApproved = draft.editorApproved === true && draft.status === 'approved';
  if (!draft._llm && !editorApproved) blockers.push('The summary model did not run. Source descriptions are review material, not finished copy.');
  if (!selectedStories.length) blockers.push('No lead or supporting story was produced.');
  if ((draft.lintFlags || []).length) blockers.push(`The draft has ${draft.lintFlags.length} unresolved copy flag(s).`);
  if (text(draft.previewText) === '[PREVIEW TEXT NEEDED]') blockers.push('Preview text is missing.');
  for (const story of selectedStories) {
    if (!text(story.summary) || /\[SUMMARY UNAVAILABLE\]/i.test(text(story.summary))) {
      blockers.push(`${text(story.headline) || 'A selected story'} has no usable summary.`);
    }
  }
  const blocked = blockers.length > 0;

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
  const questions = makeQuestions(draft);
  const fields = [
    'BEEHIIV POST FIELDS',
    '',
    `Subject: ${text(draft.subject || `The Mexico Brief — ${week}`)}`,
    `Preview text: ${previewText}`,
    '',
    'Both lines require Alan’s review before they are entered in Beehiiv.',
    '',
  ].join('\n');
  const instructions = blocked ? [
    `THE MEXICO BRIEF · BLOCKED REVIEW · ${week}`,
    '',
    'This draft is not ready to enter in Beehiiv.',
    '',
    ...blockers.map((reason) => `- ${reason}`),
    '',
    'Review draft.json and rendered-reference.html, then rerun the build after fixing the blockers.',
    'Nothing in this folder can send an email.',
    '',
  ].join('\n') : [
    `THE MEXICO BRIEF · BEEHIIV REVIEW PACKAGE · ${week}`,
    '',
    'This folder cannot send an email. It contains the handoff for Beehiiv’s Post Builder.',
    '',
    '1. Alan answers the three questions in questions.txt.',
    '2. Apply those answers to the draft. Do not repair unsupported claims while pasting.',
    '3. Read fields.txt and body.md beside rendered-reference.html.',
    '4. Create a new Beehiiv post and enter the subject and preview text.',
    '5. Copy body.md into the Post Builder section by section. Recheck every link.',
    '6. Use Beehiiv’s own footer/unsubscribe block. Do not paste a static unsubscribe link.',
    '7. Send a Beehiiv test. Check desktop, mobile, links, numbers, sender, and reply-to.',
    '8. Schedule or send in Beehiiv only after Alan approves the delivered test.',
    '',
    'The GitHub workflow stops after producing this folder.',
    '',
  ].join('\n');

  if (!blocked) {
    fs.writeFileSync(path.join(outRoot, 'fields.txt'), fields);
    fs.writeFileSync(path.join(outRoot, 'body.md'), body);
  } else {
    fs.writeFileSync(path.join(outRoot, 'BLOCKED.txt'), `${blockers.join('\n')}\n`);
  }
  fs.writeFileSync(path.join(outRoot, 'questions.txt'), questions);
  fs.writeFileSync(path.join(outRoot, 'README.txt'), instructions);
  fs.copyFileSync(draftPath, path.join(outRoot, 'draft.json'));
  fs.copyFileSync(htmlPath, path.join(outRoot, 'rendered-reference.html'));

  const files = blocked
    ? ['README.txt', 'BLOCKED.txt', 'questions.txt', 'draft.json', 'rendered-reference.html']
    : ['README.txt', 'fields.txt', 'body.md', 'questions.txt', 'draft.json', 'rendered-reference.html'];
  const manifest = {
    provider: 'beehiiv',
    action: blocked ? 'blocked-review' : 'manual-post-builder-handoff',
    canSend: false,
    blocked,
    blockers,
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
  console.log(`  status: ${blocked ? 'BLOCKED' : 'ready for Alan review'}`);
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
