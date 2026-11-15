import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function failureSummary(ledger, date, slot) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !['morning', 'noon'].includes(slot)) {
    throw new Error('Invalid failed-attempt identity');
  }
  const matches = (ledger.attempts || []).filter(row => row.editorialDate === date && row.slot === slot);
  if (matches.length > 1) throw new Error('Ambiguous failed-attempt identity');
  const attempt = matches[0];
  if (!attempt || attempt.state !== 'failed') {
    return `## Edition workflow failed: ${date} / ${slot}\nNo failed ledger row for this attempt; inspect this run's failing step. No unrelated failure receipt is substituted.\n`;
  }
  const lines = [
    `## Edition recovery needed: ${attempt.editorialDate} / ${attempt.slot}`,
    '',
    attempt.reason || 'The edition failed without a recorded reason.',
    '',
    `Recorded slot totals (including recovery, not new spend for this invocation): ${attempt.calls || 0} model calls · $${Number(attempt.costUSD || 0).toFixed(4)}`,
  ];
  for (const diagnostic of attempt.diagnostics || []) {
    lines.push('', `### ${diagnostic.storyId}`);
    for (const [field, detail] of Object.entries(diagnostic.fields || {})) {
      for (const reason of detail.reasons || []) lines.push(`- ${field}: ${reason}`);
    }
    for (const reason of diagnostic.reasons || []) lines.push(`- ${reason}`);
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ledger = JSON.parse(fs.readFileSync(new URL('../data/edition-attempts.json', import.meta.url), 'utf8'));
  const text = failureSummary(ledger, process.env.EDITORIAL_DATE, process.env.PUBLICATION_SLOT);
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}
