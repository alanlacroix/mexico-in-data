// pipeline/assert.js — build-time guardrails (visual-grammar §8 / scaffolding plan Phase 2).
// FAIL (exit 1) blocks the build on drift we must never ship; WARN flags things to watch.
// Run after eleventy: `npm run build` = `eleventy && node pipeline/assert.js`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const njk = fs.readdirSync(ROOT).filter((f) => f.endsWith('.njk'));
const SECTIONS = ['money', 'economy', 'trade', 'politics', 'security', 'society', 'usmexico'];
const fails = [], warns = [];

// FAIL 1 — no committed tool-call / paste garbage (the </content></invoke> class of bug)
for (const f of njk) if (/<\/(content|invoke|antml:invoke)>/.test(R(f))) fails.push(`paste garbage in ${f}`);

// FAIL 2 — the Atlas municipality count must equal the loaded registry (no hard-coded count drift)
try {
  const muni = JSON.parse(R('data/meta/municipios.json')).m;
  const n = Array.isArray(muni) ? muni.length : Object.keys(muni).length;
  const m = R('atlas.njk').match(/([0-9],?[0-9]{3}) municipalities/);
  if (m && m[1].replace(/,/g, '') !== String(n)) fails.push(`atlas.njk says "${m[1]} municipalities", the registry has ${n}`);
} catch (e) { warns.push('municipios registry unreadable: ' + e.message); }

// WARN 3 — em-dashes in njk (voice law bans them in prose; the '—' null-cell placeholder in JS is fine)
let dash = 0; for (const f of njk) dash += (R(f).match(/—/g) || []).length;
if (dash) warns.push(`${dash} em-dashes across njk — confirm each is the '—' data placeholder, not prose`);

// WARN 4 — a section page's inline <style> re-accumulating after the Phase-1 dedup
for (const f of SECTIONS.map((s) => s + '.njk')) {
  const m = R(f).match(/<style>([\s\S]*?)<\/style>/);
  const n = m ? m[1].split('\n').filter((l) => l.trim() && !l.trim().startsWith('/*')).length : 0;
  if (n > 75) warns.push(`${f} inline <style> has ${n} css lines (>75 — drift creeping back into the page?)`);
}

// WARN 5 — section pages still defining forked render functions inline (belong in mb.js)
for (const f of SECTIONS.map((s) => s + '.njk')) {
  const fns = (R(f).match(/function (renderWatch|renderTiles|renderBoard|renderWire)\b/g) || []).map((x) => x.replace('function ', ''));
  if (fns.length) warns.push(`${f} defines inline ${fns.join(', ')} (candidate to move into mb.js)`);
}

warns.forEach((w) => console.log('  WARN ' + w));
if (fails.length) { fails.forEach((f) => console.error('  FAIL ' + f)); console.error(`\nassert: ${fails.length} failure(s) — build blocked.`); process.exit(1); }
console.log(`assert: ok (${warns.length} warning${warns.length === 1 ? '' : 's'}).`);
