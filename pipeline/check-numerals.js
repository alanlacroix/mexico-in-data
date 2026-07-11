// check-numerals.js — Fable's anti-drift lint. Flags HAND-TYPED numbers sitting in tile/exhibit
// VALUE positions of the page templates — the class of bug that let Economy say "80–83%" while
// Trade said "81%". A figure a reader treats as live should come from a data file (an interpolated
// ${...}), not a string literal. Story blocks are exempt: they are explicitly dated, human-written
// narrative that goes through the weekly review (Fable: "writeups are data, carry an as-of date").
//
// Heuristic + advisory: prints candidates and exits 0 (never blocks a build). Run: node check-numerals.js
// from the repo root or pipeline/. A real hit looks like  v:'~80'  or  value:81.2  in a tile/exhibit.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const njk = fs.readdirSync(ROOT).filter((f) => f.endsWith('.njk'));

// A number a reader reads as a live measurement: a percentage, a $ figure, or a bare tile value.
const SUSPECT = [
  /\bv:\s*'~?\$?\d[\d.,]*%?'/g,          // tile value literal, e.g.  v:'~80'   v:'$617bn'   v:'3.37'
  /\bvalue:\s*\d[\d.]*\b(?!\s*[+\-*/])/g, // hardcoded chart value:  value: 81.2   (not an expression)
];
// Lines we never flag: they are legitimately static or already reviewed.
const EXEMPT = /class="story"|storyBlock\(|st-src|Source:|source:|sourceUrl|href=|\/\/|label:|title:|hs:|code:|year:\s*\d|DGRACE|GRACE_DAYS|viewBox|stroke|fill:|px|rgba?\(|#[0-9a-f]{3,6}/i;

let total = 0;
for (const file of njk) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  const hits = [];
  let inStory = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/class="story"|storyBlock\(\{/.test(ln)) inStory = true;         // story blocks are exempt…
    if (inStory && /\}\)\;|<\/div>`\;/.test(ln)) { inStory = false; continue; }
    if (inStory || EXEMPT.test(ln)) continue;
    for (const rx of SUSPECT) {
      const m = ln.match(rx);
      if (m) hits.push({ line: i + 1, hit: m.join('  '), text: ln.trim().slice(0, 90) });
    }
  }
  if (hits.length) {
    total += hits.length;
    console.log(`\n${file} — ${hits.length} hand-typed value(s) to review:`);
    for (const h of hits) console.log(`  L${h.line}: ${h.hit}   ·   ${h.text}`);
  }
}
console.log(total ? `\n⚠ ${total} candidate(s). Bind each to a data file, make it qualitative, or confirm it's a stable constant.\n` : '\n✓ No unbound hand-typed values found in tile/exhibit positions.\n');
