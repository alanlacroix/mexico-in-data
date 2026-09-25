import fs from 'node:fs';
const date = process.env.EDITORIAL_DATE;
const slot = process.env.PUBLICATION_SLOT;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !['morning', 'noon'].includes(slot)) throw new Error('Invalid candidate identity');
const candidate = JSON.parse(fs.readFileSync(new URL(`../data/candidates/${date}-${slot}.json`, import.meta.url)));
// Escape source-derived copy rather than allowing HTML in the operational summary.
const safe = value => String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const lines = ['## Human review required', `Date: ${date} · Slot: ${slot}`, '', `Reviewed hash: \`${candidate.artifactHash}\``, '', 'Read both languages and the linked evidence before running approve-edition with this exact hash. Approval publishes this artifact after the release checks pass.', ''];
for (const story of candidate.stories) {
  for (const locale of ['en', 'es']) {
    lines.push(`### ${locale.toUpperCase()}: ${safe(story[locale].headline)}`);
    for (const field of ['dek', 'background', 'view', 'watch']) lines.push(`${field}: ${safe(story[locale][field])}`, '');
  }
  lines.push('Evidence:');
  for (const source of story.evidence) lines.push(`- ${safe(source.source)}: ${safe(source.url)}`);
  lines.push('');
}
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
else console.log(lines.join('\n'));
