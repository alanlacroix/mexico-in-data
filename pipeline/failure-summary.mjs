import fs from 'node:fs';

const file = new URL('../data/edition-attempts.json', import.meta.url);
const ledger = JSON.parse(fs.readFileSync(file, 'utf8'));
const attempt = (ledger.attempts || []).at(-1);
if (!attempt || attempt.state !== 'failed') process.exit(0);

const lines = [
  `## Edition recovery needed: ${attempt.editorialDate} / ${attempt.slot}`,
  '',
  attempt.reason || 'The edition failed without a recorded reason.',
  '',
  `Model calls: ${attempt.calls || 0} · Cost: $${Number(attempt.costUSD || 0).toFixed(4)}`,
];
for (const diagnostic of attempt.diagnostics || []) {
  lines.push('', `### ${diagnostic.storyId}`);
  for (const [field, detail] of Object.entries(diagnostic.fields || {})) {
    for (const reason of detail.reasons || []) lines.push(`- ${field}: ${reason}`);
  }
  for (const reason of diagnostic.reasons || []) lines.push(`- ${reason}`);
}
const text = `${lines.join('\n')}\n`;
process.stdout.write(text);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
