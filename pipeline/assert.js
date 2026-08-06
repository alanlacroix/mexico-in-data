// pipeline/assert.js — build-time guardrails (visual-grammar §8 / scaffolding plan Phase 2).
// FAIL (exit 1) blocks the build on drift we must never ship; WARN flags things to watch.
// Run after eleventy: `npm run build` = `eleventy && node pipeline/assert.js`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const njk = fs.readdirSync(ROOT).filter((f) => f.endsWith('.njk'));
const SECTIONS = ['topic-pages'];
const fails = [], warns = [];

// FAIL 1 — no committed tool-call / paste garbage (the </content></invoke> class of bug)
for (const f of njk) if (/<\/(content|invoke|antml:invoke)>/.test(R(f))) fails.push(`paste garbage in ${f}`);

// WARN 2 — em-dashes in njk (voice law bans them in prose; the '—' null-cell placeholder in JS is fine)
let dash = 0; for (const f of njk) dash += (R(f).match(/—/g) || []).length;
if (dash) warns.push(`${dash} em-dashes across njk — confirm each is the '—' data placeholder, not prose`);

// WARN 3 — a section page's inline <style> re-accumulating after the Phase-1 dedup
for (const f of SECTIONS.map((s) => s + '.njk').filter((f) => fs.existsSync(path.join(ROOT, f)))) {
  const m = R(f).match(/<style>([\s\S]*?)<\/style>/);
  const n = m ? m[1].split('\n').filter((l) => l.trim() && !l.trim().startsWith('/*')).length : 0;
  const limit = f === 'topic-pages.njk' ? 180 : 75;
  if (n > limit) warns.push(`${f} inline <style> has ${n} css lines (>${limit} — drift creeping back into the page?)`);
}

// FAIL 6 — a fetch timestamp may say when we checked a source, never when the
// observation is "as of". Each tile/exhibit carries the observation vintage.
for (const f of njk) {
  const text = R(f);
  if (/meta\.fetchedAt[\s\S]{0,900}board-asof[^\n]{0,180}['"`]as of /i.test(text))
    fails.push(`${f} labels a fetch timestamp as an observation "as of" date`);
}

// WARN 5 — section pages still defining forked render functions inline (belong in mb.js)
for (const f of SECTIONS.map((s) => s + '.njk').filter((f) => fs.existsSync(path.join(ROOT, f)))) {
  const fns = (R(f).match(/function (renderWatch|renderTiles|renderBoard|renderWire)\b/g) || []).map((x) => x.replace('function ', ''));
  if (fns.length) warns.push(`${f} defines inline ${fns.join(', ')} (candidate to move into mb.js)`);
}

warns.forEach((w) => console.log('  WARN ' + w));
if (fails.length) { fails.forEach((f) => console.error('  FAIL ' + f)); console.error(`\nassert: ${fails.length} failure(s) — build blocked.`); process.exit(1); }
console.log(`assert: ok (${warns.length} warning${warns.length === 1 ? '' : 's'}).`);
